import sys
import requests
from PyQt5.QtWidgets import (QApplication, QWidget, QLabel, QVBoxLayout, QSystemTrayIcon, QMenu, QAction)
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import Qt, QTimer, QPropertyAnimation, QPoint
from PyQt5 import QtCore

class WeatherFetcher:
    def __init__(self, api_key, city):
        self.api_key = api_key
        self.city = city
        self.weather_url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={api_key}"
        self.alert_url = ""  # 预警API地址，需补充

    def fetch_data(self):
        try:
            weather_response = requests.get(self.weather_url)
            weather_data = weather_response.json()
            alert_data = {}
            if self.alert_url:
                alert_response = requests.get(self.alert_url)
                if alert_response.status_code == 200:
                    alert_data = alert_response.json()
            return weather_data, alert_data
        except Exception as e:
            print(f"获取数据失败: {e}")
            return {}, {}

class WeatherApp(QWidget):
    def __init__(self, fetcher):
        super().__init__()
        self.fetcher = fetcher
        self.has_alert = False
        self.init_ui()
        self.init_tray()
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_weather_data)
        self.timer.start(600000)  # 10分钟
        self.update_weather_data()

    def init_ui(self):
        self.setWindowFlags(Qt.FramelessWindowHint)
        layout = QVBoxLayout()
        self.info_label = QLabel("正在获取天气信息...")
        layout.addWidget(self.info_label)
        self.setLayout(layout)

    def init_tray(self):
        tray_icon = QSystemTrayIcon(QIcon("weather_icon.png"), self)
        tray_menu = QMenu()
        show_action = QAction("显示", self)
        quit_action = QAction("退出", self)
        show_action.triggered.connect(self.show_normal)
        quit_action.triggered.connect(QApplication.quit)
        tray_menu.addAction(show_action)
        tray_menu.addAction(quit_action)
        tray_icon.setContextMenu(tray_menu)
        tray_icon.activated.connect(self.tray_icon_activated)
        tray_icon.show()
        self.tray_icon = tray_icon

    def tray_icon_activated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick or reason == 2:
            self.show_normal()

    def show_normal(self):
        self.show()
        self.activateWindow()

    def update_weather_data(self):
        weather, alert = self.fetcher.fetch_data()
        if alert:
            self.trigger_alert(alert.get('message', '收到预警信息'))
        else:
            self.clear_alert()
            self.update_weather_display(weather)

    def trigger_alert(self, alert_message):
        self.has_alert = True
        self.info_label.setText(f"<font color='red'>预警！{alert_message}</font>")
        self.setWindowFlags(self.windowFlags() | Qt.WindowStaysOnTopHint)
        self.show()
        self.play_alert_animation()

    def play_alert_animation(self):
        self.animation = QPropertyAnimation(self, b"pos")
        self.animation.setDuration(500)
        current_pos = self.pos()
        self.animation.setKeyValueAt(0, current_pos)
        self.animation.setKeyValueAt(0.1, current_pos + QPoint(5, 0))
        self.animation.setKeyValueAt(0.2, current_pos + QPoint(-5, 0))
        self.animation.setKeyValueAt(0.3, current_pos + QPoint(5, 0))
        self.animation.setKeyValueAt(0.4, current_pos + QPoint(-5, 0))
        self.animation.setKeyValueAt(0.5, current_pos + QPoint(5, 0))
        self.animation.setKeyValueAt(0.6, current_pos + QPoint(-5, 0))
        self.animation.setKeyValueAt(0.7, current_pos + QPoint(5, 0))
        self.animation.setKeyValueAt(0.8, current_pos + QPoint(-5, 0))
        self.animation.setKeyValueAt(1, current_pos)
        self.animation.start()

    def focusInEvent(self, event):
        super().focusInEvent(event)

    def focusOutEvent(self, event):
        if not self.has_alert and not self.isActiveWindow():
            self.setWindowFlags(Qt.FramelessWindowHint)
            self.show()
        super().focusOutEvent(event)

    def clear_alert(self):
        self.has_alert = False
        self.setWindowFlags(Qt.FramelessWindowHint)
        self.show()

    def update_weather_display(self, weather=None):
        if weather:
            desc = weather.get('weather', [{}])[0].get('description', '未知')
            temp = weather.get('main', {}).get('temp', '--')
            self.info_label.setText(f"天气：{desc} 温度：{temp}")
        else:
            self.info_label.setText("正在获取天气信息...")

if __name__ == "__main__":
    api_key = "你的APIKEY"
    city = "你的城市"
    fetcher = WeatherFetcher(api_key, city)
    app = QApplication(sys.argv)
    win = WeatherApp(fetcher)
    win.show()
    sys.exit(app.exec_())