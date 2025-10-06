# ClassBroom（教室的飞天扫帚）
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/LoyeJun/ClassBroom)
[![Static Badge](https://img.shields.io/badge/GitHub-JunLoye-orange)](https://github.com/JunLoye)
[![GitHub](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.swo.moe%2Fstats%2Fgithub%2Floyejun&query=count&color=181717&label=GitHub&labelColor=282c34&logo=github&suffix=+follows&cacheSeconds=3600)](https://github.com/JunLoye)
[![爱发电](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.swo.moe%2Fstats%2Fafdian%2Fspencerwoo&query=count&color=282c34&label=%E7%88%B1%E5%8F%91%E7%94%B5&labelColor=946ce6&suffix=+%E5%8F%91%E7%94%B5%E4%BA%BA%E6%AC%A1+%2F+%E6%9C%88&cacheSeconds=3600)](https://afdian.com/a/LoyeJun)


ClassBroom 是一个功能丰富的桌面应用启动器，集成了多个实用工具，包括天气显示、倒计时、文本显示等功能。

---

## 功能特点

- **天气应用**：实时天气信息显示，支持天气预警
- **倒记日**：紧凑型倒记日显示器，可自定义目标日期
- **文本显示**：可自定义样式的文本显示工具，方便在大屏上显示通知等文本

---

## 安装要求

- Python 3.x
- PyQt6 或 以上

---

## 系统要求

| 操作系统 | 测试版本 | 架构 | 适配情况 |
|---------|------|----------|----------|
| Windows 11 | 24H2 | x64 | ✅ 完美适配 |
| Windows 10 | 1909 | x64 | ✅ 完美适配 |
| Windows 8 | / | x64 | ⚠️基本适配 |
| Windows 7 | / | x64 | ⚠️基本适配 |
| Linux |  |  | ❔未测试 |
| Mac |  |  | ❌不支持 |

---

## 配置文件

项目使用 `config.json` 作为配置文件，包含所有应用的配置信息。
> [!IMPORTANT]
> 首次运行需要手动配置`config.json`，详细信息请到[最新版本Releases](https://github.com/LoyeJun/ClassBroom/releases/latest)查看

---

## 日志

应用程序使用 `ClassBroom.log` 文件记录运行日志，包含错误信息和调试信息。

---

## 基本目录结构

```
ClassBroom/
├── apps/
│   ├── Countdown/      # 倒计时应用
│   ├── TextDisplay/    # 文本显示应用
│   └── Weather/        # 天气应用
├── config.json         # 主配置文件
├── default/            # 默认配置
├── main.py            # 主程序入口
└── quote/             # 引用资源
```

---

## 运行

- **软件运行**
1. 下载[最新版本Releases](https://github.com/LoyeJun/ClassBroom/releases/latest)
2. 按照`Release`要求配置`config.json`
3. 双击运行

- **开发运行**
1. 使用`命令行`运行`git clone https://github.com/LoyeJun/ClassBroom.git` [→详细教程](https://docs.github.com/zh/get-started/git-basics/about-remote-repositories)
2. 配置对应`库`及`虚拟环境`

---

## 注意事项

- 首次运行时，程序会使用默认配置创建配置文件
> [!IMPORTANT]
> 首次运行需要手动配置`config.json`，详细信息请到[最新版本Releases](https://github.com/LoyeJun/ClassBroom/releases/latest)查看
- 修改配置后需要重启应用以使更改生效 （截至[`v-2.0.0`](https://github.com/LoyeJun/ClassBroom/releases/tag/v-2.0.0)）

---

## 贡献
欢迎提交 Issue 或 Pull Request 来改进此项目。

---

## 许可证
本项目使用 [MIT License](LICENSE)。
