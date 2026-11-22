#pragma once

#include <windows.h>
#include <string>

// 托盘宿主进程自行管理图标、菜单、状态与动作：
// 主程序只通过命名管道下发命令，托盘侧再把状态写回共享内存，避免文本文件轮询。
struct TrayOptions {
    std::wstring stateFile;     // 兼容旧版：主程序写入的状态文件
    std::wstring iconPath;      // 可选的托盘图标路径
    std::wstring pipeName;      // JS 写入命令的命名管道
    std::wstring notifyFile;    // 托盘向主程序追加事件的文件
    std::wstring stateName;     // 共享内存名，保存状态快照
    std::wstring appPath;       // 主程序可执行文件（显示/隐藏/退出用）
};

inline const wchar_t* TRAY_WINDOW_CLASS = L"ClassBroomTrayHost";
inline const wchar_t* TRAY_WINDOW_TITLE = L"ClassBroom 托盘";
inline const UINT TRAY_ICON_ID = 1;
inline const UINT WM_TRAYICON_MSG = WM_APP + 1;

enum TrayCommand : int {
    TRAY_CMD_SHOW = 1,
    TRAY_CMD_HIDE = 2,
    TRAY_CMD_SETTINGS = 3,
    TRAY_CMD_REFRESH = 4,
    TRAY_CMD_CHECK_UPDATE = 5,
    TRAY_CMD_AUTOSTART = 6,
    TRAY_CMD_EXIT = 7
};

struct TrayState {
    bool visible = true;
    bool autoStart = false;
};

class TrayHost {
public:
    explicit TrayHost(TrayOptions options) : options_(std::move(options)) {}
    ~TrayHost();

    bool start();
    int runUntilQuit();

private:
    static LRESULT CALLBACK windowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
    LRESULT handleMessage(UINT msg, WPARAM wParam, LPARAM lParam);

    void loadIcon();
    bool shellAddIcon();
    void removeIcon();
    void refreshTooltip();
    void loadState();
    void applyState();
    void setState(bool visible, bool autoStart);
    void writeState(const TrayState& state);
    void notifyApp(int command);
    void showMenu();
    void executeCommand(int command);

    void startPipeServer();
    void stopPipeServer();
    static unsigned __stdcall pipeThreadEntry(void* context);
    void pipeLoop();
    void handlePipeMessage(const std::string& message);

    void showMainWindow();
    void hideMainWindow();
    void quitApplication();

    TrayOptions options_;
    TrayState state_;
    HWND hwnd_ = nullptr;
    HICON icon_ = nullptr;
    bool ownsIcon_ = false;
    bool iconValid_ = false;
    bool workingSet_ = false;
    bool exiting_ = false;

    HANDLE pipe_ = INVALID_HANDLE_VALUE;
    HANDLE pipeStop_ = nullptr;
    HANDLE pipeThread_ = nullptr;
    volatile LONG pipeRunning_ = 0;

    HANDLE stateMap_ = nullptr;
    void* stateView_ = nullptr;
};
