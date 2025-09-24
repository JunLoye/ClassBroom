import sys
import time
import logging
import json
from datetime import datetime
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QHBoxLayout, 
                             QLabel, QVBoxLayout, QFrame, QPushButton, QMenu, 
                             QSystemTrayIcon, QStyle, QDialog, QTextEdit, QVBoxLayout)
from PyQt6.QtCore import Qt, pyqtSignal, QThread, QTimer
from PyQt6.QtGui import QFont, QGuiApplication, QFont, QColor

from get_weather import get_weather, get_weather_warning

with open('CONFIG.json', 'r') as f:
    CONFIG = json.load(f)

class WeatherWorker(QThread):
    weather_data = pyqtSignal(dict)
    warning_data = pyqtSignal(list)
    error_occurred = pyqtSignal(str)
    
    def __init__(self, location='113.65,22.77', update_interval=300):
        super().__init__()
        self.location = location
        self.update_interval = update_interval
        self.running = True
        
    def run(self):
        while self.running:
            try:
                data = get_weather(location=self.location)
                if data:
                    self.weather_data.emit(data)
                
                warnings = get_weather_warning(location=self.location)
                if warnings:
                    self.warning_data.emit(warnings)
                    
            except Exception as e:
                self.error_occurred.emit(str(e))
            
            time.sleep(self.update_interval)
    
    def stop(self):
        self.running = False

class WeatherWidget(QFrame):
    def __init__(self, value, unit="", tooltip="", parent=None):
        super().__init__(parent)
        self.setFrameStyle(QFrame.Shape.NoFrame)
        self.setFixedSize(120, 60)
        
        layout = QVBoxLayout()
        icon_value_layout = QHBoxLayout()
        icon_value_layout.setContentsMargins(0, 0, 0, 0)
        icon_value_layout.setSpacing(5)
        
        self.value_label = QLabel(value)
        self.value_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.value_label.setStyleSheet("color: #2c3e50; font-size: 18px; font-weight: bold;")
        
        self.unit_label = QLabel(unit)
        self.unit_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.unit_label.setStyleSheet("color: #4a4a4a; font-size: 12px;")
        
        icon_value_layout.addWidget(self.value_label)
        icon_value_layout.addWidget(self.unit_label)
        
        layout.addLayout(icon_value_layout)
        self.setLayout(layout)
        
        if tooltip:
            self.setToolTip(tooltip)
    
    def update_value(self, value, unit=""):
        self.value_label.setText(str(value))
        self.unit_label.setText(unit)

class WeatherApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.warning_count = 0
        self.tray_icon = None
        self.is_minimized_to_tray = False
        self.previous_warning_ids = set()
        self.init_ui()
        self.init_tray()
        self.init_worker()

    def init_ui(self):
        self.setWindowTitle("天气监测")
        self.setFixedHeight(50)
        self.setMinimumWidth(0)

        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self.setStyleSheet("""
            QMainWindow {
                background: #f4f6f7;
                border-radius: 10px;
            }
        """)

        self.central_widget = QWidget()
        self.central_widget.setStyleSheet("""
            QWidget {
                background: #f4f6f7;
                border-radius: 8px;
            }
        """)
        self.setCentralWidget(self.central_widget)

        main_layout = QHBoxLayout()
        main_layout.setContentsMargins(4, 2, 4, 1)
        main_layout.setSpacing(2)

        self.condition_widget = WeatherWidget("--", "", "天气状况")
        main_layout.addWidget(self.condition_widget)

        self.temp_widget = WeatherWidget("--", "°C", "温度")
        main_layout.addWidget(self.temp_widget)

        self.humidity_widget = WeatherWidget("--", "%", "湿度")
        main_layout.addWidget(self.humidity_widget)

        self.wind_widget = WeatherWidget("--", "km/h", "风速")
        main_layout.addWidget(self.wind_widget)

        self.winddir_widget = WeatherWidget("--", "", "风向")
        main_layout.addWidget(self.winddir_widget)

        self.pressure_widget = WeatherWidget("--", "hPa", "气压")
        main_layout.addWidget(self.pressure_widget)

        self.warning_widget = WeatherWidget("--", "--", "预警信息")
        self.warning_widget.setFixedSize(120, 40)
        self.warning_widget.mousePressEvent = self.show_warning_details
        main_layout.addWidget(self.warning_widget)

        self.update_widget = WeatherWidget("--", "", "更新时间")
        main_layout.addWidget(self.update_widget)

        # Close button
        close_btn = QPushButton("×")
        close_btn.setFixedSize(30, 30)
        close_btn.setStyleSheet("""
            QPushButton {
                background: #e74c3c;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 16px;
            }
            QPushButton:hover {
                background: #c0392b;
            }
        """)
        close_btn.clicked.connect(self.close)
        close_btn.setToolTip("关闭应用")

        main_layout.addWidget(close_btn)
        self.central_widget.setLayout(main_layout)

    def show_warning_details(self, event):
        warnings = get_weather_warning()

        if not warnings:
            self.show_error("没有找到有效的预警数据")
            return

        dialog = QDialog(self)
        dialog.setWindowTitle("预警详情")
        dialog.setFixedSize(500, 400)
        dialog.setStyleSheet("""
            QDialog {
                background: #f4f6f7;
                border-radius: 10px;
            }
            QTextEdit {
                background: #ffffff;
                border: none;
                font-size: 14px;
                color: #333;
            }
        """)

        layout = QVBoxLayout(dialog)
        text_edit = QTextEdit(dialog)
        text_edit.setReadOnly(True)

        warning_details = ""
        for i, warning in enumerate(warnings, start=1):
            title = warning.get("title", "--")
            type_info = warning.get("typeName", "--")
            level = warning.get("level", "--")
            severity = warning.get("severity", "--")
            status = warning.get("status", "--")
            sender = warning.get("sender", "--")
            pubTime = warning.get("pubTime", "--")
            text = warning.get("text", "--")
            warning_details += f"""预警 {i}:
预警名称：{title}
预警类型：{type_info}
预警级别：{level}
严重等级：{severity}
发布状态：{status}
发布单位：{sender}
发布时间：{pubTime}
详细内容：{text}

"""

        text_edit.setText(warning_details.strip())
        layout.addWidget(text_edit)
        dialog.setLayout(layout)
        dialog.exec()

    def init_tray(self):
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.tray_icon = QSystemTrayIcon(self)
            self.tray_icon.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon))

            tray_menu = QMenu()
            show_action = tray_menu.addAction("显示窗口")
            show_action.triggered.connect(self.showNormal)
            hide_action = tray_menu.addAction("隐藏窗口")
            hide_action.triggered.connect(self.hide_to_tray)
            tray_menu.addSeparator()
            quit_action = tray_menu.addAction("退出")
            quit_action.triggered.connect(self.quit_application)
            self.tray_icon.setContextMenu(tray_menu)
            self.tray_icon.show()
            self.tray_icon.setToolTip("天气监测")

    def init_worker(self):
        self.worker = WeatherWorker(location=CONFIG['default_location'], update_interval=CONFIG['update_interval'])
        self.worker.weather_data.connect(self.update_weather)
        self.worker.warning_data.connect(self.update_warnings)
        self.worker.error_occurred.connect(self.show_error)
        self.worker.start()

    def update_weather(self, data):
        try:
            if 'temp' in data:
                self.temp_widget.update_value(data['temp'], "°C")
            if 'humidity' in data:
                self.humidity_widget.update_value(data['humidity'], "%")
            if 'windSpeed' in data:
                self.wind_widget.update_value(data['windSpeed'], "km/h")
            if 'windDir' in data:
                self.winddir_widget.update_value(data['windDir'], "")
            if 'pressure' in data:
                self.pressure_widget.update_value(data['pressure'], "hPa")
            if 'text' in data:
                self.condition_widget.update_value(data['text'], "")
            current_time = datetime.now().strftime("%H:%M")
            self.update_widget.update_value(current_time, "")
        except Exception as e:
            self.show_error(f"更新天气数据时出错: {e}")

    def update_warnings(self, warnings):
        """更新预警信息并根据优先级显示"""
        self.warning_count = len(warnings)
        if self.warning_count > 0:
            priority_order = {"台风": 1, "暴雨": 2}
            warnings.sort(key=lambda w: priority_order.get(w.get("typeName", ""), 99))

            highest_priority_warning = warnings[0]
            type_name = highest_priority_warning.get("typeName", "--")
            level = highest_priority_warning.get("level", "--")
            warning_id = highest_priority_warning.get("id", None)

            if warning_id and warning_id not in self.previous_warning_ids:
                self.previous_warning_ids.add(warning_id)
                self.show_notification(type_name, level)

            self.warning_widget.update_value(type_name, level)

            self.warning_widget.setStyleSheet("""
                QFrame {
                    background: #ff6b6b;
                }
                QLabel {
                    color: white;
                }
            """)
        else:
            self.warning_widget.update_value("--", "--")
            self.warning_widget.setStyleSheet("")

    def show_notification(self, type_name, level):
        """显示系统通知"""
        self.tray_icon.showMessage(f"天气预警: {type_name}", f"预警级别: {level}", QSystemTrayIcon.MessageIcon.Warning, 5000)

    def show_error(self, error_msg):
        logging.error(f"程序错误: {error_msg}")

    def quit_application(self):
        if hasattr(self, 'worker'):
            self.worker.stop()
            self.worker.wait(2000)
        QApplication.quit()

    def hide_to_tray(self):
        self.hide()
        self.is_minimized_to_tray = True

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_start_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if event.buttons() == Qt.MouseButton.LeftButton and hasattr(self, 'drag_start_position'):
            self.move(event.globalPosition().toPoint() - self.drag_start_position)
            event.accept()

def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    font = QFont("Microsoft YaHei", 12)
    app.setFont(font)
    window = WeatherApp()
    screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
    center_x = screen_geometry.center().x() - window.width() // 2
    center_y = screen_geometry.center().y() - window.height() // 2
    window.move(center_x, center_y)
    window.show()
    sys.exit(app.exec())

if __name__ == '__main__':
    main()
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    font = QFont("Microsoft YaHei", 12)
    app.setFont(font)
    window = WeatherApp()
    screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
    center_x = screen_geometry.center().x() - window.width() // 2
    center_y = screen_geometry.center().y() - window.height() // 2
    window.move(center_x, center_y)
    window.show()
    sys.exit(app.exec())

if __name__ == '__main__':
    main()
