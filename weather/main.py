# ----------------------- 导入模块 -----------------------
import sys
import time
import logging
import json
import webbrowser
from datetime import datetime
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QHBoxLayout,
                             QLabel, QVBoxLayout, QFrame, QPushButton, QMenu,
                             QDialog, QFormLayout, QLineEdit, QSpinBox, 
                             QDialogButtonBox, QComboBox, QCheckBox, QScrollArea)
from PyQt6.QtCore import Qt, pyqtSignal, QThread
from PyQt6.QtGui import QFont, QGuiApplication

try:
    from weather.api.get_weather import get_weather, get_weather_warning
    logging.info("成功导入天气API模块")
except ImportError:
    logging.error("未找到天气API模块，请检查是否已安装")


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
    with open('launcher_config.json', 'r', encoding='utf-8') as f:
        CONFIG = json.load(f)['apps']['weather']['config']
    logging.info("配置文件加载成功")
except Exception as e:
    logging.warning(f"读取配置文件失败: {e}")

# ----------------------- 天气线程 -----------------------
class WeatherWorker(QThread):
    weather_data = pyqtSignal(dict)
    warning_data = pyqtSignal(list)
    fxLink = pyqtSignal(str)
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
                warnings_data = get_weather_warning(CONFIG)
                logging.info(f"预警数据获取成功: {warnings_data}")
                if isinstance(warnings_data, dict):
                    warnings = warnings_data.get('warning')
                    fxLink = warnings_data.get('fxLink')
                    self.fxLink.emit(fxLink)
                    logging.info(f"fxLink更新为: {fxLink}")
                    if warnings is not None:
                        logging.info(f"预警数据获取成功: {warnings}")
                        self.warning_data.emit(warnings)
                else:
                    # 如果warnings_data不是字典类型，发送空预警列表
                    self.warning_data.emit([])
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
        self.setFixedSize(100, 40)
        layout = QHBoxLayout()
        layout.setContentsMargins(2, 2, 2, 2)
        layout.setSpacing(5)
        self.value_label = QLabel(value)
        self.value_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.value_label.setStyleSheet("color: #2c3e50; font-size: 17px; font-weight: bold;")
        self.unit_label = QLabel(unit)
        self.unit_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.unit_label.setStyleSheet("color: #4a4a4a; font-size: 14px;")
        layout.addWidget(self.value_label)
        layout.addWidget(self.unit_label)
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
        self.resize(700, 500)
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

        # 从配置文件中读取最新配置
        try:
            with open('launcher_config.json', 'r', encoding='utf-8') as f:
                current_config = json.load(f)['apps']['weather']['config']
            logging.info("设置窗口：成功读取最新配置文件")
        except Exception as e:
            logging.warning(f"设置窗口：读取配置文件失败，使用默认配置: {e}")
            current_config = default_config

        form_layout = QFormLayout()
        self.location_input = QLineEdit(current_config.get("location", "101010100"))
        self.api_key_input = QLineEdit(current_config.get("api_key", "your_apiKey"))
        self.update_interval_input = QSpinBox()
        self.update_interval_input.setRange(60, 3600)
        self.update_interval_input.setValue(current_config.get("update_interval", 300))

        self.language_select = QComboBox()
        self.language_select.addItems(["zh", "en"])
        self.language_select.setCurrentText(current_config.get("language", "zh"))

        self.temp_unit_select = QComboBox()
        self.temp_unit_select.addItems(["C", "F"])
        self.temp_unit_select.setCurrentText(current_config.get("temperature_unit", "C"))

        self.autostart_check = QCheckBox("开机自启")
        self.autostart_check.setChecked(current_config.get("autostart", False))

        self.notifications_check = QCheckBox("启用系统通知")
        self.notifications_check.setChecked(current_config.get("notifications", True))

        self.theme_select = QComboBox()
        self.theme_select.addItems(["light", "dark"])
        self.theme_select.setCurrentText(current_config.get("theme", "light"))

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

        try:
            with open("launcher_config.json", "r", encoding="utf-8") as f:
                full_config = json.load(f)
            full_config["apps"]["weather"]["config"] = CONFIG
            with open("launcher_config.json", "w", encoding="utf-8") as f:
                json.dump(full_config, f, indent=4, ensure_ascii=False)
            logging.info(f"配置已保存: {CONFIG}")
        except Exception as e:
            logging.error(f"保存配置失败: {e}")

        self.accept()

# ----------------------- 主窗口 -----------------------
class WeatherApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.warning_count = 0
        self.previous_warning_ids = set()
        self.current_warnings = []
        self.init_ui()
        self.init_worker()

    def eventFilter(self, obj, event):
        if obj == self.warning_widget and event.type() == event.Type.MouseButtonPress:
            if event.button() == Qt.MouseButton.LeftButton:
                self.on_warning_clicked(event)
                return True
        return super().eventFilter(obj, event)

    def init_ui(self):
        self.setWindowTitle("天气监测")
        self.setFixedHeight(50)
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
        self.warning_widget.installEventFilter(self)
        main_layout.addWidget(self.warning_widget)

        self.update_widget = WeatherWidget(value="--", unit="更新", tooltip="更新时间")
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



    def update_fxLink(self, fxLink):
        self.fxLink = fxLink

    def init_worker(self):
        self.worker = WeatherWorker(location=CONFIG['location'], update_interval=CONFIG['update_interval'])
        self.worker.fxLink.connect(self.update_fxLink)
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
            self.update_widget.update_value(current_time, "更新")
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
            severityColor = highest.get("severityColor", "--")
            warning_id = highest.get("id", None)

            if warning_id and warning_id not in self.previous_warning_ids:
                self.previous_warning_ids.add(warning_id)
                if CONFIG.get("notifications", True):
                    self.show_notification(type_name, severityColor, level)

            self.warning_widget.update_value(type_name, level)
            warning_color = {
                "Red": "#ff3b3b",
                "Yellow": "#f0dc30",
                "Orange": "#d35400"
            }.get(severityColor, "#cccccc")
            self.warning_widget.setStyleSheet(f"background: {warning_color}; color: white;")
        else:
            self.warning_widget.update_value("--", "--")
            self.warning_widget.setStyleSheet("")

    def show_notification(self, type_name, severityColor, level):
        # 不再使用系统托盘通知，改为在窗口内显示通知
        icons = {
            "Red": "🚨",
            "Orange": "⚠️",
            "Yellow": "🔔",
        }
        status = {
            "Red": "红色预警",
            "Orange": "橙色预警",
            "Yellow": "黄色预警",
        }
        icon = icons.get(severityColor, "🔔")
        title = status.get(severityColor, "天气预警")

        # 更新预警窗口显示
        if hasattr(self, 'warning_widget'):
            self.warning_widget.update_value(icon, title)
            warning_color = {
                "Red": "#ff3b3b",
                "Yellow": "#f0dc30",
                "Orange": "#d35400"
            }.get(severityColor, "#cccccc")
            self.warning_widget.setStyleSheet(f"background: {warning_color}; color: white;")

        logging.info(f"天气预警: {title} - {type_name} {level}")



    def show_error(self, error_msg):
        logging.error(f"程序错误: {error_msg}")

    def quit_application(self):
        logging.info("应用退出")
        if hasattr(self, 'worker'):
            self.worker.stop()
            self.worker.quit()
            self.worker.wait()
        QApplication.quit()


        
    def open_settings(self):
        dialog = SettingsDialog(self)
        if dialog.exec():
            if hasattr(self, 'worker'):
                self.worker.stop()
                self.worker.wait(2000)
            self.init_ui()
            self.init_worker()
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
            self.drag_start_position = event.globalPosition().toPoint()
            self.window_start_position = self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if event.buttons() == Qt.MouseButton.LeftButton and hasattr(self, 'drag_start_position'):
            new_pos = event.globalPosition().toPoint() - self.drag_start_position + self.window_start_position
            self.move(new_pos)
            event.accept()

# ----------------------- 主函数 -----------------------
def main():
    logging.info("weather 程序启动")
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    font = QFont("Microsoft YaHei", 11)
    app.setFont(font)
    sys.exit(app.exec())