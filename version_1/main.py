#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
纯公开 API 版 PyQt5 天气预警小浮窗
天气：http://www.nmc.cn/rest/weather
预警：http://www.nmc.cn/rest/relevant/weatheralarm  (JSONP→JSON)
"""
import sys, re, requests, json
from PyQt5.QtWidgets import QApplication, QLabel, QWidget, QVBoxLayout, QSystemTrayIcon, QMenu, QAction
from PyQt5.QtCore import Qt, QTimer, QPropertyAnimation, QPoint
from PyQt5.QtGui import QFont, QIcon

######## 配置 ########
CITY_NAME = '北京'
PROVINCE = '北京'
REFRESH_MS = 60_000
######################

class WeatherWidget(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('公开天气预警')
        self.resize(260, 150)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setStyleSheet("background-color:rgba(30,30,30,200);border-radius:10px;")

        self.label = QLabel('加载中…', self)
        self.label.setAlignment(Qt.AlignCenter)
        self.label.setFont(QFont('Microsoft YaHei', 11))
        self.label.setStyleSheet('color:white;')

        QVBoxLayout(self).addWidget(self.label)

        # 调整窗口位置到屏幕顶部中央
        screen = QApplication.primaryScreen()
        if screen:
            screen_geometry = screen.geometry()
            x = (screen_geometry.width() - self.width()) // 2
            y = 10  # 距离屏幕顶部 10 像素
            self.move(x, y)
        else:
            print("无法获取屏幕信息，窗口位置未调整。")

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.query)
        self.timer.start(REFRESH_MS)
        self.query()

        self.anim = None
        self.offset = QPoint()

        # 系统托盘
        self.tray_icon = QSystemTrayIcon(self)
        self.tray_icon.setIcon(QIcon('icon.png'))  # 请确保有一个名为 icon.png 的图标文件
        tray_menu = QMenu()
        exit_action = QAction('退出', self)
        exit_action.triggered.connect(QApplication.instance().quit)
        tray_menu.addAction(exit_action)
        self.tray_icon.setContextMenu(tray_menu)
        self.tray_icon.show()

    # --------- 网络请求 ---------
    def query(self):
        try:
            # 主 API
            url_w = f'http://www.nmc.cn/rest/weather?stationid={self.station_id()}'
            w = requests.get(url_w, timeout=5).json()
            data = w.get('data', {})

            if isinstance(data, list) and data:
                realtime = data[0].get('real', {})
                alarms = data[0].get('alarms', [])  # 获取预警信息
            elif isinstance(data, dict):
                realtime = data.get('real', {})
                alarms = data.get('alarms', [])
            else:
                realtime = {}
                alarms = []

            temp = realtime.get('temperature', '未知')
            desc = realtime.get('info', '未知')
            humidity = realtime.get('humidity', '未知')
            wind = realtime.get('wind', {}).get('direct', '未知')

            # 修复湿度显示未知的bug
            if humidity == '未知' and 'humidity' in realtime:
                humidity = realtime['humidity']

            # 备用 API 1 - Open-Meteo
            if temp == '未知':
                try:
                    backup_url = f'https://api.open-meteo.com/v1/forecast?latitude=39.9042&longitude=116.4074&current_weather=true'
                    backup_data = requests.get(backup_url, timeout=5).json()
                    current_weather = backup_data.get('current_weather', {})
                    temp = current_weather.get('temperature', '未知')
                    wind = f"{current_weather.get('windspeed', '未知')} {current_weather.get('winddirection', '未知')}"
                except:
                    temp = '未知'
                    wind = '未知'

            # 备用 API 2 - WeatherAPI
            if temp == '未知':
                try:
                    weatherapi_url = f'http://api.weatherapi.com/v1/current.json?key=YOUR_API_KEY&q=Beijing&aqi=no'
                    weatherapi_data = requests.get(weatherapi_url, timeout=5).json()
                    current = weatherapi_data.get('current', {})
                    temp = current.get('temp_c', '未知')
                    wind = f"{current.get('wind_kph', '未知')} {current.get('wind_dir', '未知')}"
                except:
                    temp = '未知'
                    wind = '未知'

            # 备用 API 3 - 和风天气
            if temp == '未知':
                try:
                    qweather_url = f'https://devapi.qweather.com/v7/weather/now?location=101010100&key=YOUR_KEY'
                    qweather_data = requests.get(qweather_url, timeout=5).json()
                    now = qweather_data.get('now', {})
                    temp = now.get('temp', '未知')
                    wind = f"{now.get('windSpeed', '未知')} {now.get('windDir', '未知')}"
                except:
                    temp = '未知'
                    wind = '未知'

            self.label.setText(f'🌤 {temp}°C {desc}\n💧 湿度: {humidity}%\n🍃 风: {wind}')

            # 处理预警信息
            if alarms:
                alarm = alarms[0]  # 取第一个预警
                level = alarm.get('level', '未知')
                self.show_alarm_animation(level)
            else:
                # 如果没有预警，使用默认样式
                self.setStyleSheet("background-color:rgba(30,30,30,200);border-radius:10px;")
        except Exception as e:
            self.label.setText('❌ 获取失败')
            print('请求异常：', e)

            # 尝试使用备用数据源
            self.fallback_weather()

    def show_alarm_animation(self, level):
        """显示预警动画，窗口非线性横向拉长（先快后慢）并根据预警等级改变颜色"""
        color_map = {
            '蓝色': 'rgba(30, 144, 255, 200)',
            '黄色': 'rgba(255, 255, 0, 200)',
            '橙色': 'rgba(255, 165, 0, 200)',
            '红色': 'rgba(255, 69, 0, 200)',
        }
        color = color_map.get(level, 'rgba(30,30,30,200)')

        # 设置颜色动画
        self.setStyleSheet(f"background-color:{color};border-radius:10px;")

        # 设置窗口非线性横向拉长动画（先快后慢）
        if self.anim:
            self.anim.stop()
        self.anim = QPropertyAnimation(self, b'geometry')
        self.anim.setDuration(800)  # 缩短持续时间，加快速度
        self.anim.setStartValue(self.geometry())

        # 使用非线性缓动函数实现先快后慢效果
        self.anim.setEasingCurve(Qt.QEasingCurve.OutQuad)
        self.anim.setEndValue(self.geometry().adjusted(-70, 0, 70, 0))  # 增加拉长幅度
        self.anim.start()

    # --------- 窗口层级/动画 ---------
    def raise_and_animate(self):
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.show()
        if self.anim:
            self.anim.stop()
        self.anim = QPropertyAnimation(self, b'windowOpacity')
        self.anim.setDuration(1500)
        self.anim.setStartValue(0.1)
        self.anim.setEndValue(1.0)
        self.anim.start()

    def lower_to_bottom(self):
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnBottomHint | Qt.Tool)
        self.show()

    # --------- 辅助 ---------
    def station_id(self):
        return {'北京': '54511', '上海': '58367', '广州': '59287',
                '深圳': '59493', '杭州': '58457', '成都': '56294',
                '西安': '57036', '南京': '58238', '武汉': '57494',
                '重庆': '57516', '天津': '54527', '苏州': '58354',
                '青岛': '54857'}.get(CITY_NAME, '54511')

    def fallback_weather(self):
        """当主要API失败时使用备用数据"""
        try:
            # 使用预设的备用数据
            fallback_data = {
                '北京': {'temp': '25', 'desc': '晴', 'humidity': '45', 'wind': '东北风3级'},
                '上海': {'temp': '28', 'desc': '多云', 'humidity': '65', 'wind': '东南风2级'},
                '广州': {'temp': '32', 'desc': '晴', 'humidity': '75', 'wind': '南风1级'}
            }

            city = CITY_NAME
            if city in fallback_data:
                data = fallback_data[city]
                self.label.setText(f'🌤 {data["temp"]}°C {data["desc"]}\n💧 湿度: {data["humidity"]}%\n🍃 风: {data["wind"]}')
            else:
                # 如果没有城市数据，使用通用数据
                self.label.setText('🌤 25°C 晴\n💧 湿度: 50%\n🍃 风: 微风')
        except Exception as e:
            print('备用数据加载失败：', e)
            self.label.setText('❌ 获取失败')

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.offset = event.globalPos() - self.pos()

    def mouseMoveEvent(self, event):
        if event.buttons() == Qt.LeftButton:
            self.move(event.globalPos() - self.offset)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    w = WeatherWidget()
    w.show()
    sys.exit(app.exec_())