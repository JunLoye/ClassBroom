# 导入必要的Python标准库
import sys  # 提供对Python解释器使用或维护的一些变量的访问，以及与解释器强烈交互的函数
import time  # 提供各种时间相关的函数
import logging
import json  # 用于处理JSON数据
from datetime import datetime  # 提供日期和时间相关的类
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QHBoxLayout, 
                             QLabel, QVBoxLayout, QFrame, QPushButton, QMenu, 
                             QSystemTrayIcon, QStyle, QDialog, QTextEdit, QVBoxLayout)
from PyQt6.QtCore import QTimer, Qt, pyqtSignal, QThread, QSize, QRectF, QEasingCurve, QPropertyAnimation, QRect, QPoint
from PyQt6.QtGui import QFont, QPalette, QColor, QPainter, QIcon, QGuiApplication, QFont
from PyQt6.QtSvg import QSvgRenderer

from get_weather import get_weather, get_weather_warning

# 获取配置文件内容
with open('config.json', 'r') as f:
    config = json.load(f)

# 创建SVG图标数据(内嵌图标，避免外部文件依赖）
WEATHER_ICONS = {
    "location": "",
    "temperature": "",
    "humidity": "",
    "wind": "",
    "pressure": "",
    "condition": "",
    "warning": "",
    "update": "",
    "refresh": ""
}

class SvgIcon(QWidget):
    """SVG图标组件"""
    def __init__(self, svg_data, size=32, color="#2c3e50", parent=None):
        super().__init__(parent)
        self.svg_data = svg_data
        self.size = size
        self.color = color
        self.setFixedSize(size, size)

    def paintEvent(self, event):
        painter = QPainter(self)
        renderer = QSvgRenderer(self.svg_data.encode('utf-8'))
        painter.setBrush(QColor(self.color))  # Set icon color
        renderer.render(painter, QRectF(self.rect()))

class WeatherWorker(QThread):
    """工作线程，用于获取天气数据"""
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
                # 获取常规天气数据
                data = get_weather(location=self.location)
                if data:
                    self.weather_data.emit(data)
                
                # 获取预警信息
                warnings = get_weather_warning(location=self.location)
                if warnings:
                    self.warning_data.emit(warnings)
                    
            except Exception as e:
                self.error_occurred.emit(str(e))
            
            time.sleep(self.update_interval)  # 根据配置更新频率
    
    def stop(self):
        self.running = False

class WeatherWidget(QFrame):
    """单个天气信息组件"""
    def __init__(self, icon_svg, value, unit="", tooltip="", parent=None):
        super().__init__(parent)
        self.setFrameStyle(QFrame.Shape.NoFrame)
        self.setFixedSize(120, 60)
        
        layout = QVBoxLayout()
        layout.setContentsMargins(5, 2, 5, 2)  # Reduced margins
        layout.setSpacing(2)
        
        # 图标和数值单位水平布局
        icon_value_layout = QHBoxLayout()
        icon_value_layout.setContentsMargins(0, 0, 0, 0)
        icon_value_layout.setSpacing(5)
        
        # 图标
        self.icon = SvgIcon(icon_svg, 32)
        icon_value_layout.addWidget(self.icon)
        
        # 数值和单位
        self.value_label = QLabel(value)
        self.value_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.value_label.setStyleSheet("color: #2c3e50; font-size: 20px; font-weight: bold;")
        
        self.unit_label = QLabel(unit)
        self.unit_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.unit_label.setStyleSheet("color: #4a4a4a; font-size: 16px;")
        
        icon_value_layout.addWidget(self.value_label)
        icon_value_layout.addWidget(self.unit_label)
        
        layout.addLayout(icon_value_layout)
        self.setLayout(layout)
        
        # 设置提示文本
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
        self.init_ui()
        self.init_tray()
        self.init_worker()

    def init_ui(self):
        self.setWindowTitle("天气监测")
        self.setFixedHeight(70)  # 设置窗口高度
        self.setMinimumWidth(800)

        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        # Apply rounded corners
        self.setStyleSheet("""
            QMainWindow {
                border-radius: 10px;
                background: #f4f6f7;
            }
        """)

        central_widget = QWidget()
        central_widget.setStyleSheet("""
            QWidget {
                background: #f0f0f0;
                border-radius: 5px;
            }
        """)
        self.setCentralWidget(central_widget)
        
        # 主布局
        main_layout = QHBoxLayout()
        main_layout.setContentsMargins(5, 5, 5, 5)
        main_layout.setSpacing(5)

        # 天气状况
        self.condition_widget = WeatherWidget(
            WEATHER_ICONS["condition"], "--", "", "天气状况"
        )
        main_layout.addWidget(self.condition_widget)

        # 温度
        self.temp_widget = WeatherWidget(
            WEATHER_ICONS["temperature"], "--", "°C", "温度"
        )
        main_layout.addWidget(self.temp_widget)

        # 湿度
        self.humidity_widget = WeatherWidget(
            WEATHER_ICONS["humidity"], "--", "%", "湿度"
        )
        main_layout.addWidget(self.humidity_widget)

        # 风速
        self.wind_widget = WeatherWidget(
            WEATHER_ICONS["wind"], "--", "km/h", "风速"
        )
        main_layout.addWidget(self.wind_widget)

        # 风向
        self.winddir_widget = WeatherWidget(
            WEATHER_ICONS["wind"], "--", "", "风向"
        )
        main_layout.addWidget(self.winddir_widget)

        # 气压
        self.pressure_widget = WeatherWidget(
            WEATHER_ICONS["pressure"], "--", "hPa", "气压"
        )
        main_layout.addWidget(self.pressure_widget)

        # 预警信息
        self.warning_widget = WeatherWidget(
            WEATHER_ICONS["warning"], "--", "--", "预警信息"
        )
        self.warning_widget.setFixedSize(120, 60)  # 设置宽度为120，高度为60
        self.warning_widget.mousePressEvent = self.show_warning_details
        main_layout.addWidget(self.warning_widget)

        # 更新时间
        self.update_widget = WeatherWidget(
            WEATHER_ICONS["update"], "--", "", "更新时间"
        )
        main_layout.addWidget(self.update_widget)

        # 关闭按钮
        close_btn = QPushButton("×")
        close_btn.setFixedSize(30, 30)
        close_btn.setStyleSheet("""
            QPushButton {
                background: #e74c3c;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 18px;
                font-weight: bold;
            }
            QPushButton:hover {
                background: #c0392b;
            }
        """)
        close_btn.clicked.connect(self.close)
        close_btn.setToolTip("关闭应用")

        # 添加关闭按钮到布局
        main_layout.addWidget(close_btn)

        central_widget.setLayout(main_layout)

    def show_warning_details(self, event):
        """显示预警详情"""
        # Retrieve the latest warning data
        warning_data = self.warning_widget.value_label.text()  # Assuming type name is stored in the label
        warning_level = self.warning_widget.unit_label.text()  # Assuming level is stored in the unit label

        # Read the warning details from the loaded alert.json data
        alert_data = None
        try:
            with open('alert.json', 'r', encoding='utf-8') as f:
                alert_data = json.load(f)
        except Exception as e:
            self.show_error(f"加载预警数据失败: {e}")
            return

        # Find the first warning in the data (assuming one warning is available)
        if alert_data and "warning" in alert_data and len(alert_data["warning"]) > 0:
            warning = alert_data["warning"][0]
            title = warning.get("title", "未知预警")
            type_info = warning.get("typeName", "未知类型")
            level = warning.get("level", "未知级别")
            severity = warning.get("severity", "未知严重等级")
            status = warning.get("status", "未知状态")
            sender = warning.get("sender", "未知来源")
            pubTime = warning.get("pubTime", "未知发布时间")
            text = warning.get("text", "未知详细内容")

            # Prepare detailed information to display
            warning_details = f"""预警名称：{title}
预警类型：{type_info}
预警级别：{level}
严重等级：{severity}
发布状态：{status}
发布单位：{sender}
发布时间：{pubTime}
详细内容：{text}"""

            # Create a dialog to display warning details
            dialog = QDialog(self)
            dialog.setWindowTitle("预警详情")
            dialog.setFixedSize(400, 300)

            layout = QVBoxLayout(dialog)
            text_edit = QTextEdit(dialog)
            text_edit.setText(warning_details.strip())
            text_edit.setReadOnly(True)
            text_edit.setStyleSheet("font-size: 14px; color: #ddd;")
            layout.addWidget(text_edit)

            dialog.setLayout(layout)
            dialog.exec()
        else:
            self.show_error("没有找到有效的预警数据")


    def init_tray(self):
        """初始化系统托盘"""
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.tray_icon = QSystemTrayIcon(self)
            self.tray_icon.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon))

            # 创建托盘菜单
            tray_menu = QMenu()
            show_action = tray_menu.addAction("显示窗口")
            show_action.triggered.connect(self.show_normal)
            hide_action = tray_menu.addAction("隐藏窗口")
            hide_action.triggered.connect(self.hide_to_tray)
            tray_menu.addSeparator()
            quit_action = tray_menu.addAction("退出")
            quit_action.triggered.connect(self.quit_application)
            self.tray_icon.setContextMenu(tray_menu)
            self.tray_icon.show()
            self.tray_icon.setToolTip("天气监测")

    def init_worker(self):
        """初始化工作线程"""
        self.worker = WeatherWorker(location=config['default_location'], update_interval=config['update_interval'])
        self.worker.weather_data.connect(self.update_weather)
        self.worker.warning_data.connect(self.update_warnings)
        self.worker.error_occurred.connect(self.show_error)
        self.worker.start()

    def update_weather(self, data):
        """更新天气数据显示"""
        try:
            if 'temp' in data:
                self.temp_widget.update_value(data['temp'], "°C")
            if 'humidity' in data:
                self.humidity_widget.update_value(data['humidity'], "%")
            if 'windSpeed' in data:
                self.wind_widget.update_value(data['windSpeed'], "km/h")
            if 'windDir' in data:
                wind_dir = data['windDir']
                self.winddir_widget.update_value(wind_dir, "")
            if 'pressure' in data:
                self.pressure_widget.update_value(data['pressure'], "hPa")
            if 'text' in data:
                condition = data['text']
                self.condition_widget.update_value(condition, "")
            current_time = datetime.now().strftime("%H:%M")
            self.update_widget.update_value(current_time, "")
            if self.tray_icon:
                temp_text = data.get('temp', '--')
                condition_text = data.get('text', '未知')
                self.tray_icon.setToolTip(f"温度: {temp_text}°C {condition_text}")
        except Exception as e:
            self.show_error(f"更新数据错误: {str(e)}")

    def update_warnings(self, warnings):
        """更新预警信息"""
        self.warning_count = len(warnings)
        if self.warning_count > 0 and isinstance(warnings[0], dict):
            type_name = warnings[0].get("typeName", "--")
            level = warnings[0].get("level", "--")
            severityColor = warnings[0].get("severityColor", "")  # 修复未定义问题
            self.warning_widget.update_value(type_name, level)
            warning_color = "White"
            if severityColor == "Blue":
                warning_color = "#3498db"
            elif severityColor == "Yellow":
                warning_color = "#f1c40f"
            elif severityColor == "Orange":
                warning_color = "#e67e22"
            elif severityColor == "Red":
                warning_color = "#ff6b6b"
            self.warning_widget.setStyleSheet("""
                QFrame {
                    background:"""+warning_color+""";
                }
                QLabel {
                    color: #222222;
                }
            """)
        else:
            self.warning_widget.update_value("--", "--")
            self.warning_widget.setStyleSheet("")

    def show_error(self, error_msg):
        """显示错误信息"""
        logging.error(f"程序错误: {error_msg}")

    def quit_application(self):
        """退出应用程序"""
        if hasattr(self, 'worker'):
            self.worker.stop()
            self.worker.wait(2000)
        QApplication.quit()

    def closeEvent(self, event):
        """关闭窗口事件"""
        if self.tray_icon and self.tray_icon.isVisible():
            self.hide_to_tray()
            event.ignore()
        else:
            self.quit_application()
            event.accept()

    def hide_to_tray(self):
        """隐藏到系统托盘"""
        self.hide()
        self.is_minimized_to_tray = True

    def show_normal(self):
        """从托盘恢复显示"""
        self.show()
        self.raise_()
        self.activateWindow()
        self.is_minimized_to_tray = False

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
    window.setFixedHeight(80)  # 再次确保窗口高度
    screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
    # 设置窗口初始位置在屏幕中央
    center_x = screen_geometry.center().x() - window.width() // 2
    center_y = screen_geometry.center().y() - window.height() // 2
    window.move(center_x, center_y)
    window.show()
    sys.exit(app.exec())

if __name__ == '__main__':
    main()
