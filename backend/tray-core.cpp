#include "tray-core.h"

#include <shellapi.h>
#include <process.h>

#include <string>
#include <vector>
#include <cstring>

#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")

// 源码含中文菜单文本，显式按 UTF-8 解析，避免 C4819 与乱码
#pragma execution_character_set("utf-8")

namespace {

const UINT_PTR IDT_STATE_POLL = 1;
const UINT_PTR IDT_TRAY_ATTACH_RETRY = 2;
const UINT STATE_POLL_INTERVAL_MS = 1000;
const UINT TRAY_ATTACH_RETRY_MS = 2000;

// 共享内存里的状态快照：托盘写状态，主程序读状态并读取待处理命令
struct StateBlock {
    DWORD version;
    DWORD visible;
    DWORD autoStart;
};

const DWORD STATE_BLOCK_VERSION = 1;

std::wstring ReadTextFile(const std::wstring& path) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return std::wstring();
    LARGE_INTEGER size = {};
    if (!GetFileSizeEx(file, &size) || size.QuadPart <= 0 || size.QuadPart > 4096) {
        CloseHandle(file);
        return std::wstring();
    }
    std::string data(static_cast<size_t>(size.QuadPart), '\0');
    DWORD read = 0;
    const bool ok = ReadFile(file, data.data(), static_cast<DWORD>(data.size()), &read, nullptr) != FALSE;
    CloseHandle(file);
    if (!ok) return std::wstring();
    data.resize(read);
    while (!data.empty() && (data.back() == '\r' || data.back() == '\n' || data.back() == ' ')) data.pop_back();
    if (data.empty()) return std::wstring();
    const int length = MultiByteToWideChar(CP_UTF8, 0, data.c_str(), static_cast<int>(data.size()), nullptr, 0);
    if (length <= 0) return std::wstring();
    std::wstring text(static_cast<size_t>(length), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, data.c_str(), static_cast<int>(data.size()), text.data(), length);
    return text;
}

std::wstring JoinPath(const std::wstring& base, const std::wstring& name) {
    if (base.empty()) return name;
    const wchar_t last = base.back();
    return last == L'\\' || last == L'/' ? base + name : base + L"\\" + name;
}

std::wstring GetModulePath() {
    std::vector<wchar_t> buffer(MAX_PATH);
    for (;;) {
        const DWORD length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
        if (length == 0) return std::wstring();
        if (length < buffer.size()) return std::wstring(buffer.data(), length);
        buffer.resize(buffer.size() * 2);
    }
}

std::wstring GetAppDirectory() {
    const std::wstring path = GetModulePath();
    const size_t slash = path.find_last_of(L"\\/");
    return slash == std::wstring::npos ? std::wstring() : path.substr(0, slash);
}

std::wstring GetDefaultIconPath() {
    const std::wstring directory = GetAppDirectory();
    const wchar_t* names[] = { L"tray.ico", L"app.ico" };
    for (const wchar_t* name : names) {
        const std::wstring candidate = JoinPath(directory, name);
        if (GetFileAttributesW(candidate.c_str()) != INVALID_FILE_ATTRIBUTES) return candidate;
    }
    const std::wstring resources = JoinPath(directory, L"www");
    for (const wchar_t* name : names) {
        const std::wstring candidate = JoinPath(resources, name);
        if (GetFileAttributesW(candidate.c_str()) != INVALID_FILE_ATTRIBUTES) return candidate;
    }
    return std::wstring();
}

HANDLE debugLogFile = INVALID_HANDLE_VALUE;

// 诊断日志：同时写调试输出与 exe 同目录的 classbroom-tray.log，便于排查图标不显示
void TrayLog(const wchar_t* message) {
    OutputDebugStringW(message);
    OutputDebugStringW(L"\n");
    if (debugLogFile == INVALID_HANDLE_VALUE) {
        const std::wstring directory = GetAppDirectory();
        if (directory.empty()) return;
        const std::wstring path = JoinPath(directory, L"classbroom-tray.log");
        debugLogFile = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE,
            nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (debugLogFile == INVALID_HANDLE_VALUE) return;
    }
    SYSTEMTIME time = {};
    GetLocalTime(&time);
    wchar_t line[512] = {};
    _snwprintf_s(line, _TRUNCATE, L"[%02u:%02u:%02u] %s\r\n",
        time.wHour, time.wMinute, time.wSecond, message);
    DWORD written = 0;
    WriteFile(debugLogFile, line, static_cast<DWORD>(wcslen(line) * sizeof(wchar_t)), &written, nullptr);
}

}  // namespace

TrayHost::~TrayHost() {
    stopPipeServer();
    removeIcon();
    if (icon_ && ownsIcon_) DestroyIcon(icon_);
    if (stateView_) UnmapViewOfFile(stateView_);
    if (stateMap_) CloseHandle(stateMap_);
    if (debugLogFile != INVALID_HANDLE_VALUE) CloseHandle(debugLogFile);
}

static const UINT TASKBAR_CREATED_MESSAGE = RegisterWindowMessageW(L"TaskbarCreated");

void TrayHost::loadIcon() {
    if (icon_ && iconValid_) return;
    if (icon_ && ownsIcon_) DestroyIcon(icon_);
    icon_ = nullptr;
    ownsIcon_ = false;
    iconValid_ = false;
    std::wstring iconPath = options_.iconPath;
    if (iconPath.empty()) iconPath = GetDefaultIconPath();
    if (!iconPath.empty()) {
        // 小尺寸优先命中 16/24px，避免高清屏上被缩放成模糊图块
        icon_ = static_cast<HICON>(LoadImageW(nullptr, iconPath.c_str(), IMAGE_ICON,
            GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_LOADFROMFILE));
        if (!icon_) {
            icon_ = static_cast<HICON>(LoadImageW(nullptr, iconPath.c_str(), IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE));
        }
        ownsIcon_ = icon_ != nullptr;
        if (!icon_) TrayLog((L"[tray] 图标文件加载失败: " + iconPath).c_str());
    } else {
        TrayLog(L"[tray] 未找到可用图标文件，回退到系统默认图标");
    }
    if (!icon_) {
        icon_ = LoadIconW(nullptr, MAKEINTRESOURCEW(32512));
        ownsIcon_ = false;
    }
    iconValid_ = icon_ != nullptr;
    if (!iconValid_) TrayLog(L"[tray] 连系统默认图标也无法加载，托盘图标将缺省");
}

// 仅向系统托盘添加一次，不重复 NIM_ADD，避免残留幽灵图标
bool TrayHost::shellAddIcon() {
    if (!hwnd_) return false;
    loadIcon();

    // 不使用 GUID 标识，改用 hWnd + uID。GUID 一旦指向已失效的旧窗口（例如上次未移除的
    // 残留项），NIM_ADD 会永久失败，表现为托盘里根本没有这个图标。
    NOTIFYICONDATAW data = {};
    data.cbSize = sizeof(data);
    data.hWnd = hwnd_;
    data.uID = TRAY_ICON_ID;
    data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_SHOWTIP;
    data.uCallbackMessage = WM_TRAYICON_MSG;
    data.hIcon = icon_ ? icon_ : LoadIconW(nullptr, MAKEINTRESOURCEW(32512));
    lstrcpynW(data.szTip, TRAY_WINDOW_TITLE, ARRAYSIZE(data.szTip));

    // 先清掉可能残留的同 ID 项，避免 NIM_ADD 回 E_FAIL 后图标永远不出现
    Shell_NotifyIconW(NIM_DELETE, &data);

    bool added = Shell_NotifyIconW(NIM_ADD, &data) != FALSE;
    if (!added) {
        // 资源管理器刚重启时常见失败，短暂重试几次
        for (int attempt = 0; attempt < 10 && !added; ++attempt) {
            Sleep(120);
            added = Shell_NotifyIconW(NIM_ADD, &data) != FALSE;
        }
    }
    if (!added) {
        wchar_t message[160] = {};
        _snwprintf_s(message, _TRUNCATE, L"[tray] Shell_NotifyIcon(NIM_ADD) 失败, GetLastError=%lu, hIcon=%p",
            GetLastError(), static_cast<void*>(data.hIcon));
        TrayLog(message);
        return false;
    }

    // SETVERSION 必须在图标已加入之后调用；即使失败也不影响图标本身
    data.uVersion = NOTIFYICON_VERSION_4;
    Shell_NotifyIconW(NIM_SETVERSION, &data);
    workingSet_ = true;
    refreshTooltip();
    return true;
}

void TrayHost::removeIcon() {
    if (!hwnd_ || !workingSet_) return;
    NOTIFYICONDATAW data = {};
    data.cbSize = sizeof(data);
    data.hWnd = hwnd_;
    data.uID = TRAY_ICON_ID;
    Shell_NotifyIconW(NIM_DELETE, &data);
    workingSet_ = false;
}

void TrayHost::refreshTooltip() {
    if (!hwnd_ || !workingSet_) return;
    NOTIFYICONDATAW data = {};
    data.cbSize = sizeof(data);
    data.hWnd = hwnd_;
    data.uID = TRAY_ICON_ID;
    data.uFlags = NIF_TIP;
    lstrcpynW(data.szTip, TRAY_WINDOW_TITLE, ARRAYSIZE(data.szTip));
    Shell_NotifyIconW(NIM_MODIFY, &data);
}

bool TrayHost::start() {
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = &TrayHost::windowProc;
    wc.hInstance = GetModuleHandleW(nullptr);
    wc.lpszClassName = TRAY_WINDOW_CLASS;
    if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) return false;

    // 用普通隐藏窗口而非 HWND_MESSAGE：部分 Explorer 版本会忽略消息窗口的托盘回调
    hwnd_ = CreateWindowExW(WS_EX_TOOLWINDOW, TRAY_WINDOW_CLASS, TRAY_WINDOW_TITLE, WS_POPUP,
        0, 0, 0, 0, nullptr, nullptr, GetModuleHandleW(nullptr), this);
    if (!hwnd_) return false;

    // 资源管理器尚未就绪时先放行，等 TaskbarCreated 消息或定时器重试补挂
    if (!shellAddIcon()) {
        TrayLog(L"[tray] 启动阶段挂载图标失败，等待 TaskbarCreated 或重试定时器");
    }
    loadState();
    writeState(state_);
    startPipeServer();

    SetTimer(hwnd_, IDT_STATE_POLL, STATE_POLL_INTERVAL_MS, nullptr);
    // 独立的重试定时器：探壳未就绪时不会发 TaskbarCreated，必须自己周期性补挂图标
    SetTimer(hwnd_, IDT_TRAY_ATTACH_RETRY, TRAY_ATTACH_RETRY_MS, nullptr);
    return true;
}

int TrayHost::runUntilQuit() {
    MSG msg;
    while (!exiting_ && GetMessageW(&msg, nullptr, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    stopPipeServer();
    removeIcon();
    return 0;
}

LRESULT CALLBACK TrayHost::windowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (msg == WM_NCCREATE) {
        auto* create = reinterpret_cast<CREATESTRUCTW*>(lParam);
        auto* self = static_cast<TrayHost*>(create->lpCreateParams);
        self->hwnd_ = hwnd;
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
        return DefWindowProcW(hwnd, msg, wParam, lParam);
    }
    auto* self = reinterpret_cast<TrayHost*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    if (!self) return DefWindowProcW(hwnd, msg, wParam, lParam);
    return self->handleMessage(msg, wParam, lParam);
}

LRESULT TrayHost::handleMessage(UINT msg, WPARAM wParam, LPARAM lParam) {
    if (msg == TASKBAR_CREATED_MESSAGE) {
        // 资源管理器重启后旧图标全部失效，需要重新挂载
        workingSet_ = false;
        shellAddIcon();
        return 0;
    }
    switch (msg) {
        case WM_TRAYICON_MSG:
            // 兼容 v3/v4 两种回调：v4 把事件类型放在 LOWORD(lParam)
            if (LOWORD(lParam) == WM_RBUTTONUP || LOWORD(lParam) == WM_CONTEXTMENU) {
                if (!workingSet_) shellAddIcon();
                showMenu();
            } else if (LOWORD(lParam) == WM_LBUTTONDBLCLK) {
                showMainWindow();
            }
            return 0;
        case WM_TIMER:
            if (wParam == IDT_STATE_POLL) {
                applyState();
            } else if (wParam == IDT_TRAY_ATTACH_RETRY && !workingSet_) {
                // 图标尚未挂上时持续重试，避免探壳后起来导致永久无图标
                shellAddIcon();
            }
            return 0;
        // 管道线程转发的状态与命令，统一切回 UI 线程处理
        case WM_APP + 2:
            setState(wParam != 0, lParam != 0);
            return 0;
        case WM_APP + 3:
            executeCommand(static_cast<int>(wParam));
            return 0;
        default:
            return DefWindowProcW(hwnd_, msg, wParam, lParam);
    }
}

void TrayHost::loadState() {
    // 优先读取主程序写入的共享内存状态
    if (options_.stateName.empty()) return;
    HANDLE map = OpenFileMappingW(FILE_MAP_READ, FALSE, options_.stateName.c_str());
    if (map) {
        const void* view = MapViewOfFile(map, FILE_MAP_READ, 0, 0, sizeof(StateBlock));
        if (view) {
            const auto* block = static_cast<const StateBlock*>(view);
            if (block->version == STATE_BLOCK_VERSION) {
                state_.visible = block->visible != 0;
                state_.autoStart = block->autoStart != 0;
            }
            UnmapViewOfFile(view);
        }
        CloseHandle(map);
        return;
    }
    // 回退到旧版文本状态文件，保证升级期间显示状态正确
    if (options_.stateFile.empty()) return;
    const std::wstring text = ReadTextFile(options_.stateFile);
    if (text.empty()) return;
    if (text.rfind(L"hidden", 0) == 0) state_.visible = false;
    else if (text.rfind(L"visible", 0) == 0) state_.visible = true;
    if (text.find(L"autostart=1") != std::wstring::npos) state_.autoStart = true;
    else if (text.find(L"autostart=0") != std::wstring::npos) state_.autoStart = false;
}

void TrayHost::applyState() {
    loadState();
}

void TrayHost::writeState(const TrayState& state) {
    if (options_.stateName.empty()) return;
    if (!stateMap_) {
        stateMap_ = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, sizeof(StateBlock),
            options_.stateName.c_str());
        if (!stateMap_) return;
        stateView_ = MapViewOfFile(stateMap_, FILE_MAP_WRITE, 0, 0, sizeof(StateBlock));
    }
    if (!stateView_) return;
    auto* block = static_cast<StateBlock*>(stateView_);
    block->version = STATE_BLOCK_VERSION;
    block->visible = state.visible ? 1 : 0;
    block->autoStart = state.autoStart ? 1 : 0;
}

// 把菜单动作追加到事件队列文件，由主程序轮询消费
void TrayHost::notifyApp(int command) {
    if (options_.notifyFile.empty()) return;
    const char* text = command == TRAY_CMD_SETTINGS ? "settings"
        : command == TRAY_CMD_REFRESH ? "refresh"
        : command == TRAY_CMD_CHECK_UPDATE ? "check-update"
        : command == TRAY_CMD_AUTOSTART ? "autostart"
        : command == TRAY_CMD_EXIT ? "exit"
        : nullptr;
    if (!text) return;
    HANDLE file = CreateFileW(options_.notifyFile.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return;
    std::string line(text);
    line += "\n";
    DWORD written = 0;
    WriteFile(file, line.data(), static_cast<DWORD>(line.size()), &written, nullptr);
    CloseHandle(file);
}

void TrayHost::startPipeServer() {
    if (options_.pipeName.empty()) return;
    pipeStop_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    InterlockedExchange(&pipeRunning_, 1);
    pipeThread_ = reinterpret_cast<HANDLE>(_beginthreadex(nullptr, 0, &TrayHost::pipeThreadEntry, this, 0, nullptr));
}

void TrayHost::stopPipeServer() {
    if (InterlockedExchange(&pipeRunning_, 0) == 0) return;
    if (pipeStop_) SetEvent(pipeStop_);
    if (pipe_) {
        // 断开连接让正在阻塞的 ReadFile 立即返回，线程随后观察到退出标志
        DisconnectNamedPipe(pipe_);
        CancelIoEx(pipe_, nullptr);
    }
    if (pipeThread_) {
        WaitForSingleObject(pipeThread_, 1500);
        CloseHandle(pipeThread_);
        pipeThread_ = nullptr;
    }
    if (pipe_) {
        CloseHandle(pipe_);
        pipe_ = INVALID_HANDLE_VALUE;
    }
    if (pipeStop_) {
        CloseHandle(pipeStop_);
        pipeStop_ = nullptr;
    }
}

unsigned __stdcall TrayHost::pipeThreadEntry(void* context) {
    static_cast<TrayHost*>(context)->pipeLoop();
    return 0;
}

void TrayHost::pipeLoop() {
    const std::wstring fullName = L"\\\\.\\pipe\\" + options_.pipeName;
    std::string buffer;
    while (InterlockedCompareExchange(&pipeRunning_, 1, 1) == 1) {
        pipe_ = CreateNamedPipeW(fullName.c_str(), PIPE_ACCESS_INBOUND,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT, 1, 0, 4096, 0, nullptr);
        if (pipe_ == INVALID_HANDLE_VALUE) {
            if (WaitForSingleObject(pipeStop_, 200) == WAIT_OBJECT_0) break;
            continue;
        }

        const bool connected = ConnectNamedPipe(pipe_, nullptr) != FALSE || GetLastError() == ERROR_PIPE_CONNECTED;
        if (!connected) {
            CloseHandle(pipe_);
            pipe_ = INVALID_HANDLE_VALUE;
            if (WaitForSingleObject(pipeStop_, 100) == WAIT_OBJECT_0) break;
            continue;
        }

        buffer.clear();
        char chunk[512];
        DWORD read = 0;
        while (ReadFile(pipe_, chunk, sizeof(chunk), &read, nullptr) && read > 0) {
            buffer.append(chunk, read);
            // 单条消息以换行结束；限制长度避免异常客户端撑爆内存
            if (buffer.size() > 64 * 1024) buffer.clear();
        }
        FlushFileBuffers(pipe_);
        DisconnectNamedPipe(pipe_);
        CloseHandle(pipe_);
        pipe_ = INVALID_HANDLE_VALUE;

        if (!buffer.empty()) handlePipeMessage(buffer);
        if (WaitForSingleObject(pipeStop_, 0) == WAIT_OBJECT_0) break;
    }
}

void TrayHost::handlePipeMessage(const std::string& message) {
    const int length = MultiByteToWideChar(CP_UTF8, 0, message.c_str(), static_cast<int>(message.size()), nullptr, 0);
    if (length <= 0) return;
    std::wstring text(static_cast<size_t>(length), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, message.c_str(), static_cast<int>(message.size()), text.data(), length);

    size_t start = 0;
    while (start <= text.size()) {
        const size_t end = text.find_first_of(L"\r\n", start);
        const std::wstring line = text.substr(start, end == std::wstring::npos ? std::wstring::npos : end - start);
        start = end == std::wstring::npos ? text.size() + 1 : end + 1;
        if (line.empty()) continue;

        if (line.rfind(L"state ", 0) == 0) {
            // 形如 "state visible autostart=1" 或 "state hidden autostart=0"
            const std::wstring body = line.substr(6);
            const bool visible = body.find(L"visible") != std::wstring::npos;
            const bool autoStart = body.find(L"autostart=1") != std::wstring::npos;
            // 状态更新必须在 UI 线程执行，否则与菜单读取产生竞争
            PostMessageW(hwnd_, WM_APP + 2, visible ? 1 : 0, autoStart ? 1 : 0);
            continue;
        }
        int command = 0;
        if (line == L"show") command = TRAY_CMD_SHOW;
        else if (line == L"hide") command = TRAY_CMD_HIDE;
        else if (line == L"settings") command = TRAY_CMD_SETTINGS;
        else if (line == L"refresh") command = TRAY_CMD_REFRESH;
        else if (line == L"check-update") command = TRAY_CMD_CHECK_UPDATE;
        else if (line == L"autostart") command = TRAY_CMD_AUTOSTART;
        else if (line == L"exit") command = TRAY_CMD_EXIT;
        if (command) PostMessageW(hwnd_, WM_APP + 3, static_cast<WPARAM>(command), 0);
    }
}

void TrayHost::setState(bool visible, bool autoStart) {
    state_.visible = visible;
    state_.autoStart = autoStart;
    writeState(state_);
    refreshTooltip();
}

void TrayHost::showMainWindow() {
    setState(true, state_.autoStart);
}

void TrayHost::hideMainWindow() {
    setState(false, state_.autoStart);
}

void TrayHost::quitApplication() {
    exiting_ = true;
    PostQuitMessage(0);
}

void TrayHost::showMenu() {
    HMENU menu = CreatePopupMenu();
    if (!menu) return;

    AppendMenuW(menu, MF_STRING | (state_.visible ? MF_GRAYED : 0), TRAY_CMD_SHOW, L"显示主界面");
    AppendMenuW(menu, MF_STRING | (state_.visible ? 0 : MF_GRAYED), TRAY_CMD_HIDE, L"隐藏主界面");
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING, TRAY_CMD_SETTINGS, L"设置");
    AppendMenuW(menu, MF_STRING, TRAY_CMD_REFRESH, L"刷新");
    AppendMenuW(menu, MF_STRING, TRAY_CMD_CHECK_UPDATE, L"检查更新");
    AppendMenuW(menu, MF_STRING | (state_.autoStart ? MF_CHECKED : MF_UNCHECKED), TRAY_CMD_AUTOSTART, L"开机自启");
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING, TRAY_CMD_EXIT, L"退出");

    if (!SetForegroundWindow(hwnd_)) {
        // 前台窗口失败时仍允许弹出菜单，避免托盘右键无响应
        PostMessageW(hwnd_, WM_NULL, 0, 0);
    }

    POINT cursor = {};
    GetCursorPos(&cursor);
    const UINT flags = TPM_RIGHTBUTTON | TPM_RETURNCMD | TPM_NONOTIFY;
    const UINT command = static_cast<UINT>(TrackPopupMenuEx(menu, flags, cursor.x, cursor.y, hwnd_, nullptr));
    PostMessageW(hwnd_, WM_NULL, 0, 0);
    DestroyMenu(menu);

    if (command) executeCommand(static_cast<int>(command));
}

void TrayHost::executeCommand(int command) {
    switch (command) {
        case TRAY_CMD_SHOW: showMainWindow(); break;
        case TRAY_CMD_HIDE: hideMainWindow(); break;
        case TRAY_CMD_AUTOSTART:
            // 主程序负责写入/删除开机启动项，托盘只翻转勾选状态
            setState(state_.visible, !state_.autoStart);
            notifyApp(TRAY_CMD_AUTOSTART);
            break;
        case TRAY_CMD_EXIT:
            // 退出由主程序统一处理（保存状态、结束自身），托盘只负责移除图标
            removeIcon();
            notifyApp(TRAY_CMD_EXIT);
            quitApplication();
            break;
        default:
            // 设置/刷新/检查更新需要主程序处理，托盘侧只负责维持图标与状态
            notifyApp(command);
            break;
    }
}
