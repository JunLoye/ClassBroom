# 📅 ClassBroom

一个基于 **Neutralinojs** (前端) + **C++** (后端) 的轻量级跨平台桌面应用。实现了深色主题的横向课程时间轴与天气状态展示。

## ✨ 功能特性

- **横向时间轴**：清晰展示一天课程节奏。
- **动态状态**：支持“进行中”、“未开始”等状态样式高亮。
- **前后端分离**：前端通过 Neutralino API 执行 C++ 后端程序，获取 JSON 格式的课程与天气数据。
- **极速轻量**：摒弃庞大的 Electron，使用 Neutralino 搭配 C++，资源占用极低。

## 🛠️ 技术栈

- **前端**: HTML5, CSS3, Vanilla JavaScript
- **框架**: Neutralinojs
- **后端**: C++ (Standard Library)

## 📂 项目结构

```text
├── neutralino.config.json    # Neutralino 配置文件
├── www/                      # 前端资源目录
│   ├── index.html            # 主界面结构
│   ├── styles.css            # 界面样式
│   ├── js/
│   │   ├── main.js           # 前端逻辑与 API 调用
│   │   └── neutralino.js     # Neutralino 客户端库
│   └── backend/              # 后端可执行文件目录
│       └── schedule_backend  # 编译后的 C++ 程序
└── backend/                  # C++ 源码目录
    └── main.cpp              # C++ 源码
```

## 🚀 快速开始

### 1. 编译 C++ 后端

首先，进入 `backend` 目录，编译 C++ 源码生成可执行文件，并将可执行文件移动至 `www/backend/` 目录下：

**Windows (MinGW):**
```bash
g++ main.cpp -o ../www/backend/schedule_backend.exe
```

**macOS / Linux:**
```bash
g++ main.cpp -o ../www/backend/schedule_backend
```

### 2. 安装并运行前端

确保你已安装 [Neutralino CLI](https://neutralino.js.org/docs/cli/installation)。

```bash
# 安装依赖（如需）
neu update

# 启动应用
neu run
```

## ⚙️ 配置说明

在 `neutralino.config.json` 中，已配置好必要的权限：
```json
"nativeAllowList": [
  "app.*",
  "os.execCommand",
  "os.getPath"
]
```

## 📄 License

[MIT](LICENSE)