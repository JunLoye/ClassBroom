#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
纯公开 API 版 PyQt5 天气预警小浮窗
天气：http://www.nmc.cn/rest/weather
预警：http://www.nmc.cn/rest/relevant/weatheralarm  (JSONP→JSON)
"""
import sys, re, requests, json
from PyQt5.QtWidgets import QApplication, QLabel, QWidget, QVBoxLayout
from PyQt5.QtCore import Qt, QTimer, QPropertyAnimation
from PyQt5.QtGui import QFont

######## 配置 ########
CITY_NAME = '北京'
PROVINCE = '北京'
REFRESH_MS = 60_000
######################

class WeatherWidget(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('公开天气预警')
        self.resize(260, 100)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnBottomHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setStyleSheet("background-color:rgba(30,30,30,200);border-radius:10px;")

        self.label = QLabel('加载中…', self)
        self.label.setAlignment(Qt.AlignCenter)
        self.label.setFont(QFont('Microsoft YaHei', 11))
        self.label.setStyleSheet('color:white;')

        QVBoxLayout(self).addWidget(self.label)

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.query)
        self.timer.start(REFRESH_MS)
        self.query()

        self.anim = None

    # --------- 网络请求 ---------
    def query(self):
        try:
            # 1. 实时天气
            url_w = f'http://www.nmc.cn/rest/weather?stationid={self.station_id()}'
            w = requests.get(url_w, timeout=5).json()
            data = w.get('data', {})

            if isinstance(data, list) and data:
                realtime = data[0].get('real', {})
            elif isinstance(data, dict):
                realtime = data.get('real', {})
            else:
                realtime = {}

            temp = realtime.get('temperature', '未知')
            desc = realtime.get('info', '未知')

            # 2. 预警（JSONP→JSON）
            url_a = 'http://www.nmc.cn/rest/relevant/weatheralarm'
            raw = requests.get(url_a, timeout=5).text
            match = re.search(r'jsonpCallback\d+\((.*)\)$', raw)
            alarms = json.loads(match.group(1)) if match else []
            mine = [a for a in alarms if a.get('province') == PROVINCE and a.get('city') == CITY_NAME]

            if mine:
                lvl = mine[0].get('level', '未知')
                typ = mine[0].get('type', '未知')
                self.label.setText(f'⚠️{lvl}预警：{typ}\n🌤 {temp}°C {desc}')
                self.raise_and_animate()
            else:
                self.label.setText(f'🌤 {temp}°C {desc}')
                self.lower_to_bottom()
        except Exception as e:
            self.label.setText('❌ 获取失败')
            print('请求异常：', e)

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
                '西安': '57036'}.get(CITY_NAME, '54511')

    def mousePressEvent(self, _):
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.Tool)
        self.show()
        self.raise_()
        self.activateWindow()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    w = WeatherWidget()
    w.show()
    sys.exit(app.exec_())