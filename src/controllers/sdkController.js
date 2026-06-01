const Application = require('../models/Application');
const { notFound, serverError } = require('../utils/apiResponse');

/**
 * GET /api/sdk/generate/:appId
 * Generate C++ SDK with skCrypt-obfuscated credentials (Vahalla-style)
 */
const generateSDK = async (req, res) => {
  try {
    const { appId } = req.params;

    const app = await Application.findOne({
      $or: [
        { _id: appId.match(/^[0-9a-fA-F]{24}$/) ? appId : null },
        { appId },
      ],
      ownerId: req.user._id,
    }).select('+appSecret');

    if (!app) return notFound(res, 'Application not found');

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    // Extract host from URL for WinHTTP
    const urlObj = (() => { try { return new URL(apiUrl); } catch { return { hostname: 'localhost', port: '5000', protocol: 'http:' }; } })();
    const apiHost = urlObj.hostname;
    const apiPort = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    const useHttps = urlObj.protocol === 'https:';

    const skCryptHeader = generateSkCryptHeader();
    const authHeader = generateAuthHeader(app, apiHost, apiPort, useHttps);
    const authCpp = generateAuthCpp(app, apiHost, apiPort, useHttps);

    res.status(200).json({
      success: true,
      message: 'SDK generated successfully',
      data: {
        appName: app.name,
        appId: app.appId,
        files: {
          'skCrypt.h': skCryptHeader,
          'Auth.h': authHeader,
          'Auth.cpp': authCpp,
        },
      },
    });
  } catch (err) {
    console.error('generateSDK error:', err);
    return serverError(res, 'SDK generation failed');
  }
};

/**
 * Generate skCrypt.h — compile-time string obfuscation (like Vahalla)
 */
const generateSkCryptHeader = () => {
  return `#pragma once
// skCrypt - Compile-time string obfuscation
// Prevents credentials from appearing as plain text in the binary
// Usage: skCrypt("my string").decrypt()

#include <array>
#include <cstdint>

namespace detail {
    template<typename T>
    struct skCryptImpl {
        const T* data;
        std::size_t size;
        uint8_t key;

        constexpr skCryptImpl(const T* str, std::size_t n, uint8_t k)
            : data(str), size(n), key(k) {}

        std::basic_string<T> decrypt() const {
            std::basic_string<T> result(size - 1, T(0));
            for (std::size_t i = 0; i < size - 1; ++i) {
                result[i] = static_cast<T>(static_cast<uint8_t>(data[i]) ^ (key + i));
            }
            return result;
        }
    };

    template<std::size_t N>
    struct skCryptStr {
        char encrypted[N];
        uint8_t key;
        std::size_t size;

        constexpr skCryptStr(const char (&str)[N], uint8_t k) : encrypted{}, key(k), size(N) {
            for (std::size_t i = 0; i < N; ++i) {
                encrypted[i] = static_cast<char>(static_cast<uint8_t>(str[i]) ^ (k + i));
            }
        }

        std::string decrypt() const {
            std::string result(size - 1, '\\0');
            for (std::size_t i = 0; i < size - 1; ++i) {
                result[i] = static_cast<char>(static_cast<uint8_t>(encrypted[i]) ^ (key + i));
            }
            return result;
        }
    };
}

#define skCrypt(str) ([]() constexpr { \\
    constexpr auto impl = detail::skCryptStr<sizeof(str)>(str, 0x4B); \\
    return impl; \\
}())
`;
};

/**
 * Generate Auth.h
 */
const generateAuthHeader = (app, apiHost, apiPort, useHttps) => {
  return `#pragma once
// ============================================================
//  AuthPlatform C++ SDK - Auto-Generated
//  Application : ${app.name}
//  Generated   : ${new Date().toISOString()}
//
//  !! DO NOT COMMIT Auth.cpp — it contains your credentials !!
//  Add Auth.cpp to .gitignore
// ============================================================

#ifndef AUTHPLATFORM_AUTH_H
#define AUTHPLATFORM_AUTH_H

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <winhttp.h>
#include <string>
#pragma comment(lib, "winhttp.lib")

namespace AuthPlatform {

struct LicenseInfo {
    std::string key;
    std::string status;
    std::string expiresAt;
    std::string subscriptionName;
    int         subscriptionLevel = 0;
    bool        isLifetime = false;
};

struct UserInfo {
    std::string username;
    std::string status;
    std::string expiresAt;
    std::string ip;
};

class Auth {
public:
    Auth();
    ~Auth();

    // Authenticate with an active license key
    bool LoginWithLicense(const std::string& licenseKey, const std::string& hwid = "");

    // Activate an unused license key and create account
    bool ActivateLicense(const std::string& licenseKey,
                         const std::string& username,
                         const std::string& password,
                         const std::string& hwid = "");

    // Check license validity without creating a session
    bool CheckLicense(const std::string& licenseKey);

    // Get a remote variable value by name
    std::string GetVariable(const std::string& name);

    // Get current machine HWID
    std::string GetHWID();

    // Override auto-detected HWID
    void SetHWID(const std::string& hwid);

    // Returns true if authenticated
    bool IsAuthenticated() const;

    // Returns true if account/HWID is banned
    bool IsBanned() const;

    // Get last error message
    std::string GetLastError() const;

    // Get license info after successful login
    LicenseInfo GetLicenseInfo() const;

    // Get user info after successful login
    UserInfo GetUserInfo() const;

    // Set request timeout in ms (default: 10000)
    void SetTimeout(DWORD ms);

private:
    std::string   m_appId;
    std::string   m_appSecret;
    std::wstring  m_apiHost;
    std::wstring  m_apiBase;
    INTERNET_PORT m_port;
    bool          m_useHttps;
    std::string   m_hwid;
    std::string   m_lastError;
    bool          m_authenticated;
    bool          m_banned;
    DWORD         m_timeout;
    LicenseInfo   m_licenseInfo;
    UserInfo      m_userInfo;

    std::string  HttpPost(const std::wstring& path, const std::string& body);
    std::string  HttpGet(const std::wstring& path);
    std::string  GenerateHWID();
    std::wstring ToWide(const std::string& s);
    std::string  ToNarrow(const std::wstring& s);
    std::string  UrlEncode(const std::string& s);
    void         ParseLoginResponse(const std::string& json);
};

} // namespace AuthPlatform
#endif // AUTHPLATFORM_AUTH_H
`;
};

/**
 * Generate Auth.cpp with skCrypt-obfuscated credentials
 */
const generateAuthCpp = (app, apiHost, apiPort, useHttps) => {
  return `// ============================================================
//  AuthPlatform C++ SDK - Implementation
//  Application : ${app.name}
//  Generated   : ${new Date().toISOString()}
//
//  !! KEEP THIS FILE PRIVATE — contains APP_ID and APP_SECRET !!
//  Add to .gitignore: Auth.cpp
//
//  Requirements:
//    - Visual Studio 2019+ / C++17
//    - Windows SDK (WinHTTP built-in)
//    - nlohmann/json (header-only: https://github.com/nlohmann/json)
//    - skCrypt.h (included in this SDK)
// ============================================================

#include "Auth.h"
#include "skCrypt.h"
#include <nlohmann/json.hpp>
#include <sstream>
#include <iomanip>
#include <intrin.h>

#pragma comment(lib, "winhttp.lib")

using json = nlohmann::json;

// ── Obfuscated credentials (skCrypt prevents plain-text in binary) ──
// These strings are XOR-encrypted at compile time
static const auto _appId     = skCrypt("${app.appId}");
static const auto _appSecret = skCrypt("${app.appSecret}");
static const auto _apiHost   = skCrypt("${apiHost}");
static const auto _apiBase   = skCrypt("/api");
// ────────────────────────────────────────────────────────────────────

namespace AuthPlatform {

Auth::Auth()
    : m_authenticated(false)
    , m_banned(false)
    , m_timeout(10000)
    , m_port(static_cast<INTERNET_PORT>(${apiPort}))
    , m_useHttps(${useHttps ? 'true' : 'false'})
{
    // Decrypt credentials at runtime
    m_appId    = _appId.decrypt();
    m_appSecret = _appSecret.decrypt();
    m_apiHost  = ToWide(_apiHost.decrypt());
    m_apiBase  = ToWide(_apiBase.decrypt());
    m_hwid     = GenerateHWID();
}

Auth::~Auth() {}

bool Auth::LoginWithLicense(const std::string& licenseKey, const std::string& hwid) {
    m_authenticated = false;
    m_banned = false;
    const std::string& h = hwid.empty() ? m_hwid : hwid;

    json body;
    body["licenseKey"] = licenseKey;
    body["hwid"]       = h;

    auto response = HttpPost(m_apiBase + L"/licenses/login", body.dump());
    if (response.empty()) return false;

    try {
        auto resp = json::parse(response);
        if (resp.value("success", false)) {
            m_authenticated = true;
            ParseLoginResponse(response);
            return true;
        }
        m_lastError = resp.value("message", "Authentication failed");
        if (m_lastError.find("banned") != std::string::npos) m_banned = true;
    } catch (const std::exception& e) {
        m_lastError = std::string("Parse error: ") + e.what();
    }
    return false;
}

bool Auth::ActivateLicense(const std::string& licenseKey,
                            const std::string& username,
                            const std::string& password,
                            const std::string& hwid)
{
    m_authenticated = false;
    const std::string& h = hwid.empty() ? m_hwid : hwid;

    json body;
    body["licenseKey"] = licenseKey;
    body["username"]   = username;
    body["password"]   = password;
    body["hwid"]       = h;

    auto response = HttpPost(m_apiBase + L"/licenses/activate", body.dump());
    if (response.empty()) return false;

    try {
        auto resp = json::parse(response);
        if (resp.value("success", false)) {
            m_authenticated = true;
            return true;
        }
        m_lastError = resp.value("message", "Activation failed");
    } catch (const std::exception& e) {
        m_lastError = std::string("Parse error: ") + e.what();
    }
    return false;
}

bool Auth::CheckLicense(const std::string& licenseKey) {
    json body;
    body["licenseKey"] = licenseKey;

    auto response = HttpPost(m_apiBase + L"/licenses/check", body.dump());
    if (response.empty()) return false;

    try {
        auto resp = json::parse(response);
        if (resp.value("success", false) && resp.contains("data"))
            return resp["data"].value("valid", false);
        m_lastError = resp.value("message", "Check failed");
    } catch (const std::exception& e) {
        m_lastError = std::string("Parse error: ") + e.what();
    }
    return false;
}

std::string Auth::GetVariable(const std::string& name) {
    auto path = m_apiBase + L"/variables/name/" + ToWide(UrlEncode(name));
    auto response = HttpGet(path);
    if (response.empty()) return "";

    try {
        auto resp = json::parse(response);
        if (resp.value("success", false) && resp.contains("data"))
            return resp["data"].value("value", "");
        m_lastError = resp.value("message", "Variable not found");
    } catch (const std::exception& e) {
        m_lastError = std::string("Parse error: ") + e.what();
    }
    return "";
}

std::string Auth::GetHWID()              { return m_hwid; }
void        Auth::SetHWID(const std::string& h) { m_hwid = h; }
bool        Auth::IsAuthenticated() const { return m_authenticated; }
bool        Auth::IsBanned()        const { return m_banned; }
std::string Auth::GetLastError()    const { return m_lastError; }
LicenseInfo Auth::GetLicenseInfo()  const { return m_licenseInfo; }
UserInfo    Auth::GetUserInfo()     const { return m_userInfo; }
void        Auth::SetTimeout(DWORD ms)    { m_timeout = ms; }

// ── HTTP (WinHTTP) ────────────────────────────────────────────

std::string Auth::HttpPost(const std::wstring& path, const std::string& body) {
    HINTERNET hSess = WinHttpOpen(L"AuthPlatform/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSess) { m_lastError = "WinHttpOpen failed"; return ""; }

    HINTERNET hConn = WinHttpConnect(hSess, m_apiHost.c_str(), m_port, 0);
    if (!hConn) { WinHttpCloseHandle(hSess); m_lastError = "WinHttpConnect failed"; return ""; }

    DWORD flags = m_useHttps ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hReq = WinHttpOpenRequest(hConn, L"POST", path.c_str(),
        nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hReq) { WinHttpCloseHandle(hConn); WinHttpCloseHandle(hSess); m_lastError = "WinHttpOpenRequest failed"; return ""; }

    WinHttpSetTimeouts(hReq, m_timeout, m_timeout, m_timeout, m_timeout);

    std::wstring hdrs = L"Content-Type: application/json\\r\\n"
        L"x-app-id: " + ToWide(m_appId) + L"\\r\\n"
        L"x-app-secret: " + ToWide(m_appSecret) + L"\\r\\n";

    std::string result;
    if (WinHttpSendRequest(hReq, hdrs.c_str(), (DWORD)hdrs.size(),
        (LPVOID)body.c_str(), (DWORD)body.size(), (DWORD)body.size(), 0)
        && WinHttpReceiveResponse(hReq, nullptr))
    {
        DWORD avail = 0;
        while (WinHttpQueryDataAvailable(hReq, &avail) && avail > 0) {
            std::string chunk(avail, '\\0');
            DWORD read = 0;
            WinHttpReadData(hReq, &chunk[0], avail, &read);
            result.append(chunk, 0, read);
        }
    } else {
        m_lastError = "Request failed: " + std::to_string(GetLastError());
    }

    WinHttpCloseHandle(hReq); WinHttpCloseHandle(hConn); WinHttpCloseHandle(hSess);
    return result;
}

std::string Auth::HttpGet(const std::wstring& path) {
    HINTERNET hSess = WinHttpOpen(L"AuthPlatform/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSess) { m_lastError = "WinHttpOpen failed"; return ""; }

    HINTERNET hConn = WinHttpConnect(hSess, m_apiHost.c_str(), m_port, 0);
    if (!hConn) { WinHttpCloseHandle(hSess); m_lastError = "WinHttpConnect failed"; return ""; }

    DWORD flags = m_useHttps ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hReq = WinHttpOpenRequest(hConn, L"GET", path.c_str(),
        nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hReq) { WinHttpCloseHandle(hConn); WinHttpCloseHandle(hSess); m_lastError = "WinHttpOpenRequest failed"; return ""; }

    WinHttpSetTimeouts(hReq, m_timeout, m_timeout, m_timeout, m_timeout);

    std::wstring hdrs = L"x-app-id: " + ToWide(m_appId) + L"\\r\\n"
        L"x-app-secret: " + ToWide(m_appSecret) + L"\\r\\n";

    std::string result;
    if (WinHttpSendRequest(hReq, hdrs.c_str(), (DWORD)hdrs.size(),
        WINHTTP_NO_REQUEST_DATA, 0, 0, 0)
        && WinHttpReceiveResponse(hReq, nullptr))
    {
        DWORD avail = 0;
        while (WinHttpQueryDataAvailable(hReq, &avail) && avail > 0) {
            std::string chunk(avail, '\\0');
            DWORD read = 0;
            WinHttpReadData(hReq, &chunk[0], avail, &read);
            result.append(chunk, 0, read);
        }
    } else {
        m_lastError = "Request failed: " + std::to_string(GetLastError());
    }

    WinHttpCloseHandle(hReq); WinHttpCloseHandle(hConn); WinHttpCloseHandle(hSess);
    return result;
}

// ── HWID ──────────────────────────────────────────────────────

std::string Auth::GenerateHWID() {
    std::ostringstream oss;
    DWORD serial = 0;
    GetVolumeInformationW(L"C:\\\\", nullptr, 0, &serial, nullptr, nullptr, nullptr, 0);
    oss << std::hex << std::setw(8) << std::setfill('0') << serial;

    int cpu[4] = {};
    __cpuid(cpu, 1);
    oss << "-" << std::hex << cpu[0] << "-" << std::hex << cpu[3];

    wchar_t name[MAX_COMPUTERNAME_LENGTH + 1] = {};
    DWORD sz = MAX_COMPUTERNAME_LENGTH + 1;
    GetComputerNameW(name, &sz);
    oss << "-" << ToNarrow(name);
    return oss.str();
}

// ── JSON parsing ──────────────────────────────────────────────

void Auth::ParseLoginResponse(const std::string& jsonStr) {
    try {
        auto resp = json::parse(jsonStr);
        if (!resp.contains("data")) return;
        auto& data = resp["data"];

        if (data.contains("license") && !data["license"].is_null()) {
            auto& lic = data["license"];
            m_licenseInfo.key        = lic.value("key", "");
            m_licenseInfo.status     = lic.value("status", "");
            m_licenseInfo.expiresAt  = lic.value("expiresAt", "");
            m_licenseInfo.isLifetime = (lic.value("durationUnit", "") == "lifetime");
            if (lic.contains("subscription") && !lic["subscription"].is_null()) {
                m_licenseInfo.subscriptionName  = lic["subscription"].value("name", "");
                m_licenseInfo.subscriptionLevel = lic["subscription"].value("level", 0);
            }
        }
        if (data.contains("user") && !data["user"].is_null()) {
            auto& usr = data["user"];
            m_userInfo.username = usr.value("username", "");
            m_userInfo.status   = usr.value("status", "");
            m_userInfo.expiresAt = usr.value("expiresAt", "");
            m_userInfo.ip       = usr.value("ip", "");
            if (m_userInfo.status == "banned") { m_banned = true; m_authenticated = false; }
        }
    } catch (...) {}
}

// ── Utilities ─────────────────────────────────────────────────

std::wstring Auth::ToWide(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    std::wstring r(n - 1, L'\\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, &r[0], n);
    return r;
}

std::string Auth::ToNarrow(const std::wstring& s) {
    if (s.empty()) return "";
    int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string r(n - 1, '\\0');
    WideCharToMultiByte(CP_UTF8, 0, s.c_str(), -1, &r[0], n, nullptr, nullptr);
    return r;
}

std::string Auth::UrlEncode(const std::string& s) {
    std::ostringstream out;
    for (unsigned char c : s) {
        if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') out << c;
        else out << '%' << std::uppercase << std::hex << std::setw(2) << std::setfill('0') << (int)c;
    }
    return out.str();
}

} // namespace AuthPlatform
`;
};

module.exports = { generateSDK };
