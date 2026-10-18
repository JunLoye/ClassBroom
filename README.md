# ClassBroom

一个基于 **Neutralinojs** 构建的轻量级跨平台桌面课程表与天气悬浮挂件。采用了无边框、透明背景设计，提供横向课程时间轴与实时天气状态展示。

## 核心特性

- **注册表存储**：配置数据（天气密钥、课表）通过 Base64 编码后存入 Windows 注册表（`HKCU\Software\ClassBroom`），免去文件读写权限问题，且旧版 `config.json` 会在首次启动时自动迁移。
- **无感动态切换**：主界面与设置界面无缝切换，自动调整窗口尺寸并居中，无需重新加载应用。
- **动态状态高亮**：课程时间轴自动根据当前时间高亮显示“进行中”、“未开始”与“已结束”状态。
- **JWT 天气直连**：前端直接通过 WebCrypto 进行 Ed25519 签名，生成 JWT 并请求和风天气 API，摆脱对后端网络模块的依赖。
- **纯内联布局**：摒弃外部 CSS 文件，样式完全内联于 `index.html`，配合绝对定位硬约束，彻底解决 WebView 在高 DPI 缩放或窗口瞬间拉伸时的渲染崩溃问题。
- **极致轻量**：摒弃庞大的 Electron，使用 Neutralinojs 替代，资源占用极低。

## 技术栈

- **框架**：Neutralinojs
- **前端**：HTML5, CSS3 (Flexbox/绝对定位), Vanilla JavaScript, WebCrypto API
- **数据存储**：Windows 注册表 (通过 `reg.exe` 交互)

## 目录结构

```text
├── neutralino.config.json    # Neutralino 配置文件 (包含系统权限白名单)
├── www/                      # 前端资源目录
│   ├── index.html            # 主界面结构 (包含全部内联样式)
│   └── js/
│       ├── main.js           # 核心逻辑 (注册表读写、JWT签名、UI渲染)
│       └── neutralino.js     # Neutralino 客户端库
└── README.md                 # 项目说明文档
```

## 快速开始

确保你已安装 [Neutralino CLI](https://neutralino.js.org/docs/cli/installation)。

```bash
# 安装依赖（如需）
neu update

# 启动应用
neu run
```

## 配置与数据存储说明

应用的所有配置均保存于当前用户的注册表中，路径如下：
`HKEY_CURRENT_USER\Software\ClassBroom`

### 1. 注册表读取逻辑
应用启动时，会执行以下操作：
1. 调用 `reg query` 检查注册表是否存在 `ConfigData` 键值。
2. 如果存在，读取 Base64 字符串并解码为 JSON 对象。
3. 如果不存在，则尝试读取旧版的 `config.json` 文件。若读取成功，自动将其转换为 Base64 写入注册表，完成平滑迁移。
4. 如果在非 Windows 平台运行，则降级继续使用 `config.json` 文件。

### 2. 注册表调试命令
如果你需要手动备份、清除或查看数据，可以在 CMD 或 PowerShell 中执行以下命令：

**查看当前存储的配置（Base64 编码）：**
```cmd
reg query "HKCU\Software\ClassBroom" /v ConfigData
```

**清除配置（恢复出厂设置）：**
```cmd
reg delete "HKCU\Software\ClassBroom" /f
```

## 界面交互说明

- **主界面**：高度仅 85px。显示今日的横向时间轴和右侧的天气状态。点击顶部的齿轮图标即可进入设置。
- **设置界面**：窗口自动放大至 800x600 并居中。
  - **天气配置**：输入和风天气的专属 API Host、经纬度以及 JWT 认证凭据（KID, SUB, ISS, 私钥）。
  - **课表配置**：顶部切换周一到周日，支持动态添加/删除课程时间段。
  - **保存**：点击“保存并应用”后，数据写入注册表，窗口恢复至主界面并立即刷新。

## License

[MIT](LICENSE)