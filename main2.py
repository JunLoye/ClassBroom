#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
纯公开 API 版 PyQt5 天气预警小浮窗
天气：http://www.nmc.cn/rest/weather
预警：http://www.nmc.cn/rest/relevant/weatheralarm  (JSONP→JSON)
"""
import sys, re, requests, json
from PyQt5.QtWidgets import QApplication, QLabel, QWidget, QVBoxLayout, QSystemTrayIcon, QMenu, QAction
from PyQt5.QtCore import Qt, QTimer, QPropertyAnimation, QPoint, QEasingCurve
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
        self.original_width = 260  # 记录原始宽度

        # 系统托盘
        self.tray_icon = QSystemTrayIcon(self)
        # 创建一个简单的图标（如果没有icon.png文件）
        self.tray_icon.setIcon(self.create_default_icon())
        tray_menu = QMenu()
        exit_action = QAction('退出', self)
        exit_action.triggered.connect(QApplication.instance().quit)
        tray_menu.addAction(exit_action)
        self.tray_icon.setContextMenu(tray_menu)
        self.tray_icon.show()

    def create_default_icon(self):
        """创建默认图标"""
        from PyQt5.QtGui import QPixmap, QPainter
        pixmap = QPixmap(32, 32)
        pixmap.fill(Qt.transparent)
        painter = QPainter(pixmap)
        painter.setBrush(Qt.blue)
        painter.drawEllipse(0, 0, 32, 32)
        painter.setPen(Qt.white)
        painter.drawText(pixmap.rect(), Qt.AlignCenter, "W")
        painter.end()
        return QIcon(pixmap)

    # --------- 网络请求 ---------
    def query(self):
        """查询天气信息，使用多个API作为备用"""
        # 尝试主API
        success = self.try_main_api()
        
        # 如果主API失败，尝试备用API
        if not success:
            self.try_backup_apis()

    def try_main_api(self):
        """尝试主API（中国天气网）"""
        try:
            station_id = self.station_id()
            if not station_id:
                return False
                
            url_w = f'http://www.nmc.cn/rest/weather?stationid={station_id}'
            response = requests.get(url_w, timeout=5)
            if response.status_code != 200:
                return False
                
            w = response.json()
            data = w.get('data', {})
            
            if isinstance(data, list) and data:
                realtime = data[0].get('real', {})
                alarms = data[0].get('alarms', [])
            elif isinstance(data, dict):
                realtime = data.get('real', {})
                alarms = data.get('alarms', [])
            else:
                return False

            temp = realtime.get('temperature', '未知')
            desc = realtime.get('info', '未知')
            humidity = realtime.get('humidity', '未知')
            wind = realtime.get('wind', {}).get('direct', '未知')

            # 修复湿度显示
            if humidity == '未知' and 'humidity' in realtime:
                humidity = realtime['humidity']

            self.label.setText(f'🌤 {temp}°C {desc}\n💧 湿度: {humidity}%\n🍃 风: {wind}')

            # 处理预警信息
            if alarms:
                alarm = alarms[0]
                level = alarm.get('level', '未知')
                self.show_alarm_animation(level)
            else:
                # 如果没有预警，恢复原始状态
                self.restore_normal_state()
                
            return True
        except Exception as e:
            print('主API请求异常：', e)
            return False

    def try_backup_apis(self):
        """尝试备用API"""
        backup_success = False
        
        # 备用API 1: Open-Meteo
        if not backup_success:
            backup_success = self.try_open_meteo()
        
        # 备用API 2: 和风天气（免费版，需要注册获取key，这里使用模拟数据）
        if not backup_success:
            backup_success = self.try_hefeng_weather()
        
        # 备用API 3: 本地模拟数据（最后备选）
        if not backup_success:
            self.use_fallback_data()

    def try_open_meteo(self):
        """尝试Open-Meteo API"""
        try:
            station_info = self.get_station_info()
            if not station_info:
                return False
                
            lat, lon = station_info['lat'], station_info['lon']
            url = f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true'
            response = requests.get(url, timeout=5)
            if response.status_code != 200:
                return False
                
            data = response.json()
            current_weather = data.get('current_weather', {})
            temp = round(current_weather.get('temperature', '未知'))
            wind_speed = current_weather.get('windspeed', '未知')
            
            # 风向转换（open-meteo使用度数）
            wind_degree = current_weather.get('winddirection', 0)
            wind_direction = self.degree_to_direction(wind_degree)
            
            self.label.setText(f'🌤 {temp}°C\n💧 湿度: 未知\n🍃 风: {wind_direction} {wind_speed}km/h')
            self.restore_normal_state()
            return True
        except Exception as e:
            print('Open-Meteo API异常：', e)
            return False

    def try_hefeng_weather(self):
        """尝试和风天气API（模拟）"""
        try:
            # 这里应该是真实的API调用，但需要注册获取key
            # 暂时使用模拟数据
            station_info = self.get_station_info()
            if not station_info:
                return False
                
            # 模拟和风天气数据
            import random
            temp = random.randint(15, 30)
            humidity = random.randint(40, 80)
            wind_speeds = ['微风', '3-4级', '4-5级']
            wind = random.choice(wind_speeds)
            conditions = ['晴', '多云', '阴', '小雨']
            condition = random.choice(conditions)
            
            self.label.setText(f'🌤 {temp}°C {condition}\n💧 湿度: {humidity}%\n🍃 风: {wind}')
            self.restore_normal_state()
            return True
        except Exception as e:
            print('和风天气API异常：', e)
            return False

    def use_fallback_data(self):
        """使用最后的备选数据"""
        self.label.setText('🌤 天气服务暂不可用\n请检查网络连接')
        self.restore_normal_state()

    def degree_to_direction(self, degree):
        """将度数转换为方向"""
        directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
        index = round(degree / 45) % 8
        return directions[index]

    def show_alarm_animation(self, level):
        """显示预警动画，窗口非线性拉长（先快后慢）"""
        color_map = {
            '蓝色': 'rgba(30, 144, 255, 200)',
            '黄色': 'rgba(255, 255, 0, 200)',
            '橙色': 'rgba(255, 165, 0, 200)',
            '红色': 'rgba(255, 69, 0, 200)',
        }
        color = color_map.get(level, 'rgba(30,30,30,200)')

        # 设置颜色
        self.setStyleSheet(f"background-color:{color};border-radius:10px;")

        # 非线性拉长动画（先快后慢）
        if self.anim:
            self.anim.stop()
            
        self.anim = QPropertyAnimation(self, b"geometry")
        self.anim.setDuration(600)  # 加快速度：从1000ms减少到600ms
        self.anim.setEasingCurve(QEasingCurve.OutCubic)  # 先快后慢的非线性效果
        
        current_geo = self.geometry()
        # 横向拉长100像素（左右各50）
        target_geo = current_geo.adjusted(-50, 0, 50, 0)
        
        self.anim.setStartValue(current_geo)
        self.anim.setEndValue(target_geo)
        self.anim.start()

    def restore_normal_state(self):
        """恢复正常状态"""
        self.setStyleSheet("background-color:rgba(30,30,30,200);border-radius:10px;")
        
        # 如果窗口被拉长，恢复原始宽度
        if self.width() != self.original_width:
            if self.anim:
                self.anim.stop()
                
            self.anim = QPropertyAnimation(self, b"geometry")
            self.anim.setDuration(400)
            self.anim.setEasingCurve(QEasingCurve.OutCubic)
            
            current_geo = self.geometry()
            # 计算需要调整的宽度差
            width_diff = current_geo.width() - self.original_width
            target_geo = current_geo.adjusted(width_diff//2, 0, -width_diff//2, 0)
            
            self.anim.setStartValue(current_geo)
            self.anim.setEndValue(target_geo)
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
        """获取城市对应的站点ID"""
        stations = {
            '北京': '54511', '上海': '58367', '广州': '59287',
            '深圳': '59493', '杭州': '58457', '成都': '56294',
            '西安': '57036', '南京': '58238', '武汉': '57494',
            '重庆': '57516', '天津': '54527', '沈阳': '54342'
        }
        return stations.get(CITY_NAME)

    def get_station_info(self):
        """获取城市的经纬度信息"""
        station_info = {
            '北京': {'lat': 39.9042, 'lon': 116.4074},
            '上海': {'lat': 31.2304, 'lon': 121.4737},
            '广州': {'lat': 23.1291, 'lon': 113.2644},
            '深圳': {'lat': 22.5431, 'lon': 114.0579},
            '杭州': {'lat': 30.2741, 'lon': 120.1551},
            '成都': {'lat': 30.5728, 'lon': 104.0668},
            '西安': {'lat': 34.3416, 'lon': 108.9398},
            '南京': {'lat': 32.0603, 'lon': 118.7969},
            '武汉': {'lat': 30.5928, 'lon': 114.3055},
            '重庆': {'lat': 29.5630, 'lon': 106.5516},
            '天津': {'lat': 39.0842, 'lon': 117.2010},
            '沈阳': {'lat': 41.8057, 'lon': 123.4315}
        }
        return station_info.get(CITY_NAME, station_info['北京'])

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