# ClassBroom（教室的飞天扫帚）

[English](README.md) | [中文说明](README.zh-CN.md)

ClassBroom 是一个为课堂环境设计的轻量级工具，用于显示当前天气和预警信息。它旨在帮助教师或系统以直观的仪表盘方式快速呈现环境信息（例如天气预警）。

---

## 目录

- [功能](#功能)  
- [演示 / 截图](#演示--截图)  
- [运行要求](#运行要求)  
- [安装与设置](#安装与设置)  
- [使用方法](#使用方法)  
- [配置](#配置)  
- [贡献](#贡献)  
- [许可证](#许可证)  

---

## 功能

- 获取并显示当前天气（温度、天气状况等）  
- 显示天气预警信息  
- 简单易部署，适用于课堂环境  
- 依赖最小化  

---

## 演示 / 截图

<img width="1268" height="63" alt="image" src="https://github.com/user-attachments/assets/865bdb97-4c0d-49b9-972c-59e890f7d862" />

---

## 运行要求

- 一台可运行应用的设备（操作系统如 Linux、Windows 等）  
- 稳定的网络连接（用于获取天气和预警信息）  
- （根据项目情况，可能需要 Python / Node 等依赖环境）  

---

## 安装与设置

1. 克隆仓库  
    ```bash
    git clone https://github.com/LoyeJun/ClassBroom.git
    cd ClassBroom
    ```
    
2. 配置 API Key 或其他参数（见 [配置](#配置)）

3. 启动应用和服务

---

## 使用方法

程序运行后，ClassBroom 将会：

* 定时调用天气服务（`qweather`）
* 显示当前温度、天气等信息
* 展示当前有效的天气预警
* 自动刷新与周期性更新

---

## 配置

您可以创建或修改配置文件（如 `config.yaml`、`settings.json` 或环境变量），以调整以下参数：

| Key                | 描述               |
| ------------------ | ---------------- |
| `weather_api_key`  | 和风天气 API Key |
| `location`         | 要获取天气的坐标或城市名称 |
| `refresh_interval` | 数据刷新频率（秒） |
| `alert_thresholds` | 显示预警的条件标准（*暂不支持*） |
| 其它               | *敬请期待* |

---

## 贡献

欢迎为项目提供帮助！建议流程如下：

1. Fork 本仓库
2. 测试并提交`Issue`
3. 创建新分支 (`git checkout -b feature/YourFeature`)
4. 提交修改，并编写清晰的提交说明
5. 发起 Pull Request

请保持代码风格一致，测试修改内容，并为新增功能撰写文档。

---

## 许可证

本项目基于 **MIT License** 开源 —— 详情请参见 [LICENSE](LICENSE) 文件。

---

## 致谢

* 和风天气
