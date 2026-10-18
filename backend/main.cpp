#include <iostream>
#include <string>
#include <windows.h>
#include <winhttp.h>

#pragma comment(lib, "winhttp.lib")

std::wstring StringToWString(const std::string& str) {
    if (str.empty()) return std::wstring();
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
    std::wstring wstrTo(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
    return wstrTo;
}

std::string HttpGet(const std::wstring& host, const std::wstring& path, const std::wstring& apiKey) {
    HINTERNET hSession = WinHttpOpen(L"ClassBroom/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return "";
    
    // 设置超时：解析 2秒，连接 2秒，发送 2秒，接收 2秒。防止无限卡死崩溃
    WinHttpSetTimeouts(hSession, 2000, 2000, 2000, 2000);

    HINTERNET hConnect = WinHttpConnect(hSession, host.c_str(), INTERNET_DEFAULT_HTTPS_PORT, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); return ""; }
    
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"GET", path.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE);
    if (!hRequest) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return ""; }

    // 智能判断认证方式
    std::wstring headers = L"";
    if (apiKey.find(L'.') != std::wstring::npos) {
        headers = L"Authorization: Bearer " + apiKey + L"\r\n";
    } else {
        headers = L"X-QW-Api-Key: " + apiKey + L"\r\n";
    }
    WinHttpAddRequestHeaders(hRequest, headers.c_str(), -1L, WINHTTP_ADDREQ_FLAG_ADD);

    std::string response;
    if (WinHttpSendRequest(hRequest, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) &&
        WinHttpReceiveResponse(hRequest, nullptr)) {
        DWORD size = 0;
        do {
            if (!WinHttpQueryDataAvailable(hRequest, &size) || size == 0) break;
            std::string buffer(size, 0);
            DWORD downloaded = 0;
            if (WinHttpReadData(hRequest, &buffer[0], size, &downloaded)) response.append(buffer.data(), downloaded);
            else break;
        } while (size > 0);
    }
    WinHttpCloseHandle(hRequest); WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession);
    return response;
}

std::string ExtractValue(const std::string& json, const std::string& key) {
    std::string searchKey = "\"" + key + "\":\"";
    size_t pos = json.find(searchKey);
    if (pos == std::string::npos) return "";
    pos += searchKey.length();
    size_t end = json.find('"', pos);
    if (end == std::string::npos) return "";
    return json.substr(pos, end - pos);
}

int main(int argc, char* argv[]) {
    try {
        if (argc < 4) {
            std::cout << R"({"error":"参数不足"})" << std::endl;
            return 0;
        }

        std::string apiKey = argv[1];
        std::string location = argv[2];
        std::string apiHost = argv[3];

        size_t commaPos = location.find(',');
        std::string lon = (commaPos != std::string::npos) ? location.substr(0, commaPos) : "116.41";
        std::string lat = (commaPos != std::string::npos) ? location.substr(commaPos + 1) : "39.92";

        std::wstring host = StringToWString(apiHost);
        std::wstring wApiKey = StringToWString(apiKey);

        std::wstring weatherPath = L"/weather/v1/current/" + StringToWString(lat) + L"/" + StringToWString(lon);
        std::string weatherJson = HttpGet(host, weatherPath, wApiKey);
        
        if (weatherJson.empty() || weatherJson.find("\"code\"") != std::string::npos) {
             std::cout << R"({"error":"网络或认证失败"})" << std::endl;
             return 0;
        }

        std::string temp = "--°", text = "未知";
        std::string t = ExtractValue(weatherJson, "value");
        std::string tx = ExtractValue(weatherJson, "text");
        if (!t.empty()) temp = t.substr(0, t.find('.')) + "°";
        if (!tx.empty()) text = tx;

        // 预警暂不处理，直接返回空
        std::string json = R"({"weather":{"temp":")" + temp + R"(","desc":")" + text + R"("},"warning":{"hasWarning":false,"event":""}})";
        std::cout << json << std::endl;
        
    } catch (...) {
        std::cout << R"({"error":"后端崩溃"})" << std::endl;
    }
    return 0;
}