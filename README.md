<div align="center">

<img src="www/app.ico" width="96" height="96" alt="ClassBroom" />

# ClassBroom

### 桌面顶端的课程表 · 天气 · 倒计时

[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4?style=flat-square&logo=windows)](https://www.microsoft.com/windows)
[![License](https://img.shields.io/badge/license-MIT-64748B?style=flat-square)](LICENSE)

</div>

---

## 这是什么

ClassBroom 是一个桌面课程表小工具。

它不占满屏幕，只在桌面顶端显示一条 92 像素高的横条：左边是今天的课程，右边是天气，底部一行小字可以自己定义。窗口不占用任务栏，关闭后会收进系统托盘。

<div align="center">

![](image/README/1793427994729.png)

</div>

## 功能

<table>
<tr>
<td width="50%" valign="top">

### 课程时间轴
课程按实际时间等比例排列。

正在上的课会高亮，快下课的课变成橙色，刚下课的课会闪一下。不用自己算，看一眼就知道进度。

</td>
<td width="50%" valign="top">

### 天气与预警
支持和风天气、Open-Meteo、WeatherAPI.com 与 OpenWeatherMap，温度、天气和风力定时刷新。

Open-Meteo 无需 API Key；其他服务商按各自接口要求配置凭据。和风天气与 WeatherAPI.com 可显示天气预警。

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 底部自定义信息
底下一行字可以用占位符拼接，比如倒计时、当前课程、气温、时间等。

设置页里点一下就能插入，不需要记语法。

</td>
<td width="50%" valign="top">

### 快速改课表
在设置里点选课程名称，拖动轨道调整时间。

触屏不方便时可以用 ±5 / ±10 分钟按钮微调，或直接套用 40 / 45 / 50 分钟。

也支持 JSON 配置导入导出，配置文件可以直接拖进窗口。

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 六种主题
默认、海洋蓝、森林绿、午夜深色、高对比度、纯黑白。

切换后立即生效。

</td>
<td width="50%" valign="top">

### 占用小
不打包 Chromium，启动快，内存占用低。

</td>
</tr>
</table>

## 使用场景

| 情况 | 会怎样 |
| :--- | :--- |
| 开机 | 可以设置开机自启，横条自动出现在屏幕顶部中间 |
| 上课时 | 看一眼就知道还剩几分钟下课、下一节是什么 |
| 想安静做事 | 点右上角关闭，窗口收进托盘 |
| 配置天气 | 搜索地区后自动填入经纬度，也可选择不同天气服务商 |
| 有天气预警 | 支持预警的服务商会在天气区显示警示标签 |
| 换班级 / 换学期 | 在设置里改课表，或拖入别人分享的 JSON 配置 |

## 开始使用

1. 下载并运行安装包。
2. 首次启动后点横条右侧的齿轮图标进入设置。
3. 在「天气」页选择服务商；可搜索地区自动填入经纬度，按需填写服务商凭据，再到「课程」页排好课表。
4. 点「保存并退出」，窗口会恢复原尺寸并刷新。

> 想让开机自动启动，在设置里勾选「开机自启」。

## 界面

**主界面**高 92 像素，左边时间轴，右边天气，底部信息栏。

**设置界面**有四个标签页：

| 标签 | 作用 |
| :--- | :--- |
| 天气 | 选择天气服务商、免密钥搜索地区、填写经纬度与所需凭据、设置刷新间隔 |
| 课程 | 按周一到周日切换，增删课程、选课程名称、拖动或步进调时间 |
| 显示 | 选主题、改底部字号和颜色、编辑底部信息 |
| 关于 | 查看应用信息 |

### 可用占位符

写进「窗口右下角信息」即可，保存后会自动替换成实际内容。设置页可以点击插入。

| 类别 | 占位符 |
| :--- | :--- |
| 时间 | `{time}` `{date}` `{datetime}` `{weekday}` |
| 课程 | `{course}` `{nextCourse}` |
| 天气 | `{temperature}` `{weather}` `{location}` `{real_location}` |
| 倒计时 | `{targetName}` `{targetDate}` `{daysTo}` `{daysTo:2027-06-07}` |
| 其他 | `{custom1}` `{custom2}` `{custom3}` `{appName}` `{version}` |

示例：`{weekday} {date} · {course} · 距{targetName}还有{daysTo}天`

## 数据存放

课表、天气凭据、主题等设置都**保存在本机**
不会上传、不会联网同步、不收集使用数据。

## 常见问题

<details>
<summary><b>为什么点关闭不退出程序？</b></summary>

关闭只是把窗口收进托盘。要真正退出，右键托盘图标选「退出」。
</details>

<details>
<summary><b>横条位置不对或被遮挡？</b></summary>

横条默认居中贴顶。Windows 11 的贴靠布局或其他置顶工具可能会影响位置，调整后点一次右上角刷新按钮即可重新居中。
</details>

<details>
<summary><b>天气显示不出来？</b></summary>

和风天气需要 API Host、KID、SUB、ISS 和私钥；WeatherAPI.com 与 OpenWeatherMap 需要各自的 API Key；Open-Meteo 无需密钥。请检查所选服务商的凭据与网络连接。凭据错误时会保留上一次的数据。
</details>

<details>
<summary><b>换电脑后课表能带过去吗？</b></summary>

可以。导出 JSON 配置，在新电脑上导入或直接拖进窗口即可。
</details>

## 使用许可

本项目基于 [MIT 许可证](LICENSE) 开源，可自由使用、修改与分发。

<div align="center">
<br/>

</div>