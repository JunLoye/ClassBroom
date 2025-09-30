import sys
import time
import logging
import json
import os
from datetime import datetime
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QHBoxLayout,
                             QLabel, QVBoxLayout, QFrame, QPushButton, QMenu,
                             QSystemTrayIcon, QStyle, QDialog,
                             QFormLayout, QLineEdit, QSpinBox, QDialogButtonBox,
                             QComboBox, QCheckBox, QScrollArea)
from PyQt6.QtCore import Qt, pyqtSignal, QThread
from PyQt6.QtGui import QFont, QGuiApplication
from api.get_weather import get_weather, get_weather_warning

# ----------------------- 日志配置 -----------------------
def get_path(relative_path):
    try:
        base_path = getattr(sys, '_MEIPASS', None) or os.path.abspath(".")
    except AttributeError:
        base_path = os.path.abspath(".")
    return os.path.normpath(os.path.join(base_path, relative_path))

log_file = "ClassBroom.log"
logger = logging.getLogger()
logger.setLevel(logging.INFO)

if not logger.handlers:
    file_handler = logging.FileHandler(log_file, mode='a', encoding='utf-8')
    file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)

logging.info("程序启动")

# ----------------------- 配置文件 -----------------------
default_config = {
    "location": "101010100",
    "update_interval": 300,
    "api_key": "your_apiKey",
    "language": "zh",
    "temperature_unit": "C",
    "autostart": False,
    "notifications": True,
    "theme": "light"
}

try:
    with open('config.json', 'r', encoding='utf-8') as f:
        CONFIG = json.load(f)
    logging.info("配置文件加载成功")
except Exception as e:
    logging.warning(f"读取配置文件失败，使用默认配置: {e}")
    with open('config.json', 'w', encoding='utf-8') as f:
        json.dump(default_config, f, indent=4, ensure_ascii=False)
    CONFIG = default_config.copy()

# ----------------------- 天气线程 -----------------------
class WeatherWorker(QThread):
    weather_data = pyqtSignal(dict)
    warning_data = pyqtSignal(list)
    error_occurred = pyqtSignal(str)

    def __init__(self, location='', update_interval=300):
        super().__init__()
        self.location = location
        self.update_interval = update_interval
        self.running = True

    def run(self):
        logging.info("天气线程启动")
        while self.running:
            try:
                data = get_weather(CONFIG=CONFIG)
                if data:
                    logging.info(f"天气数据获取成功: {data}")
                    self.weather_data.emit(data)
                warnings = get_weather_warning(CONFIG)
                if warnings is not None:
                    logging.info(f"预警数据获取成功: {warnings}")
                    self.warning_data.emit(warnings)
            except Exception as e:
                logging.error(f"天气更新线程出错: {e}")
                self.error_occurred.emit(str(e))
            time.sleep(self.update_interval)

    def stop(self):
        self.running = False
        logging.info("天气线程停止")

# ----------------------- 天气小组件 -----------------------
class WeatherWidget(QFrame):
    def __init__(self, value="", unit="", tooltip="", parent=None):
        super().__init__(parent)
        self.setFrameStyle(QFrame.Shape.NoFrame)
        self.setFixedSize(100, 50)
        layout = QHBoxLayout()
        layout.setContentsMargins(2, 2, 2, 2)
        layout.setSpacing(5)
        text_layout = QVBoxLayout()
        text_layout.setContentsMargins(0, 0, 0, 0)
        text_layout.setSpacing(0)
        self.value_label = QLabel(value)
        self.value_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.value_label.setStyleSheet("color: #2c3e50; font-size: 16px; font-weight: bold;")
        self.unit_label = QLabel(unit)
        self.unit_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.unit_label.setStyleSheet("color: #4a4a4a; font-size: 12px;")
        text_layout.addWidget(self.value_label)
        text_layout.addWidget(self.unit_label)
        layout.addLayout(text_layout)
        self.setLayout(layout)
        if tooltip:
            self.setToolTip(tooltip)

    def update_value(self, value, unit=""):
        self.value_label.setText(str(value))
        self.unit_label.setText(unit)
        logging.debug(f"Widget更新: value={value}, unit={unit}")

# ----------------------- 预警详情窗口 -----------------------
class WarningDetailDialog(QDialog):
    def __init__(self, warnings: list, parent=None):
        super().__init__(parent)
        self.setWindowTitle("预警详情")
        self.setModal(True)
        self.resize(400, 300)
        layout = QVBoxLayout(self)

        scroll = QScrollArea(self)
        scroll.setWidgetResizable(True)
        content = QWidget()
        scroll.setWidget(content)
        v = QVBoxLayout(content)

        for warn in warnings:
            wn = warn.get("typeName", "--")
            lvl = warn.get("level", "--")
            desc = warn.get("text", "--")
            status = warn.get("status", "--")
            pub_time = warn.get("pubTime", "--")
            sender = warn.get("sender", "--")

            lbl = QLabel(f"类型: {wn} 级别: {lvl}")
            lbl_pub_time = QLabel(f"发布时间: {pub_time}")
            lbl_status = QLabel(f"状态: {status}")
            lbl_desc = QLabel(f"详情: {desc}")
            lbl_sender = QLabel(f"发布单位: {sender}")

            for l in [lbl, lbl_pub_time, lbl_status, lbl_desc, lbl_sender]:
                l.setWordWrap(True)

            v.addWidget(lbl)
            v.addWidget(lbl_pub_time)
            v.addWidget(lbl_status)
            v.addWidget(lbl_desc)
            v.addWidget(lbl_sender)
            v.addSpacing(10)

        layout.addWidget(scroll)
        btns = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok)
        btns.accepted.connect(self.accept)
        layout.addWidget(btns)

# ----------------------- 设置窗口 -----------------------
class SettingsDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("设置")
        self.setFixedSize(400, 350)
        layout = QVBoxLayout(self)

        form_layout = QFormLayout()
        self.location_input = QLineEdit(CONFIG.get("location", "101010100"))
        self.api_key_input = QLineEdit(CONFIG.get("api_key", "your_apiKey"))
        self.update_interval_input = QSpinBox()
        self.update_interval_input.setRange(60, 3600)
        self.update_interval_input.setValue(CONFIG.get("update_interval", 300))

        self.language_select = QComboBox()
        self.language_select.addItems(["zh", "en"])
        self.language_select.setCurrentText(CONFIG.get("language", "zh"))

        self.temp_unit_select = QComboBox()
        self.temp_unit_select.addItems(["C", "F"])
        self.temp_unit_select.setCurrentText(CONFIG.get("temperature_unit", "C"))

        self.autostart_check = QCheckBox("开机自启")
        self.autostart_check.setChecked(CONFIG.get("autostart", False))

        self.notifications_check = QCheckBox("启用系统通知")
        self.notifications_check.setChecked(CONFIG.get("notifications", True))

        self.theme_select = QComboBox()
        self.theme_select.addItems(["light", "dark"])
        self.theme_select.setCurrentText(CONFIG.get("theme", "light"))

        form_layout.addRow("位置代码:", self.location_input)
        form_layout.addRow("API Key:", self.api_key_input)
        form_layout.addRow("更新间隔(秒):", self.update_interval_input)
        form_layout.addRow("语言:", self.language_select)
        form_layout.addRow("温度单位:", self.temp_unit_select)
        form_layout.addRow(self.autostart_check)
        form_layout.addRow(self.notifications_check)
        form_layout.addRow("主题:", self.theme_select)

        layout.addLayout(form_layout)
        button_box = QDialogButtonBox(QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel)
        button_box.accepted.connect(self.save_settings)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)

    def save_settings(self):
        CONFIG["location"] = self.location_input.text()
        CONFIG["api_key"] = self.api_key_input.text()
        CONFIG["update_interval"] = self.update_interval_input.value()
        CONFIG["language"] = self.language_select.currentText()
        CONFIG["temperature_unit"] = self.temp_unit_select.currentText()
        CONFIG["autostart"] = self.autostart_check.isChecked()
        CONFIG["notifications"] = self.notifications_check.isChecked()
        CONFIG["theme"] = self.theme_select.currentText()
        with open("config.json", "w", encoding="utf-8") as f:
            json.dump(CONFIG, f, indent=4, ensure_ascii=False)
        logging.info(f"配置已保存: {CONFIG}")
        self.accept()

# ----------------------- 主窗口 -----------------------
class WeatherApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.warning_count = 0
        self.tray_icon = None
        self.is_minimized_to_tray = False
        self.previous_warning_ids = set()
        self.current_warnings = []
        self.init_ui()
        self.init_tray()
        self.init_worker()

    def init_ui(self):
        self.setWindowTitle("天气监测")
        self.setFixedHeight(60)
        self.setMinimumWidth(950)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        theme = CONFIG.get("theme", "light")
        bg_color = "#f4f6f7" if theme == "light" else "#2c3e50"
        self.setStyleSheet(f"""
            QMainWindow {{
                background: {bg_color};
                border-radius: 10px;
            }}
        """)
        self.central_widget = QWidget()
        self.central_widget.setStyleSheet(f"""
            QWidget {{
                background: {bg_color};
                border-radius: 8px;
            }}
        """)
        self.setCentralWidget(self.central_widget)

        main_layout = QHBoxLayout()
        main_layout.setContentsMargins(8, 4, 8, 4)
        main_layout.setSpacing(8)

        self.condition_widget = WeatherWidget(value="--", tooltip="天气状况")
        main_layout.addWidget(self.condition_widget)
        self.temp_widget = WeatherWidget(value="--", unit="°C", tooltip="温度")
        main_layout.addWidget(self.temp_widget)
        self.humidity_widget = WeatherWidget(value="--", unit="%", tooltip="湿度")
        main_layout.addWidget(self.humidity_widget)
        self.wind_widget = WeatherWidget(value="--", unit="km/h", tooltip="风速")
        main_layout.addWidget(self.wind_widget)
        self.winddir_widget = WeatherWidget(value="--", tooltip="风向")
        main_layout.addWidget(self.winddir_widget)
        self.pressure_widget = WeatherWidget(value="--", unit="hPa", tooltip="气压")
        main_layout.addWidget(self.pressure_widget)
        
        self.warning_widget = WeatherWidget(value="--", unit="--", tooltip="预警信息")
        self.warning_widget.mousePressEvent = self.on_warning_clicked
        main_layout.addWidget(self.warning_widget)

        self.update_widget = WeatherWidget(value="--", unit="上次更新", tooltip="更新时间")
        main_layout.addWidget(self.update_widget)

        settings_btn = QPushButton("⚙")
        settings_btn.setFixedSize(30, 30)
        settings_btn.setStyleSheet("background: #3498db; color: white; border: none; border-radius: 10px;")
        settings_btn.clicked.connect(self.open_settings)
        main_layout.addWidget(settings_btn)

        close_btn = QPushButton("×")
        close_btn.setFixedSize(30, 30)
        close_btn.setStyleSheet("background: #e74c3c; color: white; border: none; border-radius: 10px;")
        close_btn.clicked.connect(self.close)
        close_btn.setToolTip("关闭应用")
        main_layout.addWidget(close_btn)

        self.central_widget.setLayout(main_layout)

    def init_tray(self):
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.tray_icon = QSystemTrayIcon(self)
            self.tray_icon.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon))
            tray_menu = QMenu()
            tray_menu.addAction("显示窗口").triggered.connect(self.showNormal)
            tray_menu.addAction("隐藏窗口").triggered.connect(self.hide_to_tray)
            tray_menu.addAction("设置").triggered.connect(self.open_settings)
            tray_menu.addSeparator()
            tray_menu.addAction("退出").triggered.connect(self.quit_application)
            self.tray_icon.setContextMenu(tray_menu)
            self.tray_icon.show()
            self.tray_icon.setToolTip("天气监测")
            logging.info("系统托盘初始化完成")

    def init_worker(self):
        self.worker = WeatherWorker(location=CONFIG['location'], update_interval=CONFIG['update_interval'])
        self.worker.weather_data.connect(self.update_weather)
        self.worker.warning_data.connect(self.update_warnings)
        self.worker.error_occurred.connect(self.show_error)
        self.worker.start()

    def update_weather(self, data):
        try:
            unit = CONFIG.get("temperature_unit", "C")
            temp = data.get("temp")
            if temp is not None and unit == "F":
                temp = round((temp * 9/5) + 32, 1)
            if temp is not None:
                self.temp_widget.update_value(temp, f"°{unit}")
            if 'humidity' in data:
                self.humidity_widget.update_value(data['humidity'], "%")
            if 'windSpeed' in data:
                self.wind_widget.update_value(data['windSpeed'], "km/h")
            if 'windDir' in data:
                self.winddir_widget.update_value(data['windDir'])
            if 'pressure' in data:
                self.pressure_widget.update_value(data['pressure'], "hPa")
            if 'text' in data:
                self.condition_widget.update_value(data['text'])
            current_time = datetime.now().strftime("%H:%M")
            self.update_widget.update_value(current_time, "上次更新")
            logging.info(f"天气界面已更新: {data}")
        except Exception as e:
            self.show_error(f"更新天气数据时出错: {e}")

    def update_warnings(self, warnings):
        self.current_warnings = warnings[:]
        self.warning_count = len(warnings)
        logging.info(f"预警更新: {warnings}")
        if self.warning_count > 0:
            highest = warnings[0]
            type_name = highest.get("typeName", "--")
            level = highest.get("level", "--")
            severityColor = highest.get("severityColor", "#cccccc")
            warning_id = highest.get("id", None)

            if warning_id and warning_id not in self.previous_warning_ids:
                self.previous_warning_ids.add(warning_id)
                if CONFIG.get("notifications", True) and self.tray_icon:
                    self.show_notification(type_name, level)

            self.warning_widget.update_value(type_name, level)
            warning_color = {
                "Red": "#ff3b3b",
                "Yellow": "#f0dc30",
                "Orange": "#d35400"
            }.get(severityColor, "#cccccc")
            self.warning_widget.setStyleSheet(f"QFrame {{background: {warning_color};}} QLabel {{color: white;}}")
        else:
            self.warning_widget.update_value("--", "--")
            self.warning_widget.setStyleSheet("")

    def show_notification(self, type_name, level):
        if self.tray_icon:
            self.tray_icon.showMessage(f"天气预警: {type_name}",
                                       f"预警级别: {level}",
                                       QSystemTrayIcon.MessageIcon.Warning, 5000)
            logging.info(f"发送预警通知: {type_name} 级别: {level}")

    def show_error(self, error_msg):
        logging.error(f"程序错误: {error_msg}")

    def quit_application(self):
        logging.info("应用退出")
        if hasattr(self, 'worker'):
            self.worker.stop()
            self.worker.wait(2000)
        QApplication.quit()

    def hide_to_tray(self):
        self.hide()
        self.is_minimized_to_tray = True
        logging.info("窗口隐藏到托盘")

    def open_settings(self):
        dialog = SettingsDialog(self)
        if dialog.exec():
            if hasattr(self, 'worker'):
                self.worker.stop()
                self.worker.wait(2000)
            self.init_worker()
            self.init_ui()
            logging.info("设置更改已生效，重新初始化天气线程和UI")

    def on_warning_clicked(self, event):
        if self.current_warnings:
            dlg = WarningDetailDialog(self.current_warnings, parent=self)
            dlg.exec()
            logging.info("显示预警详情窗口")
        else:
            logging.info("点击预警Widget，但当前无预警")

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_start_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if event.buttons() == Qt.MouseButton.LeftButton and hasattr(self, 'drag_start_position'):
            self.move(event.globalPosition().toPoint() - self.drag_start_position)
            event.accept()

# ----------------------- 主函数 -----------------------
def main():
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
    logging.info("主窗口显示完成")
    sys.exit(app.exec())

if __name__ == '__main__':
    main()
