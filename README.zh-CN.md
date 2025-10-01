# ClassBroom（教室的飞天扫帚）
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/LoyeJun/ClassBroom)

[English](README.md) | [中文说明](README.zh-CN.md)

ClassBroom 是一个为课堂环境设计的轻量级工具，用于显示当前天气和预警信息。  
它旨在帮助教师或系统以直观的仪表盘方式快速呈现环境信息（例如天气预警）。

---

## 功能

- 实时天气信息显示（温度、天气情况、湿度等）
- 预警信息提醒（支持颜色动画区分预警等级）
- 系统托盘图标与快捷菜单
- 系统通知推送（支持预警提醒）
- 可配置的设置面板（位置代码、更新时间、语言、单位、主题等）

---

## 软件截图

<img width="1186" height="61" alt="image" src="https://github.com/user-attachments/assets/6862369d-04d7-4aa0-80ea-d434ff0270e3" />

---

## 运行要求
- **Windows 10** 及以上

---

## 安装与使用

1. 克隆仓库：

   ```bash
   git clone https://github.com/LoyeJun/ClassBroom.git
   cd ClassBroom
   ```

2. 配置 `config.json`（首次运行需要手动配置，或者进入软件设置进行设置）
   ```json
   {
     "location_code": "101010100",
     "update_interval": 300,
     "language": "zh",
     "temperature_unit": "C",
     "autostart": false,
     "notifications": true,
     "theme": "light"
   }
   ```
---

## 配置说明

* `location_code`：天气 API 的位置代码
* `update_interval`：更新间隔（分钟）
* `language`：界面语言（`zh` 或 `en`）
* `temperature_unit`：温度单位（`C` 或 `F`）
* `autostart`：是否开机自启
* `notifications`：是否开启系统通知
* `theme`：主题（`light` 或 `dark`）

---

## 贡献

欢迎提交 Issue 或 Pull Request 来改进此项目。

---

## 许可证

本项目使用 [MIT License](LICENSE)。
