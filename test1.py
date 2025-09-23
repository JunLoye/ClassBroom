from PyQt5.QtWidgets import QApplication, QMainWindow, QLabel
from PyQt5.QtCore import Qt, QTimer, QPropertyAnimation
import requests
import sys

class AlertWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("实时预警")
        self.setGeometry(100, 100, 400, 200)

        # 标签显示预警信息
        self.label = QLabel("暂无预警", self)
        self.label.setAlignment(Qt.AlignCenter)
        self.setCentralWidget(self.label)

        # 定时器定期检查预警信息
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.check_alerts)
        self.timer.start(60000)  # 每分钟检查一次

        # 默认置于底部
        self.setWindowFlags(Qt.WindowStaysOnBottomHint | Qt.FramelessWindowHint)
        self.show()

    def check_alerts(self):
        # 使用真实的地震和天气预警 API
        try:
            earthquake_response = requests.get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson")
            weather_response = requests.get("https://api.weather.gov/alerts")

            earthquake_data = earthquake_response.json()
            weather_data = weather_response.json()

            # 检查地震预警
            if earthquake_data["features"]:
                alert_message = f"地震预警: {earthquake_data['features'][0]['properties']['place']}"
                self.show_alert(alert_message)
                return

            # 检查天气预警
            if weather_data.get("features"):
                alert_message = f"天气预警: {weather_data['features'][0]['properties']['headline']}"
                self.show_alert(alert_message)
                return

            # 如果没有预警
            self.clear_alert()
        except Exception as e:
            print(f"Error fetching alerts: {e}")

    def show_alert(self, alert_message):
        self.label.setText(alert_message)
        self.setWindowFlags(Qt.WindowStaysOnTopHint | Qt.FramelessWindowHint)
        self.show()

        # 动效显示
        animation = QPropertyAnimation(self, b"windowOpacity")
        animation.setDuration(1000)
        animation.setStartValue(0.0)
        animation.setEndValue(1.0)
        animation.start()

    def clear_alert(self):
        self.label.setText("暂无预警")
        self.setWindowFlags(Qt.WindowStaysOnBottomHint | Qt.FramelessWindowHint)
        self.show()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = AlertWindow()
    sys.exit(app.exec_())