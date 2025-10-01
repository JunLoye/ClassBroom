# ----------------------- 导入模块 -----------------------
import sys
import os
import json
import logging
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QLabel, QFrame, QScrollArea,
                             QGridLayout)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont, QPixmap, QGuiApplication


# ----------------------- 日志配置 -----------------------
log_file = "ClassBroom.log"
logger = logging.getLogger()
logger.setLevel(logging.INFO)

for handler in logger.handlers[:]:
    logger.removeHandler(handler)

file_handler = logging.FileHandler(log_file, mode='a', encoding='utf-8')
file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)


# ----------------------- 配置文件 -----------------------
LAUNCHER_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "launcher_config.json")

default_launcher_config = {
    "apps": {
        "weather": {
            "name": "天气监测",
            "icon": "weather_icon.png",
            "enabled": True,
            "position": 0,
            "config": {
                "location": "101010100",
                "update_interval": 300,
                "api_key": "your_apiKey",
                "language": "zh",
                "temperature_unit": "C",
                "autostart": False,
                "notifications": True,
                "theme": "light"
            }
        },
        "notes": {
            "name": "便签",
            "icon": "notes_icon.png", 
            "enabled": False,
            "position": 1
        },
        "calculator": {
            "name": "计算器",
            "icon": "calc_icon.png",
            "enabled": False,
            "position": 2
        }
    },
    "theme": "light",
    "columns": 3
}

try:
    with open(LAUNCHER_CONFIG_FILE, 'r', encoding='utf-8') as f:
        LAUNCHER_CONFIG = json.load(f)
except Exception as e:
    logging.info(f"读取启动器配置文件失败，使用默认配置: {e}")
    with open(LAUNCHER_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(default_launcher_config, f, indent=4, ensure_ascii=False)
    LAUNCHER_CONFIG = default_launcher_config.copy()


# ----------------------- 应用启动 -----------------------
class AppLauncher(QFrame):
    appClicked = pyqtSignal(str)
    
    def __init__(self, app_id, app_config, parent=None):
        super().__init__(parent)
        self.app_id = app_id
        self.app_config = app_config
        self.init_ui()
        
    def init_ui(self):
        self.setFixedSize(100, 120)
        self.setFrameStyle(QFrame.Shape.Box)
        self.setLineWidth(1)
        
        layout = QVBoxLayout()
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.setSpacing(8)
        layout.setContentsMargins(5, 10, 5, 10)
        
        icon_label = QLabel()
        icon_label.setFixedSize(64, 64)
        icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_label.setStyleSheet("""
            QLabel {
                background: #e0e0e0;
                border-radius: 10px;
            }
        """)
        
        icon_path = self.app_config.get("icon", "")
        if icon_path and os.path.exists(icon_path):
            pixmap = QPixmap(icon_path)
            pixmap = pixmap.scaled(48, 48, Qt.AspectRatioMode.KeepAspectRatio, 
                                 Qt.TransformationMode.SmoothTransformation)
            icon_label.setPixmap(pixmap)
        else:
            icon_label.setText("📱")
            icon_label.setStyleSheet("""
                QLabel {
                    background: #e0e0e0;
                    border-radius: 10px;
                    font-size: 24px;
                }
            """)
        
        name_label = QLabel(self.app_config.get("name", "应用"))
        name_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        name_label.setStyleSheet("font-size: 12px; font-weight: bold;")
        
        layout.addWidget(icon_label)
        layout.addWidget(name_label)
        self.setLayout(layout)
        
        self.setStyleSheet("""
            AppLauncher {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 8px;
            }
            AppLauncher:hover {
                background: #e9ecef;
                border: 1px solid #adb5bd;
            }
        """)
    
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.appClicked.emit(self.app_id)
            event.accept()

# ----------------------- 高层启动器窗口 -----------------------
class LauncherWindow(QMainWindow):
    logging.info("启动器窗口初始化完成")
    def __init__(self):
        super().__init__()
        self.weather_app = None
        self.init_ui()
        
    def init_ui(self):
        self.setWindowTitle("ClassBroom")
        self.setFixedSize(600, 400)
        
        theme = LAUNCHER_CONFIG.get("theme", "light")
        bg_color = "#ffffff" if theme == "light" else "#2d3748"
        text_color = "#2d3748" if theme == "light" else "#e2e8f0"
        
        self.setStyleSheet(f"""
            QMainWindow {{
                background: {bg_color};
            }}
            QLabel {{
                color: {text_color};
            }}
        """)
        
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(20)
        
        title_label = QLabel("ClassBroom")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("font-size: 24px; font-weight: bold; margin: 10px;")
        main_layout.addWidget(title_label)
        
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setFrameShape(QFrame.Shape.NoFrame)
        scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        
        apps_container = QWidget()
        self.apps_layout = QGridLayout()
        self.apps_layout.setSpacing(15)
        self.apps_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        
        apps_container.setLayout(self.apps_layout)
        scroll_area.setWidget(apps_container)
        
        main_layout.addWidget(scroll_area)
        central_widget.setLayout(main_layout)
        
        self.load_apps()
    
    def load_apps(self):
        for i in reversed(range(self.apps_layout.count())):
            widget = self.apps_layout.itemAt(i).widget()
            if widget:
                widget.deleteLater()
        
        apps_config = LAUNCHER_CONFIG.get("apps", {})
        enabled_apps = []
        
        for app_id, config in apps_config.items():
            if config.get("enabled", False):
                enabled_apps.append((app_id, config))
        
        enabled_apps.sort(key=lambda x: x[1].get("position", 0))
        
        columns = LAUNCHER_CONFIG.get("columns", 3)
        for i, (app_id, config) in enumerate(enabled_apps):
            app_launcher = AppLauncher(app_id, config)
            app_launcher.appClicked.connect(self.on_app_clicked)
            
            row = i // columns
            col = i % columns
            self.apps_layout.addWidget(app_launcher, row, col)
    
    def on_app_clicked(self, app_id):
        if app_id == "weather":
            self.launch_weather_app()
        else:
            logging.info(f"启动应用: {app_id}")
    
    def launch_weather_app(self):
        try:
            from weather.main import WeatherApp
            
            self.weather_app = WeatherApp()
            
            screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
            center_x = screen_geometry.center().x() - self.weather_app.width() // 2
            center_y = screen_geometry.center().y() - self.weather_app.height() // 2
            self.weather_app.move(center_x, center_y)
            self.weather_app.show()
            
            logging.info("weather 已启动")
            
        except Exception as e:
            logging.error(f"启动 weather 失败: {e}")


# ----------------------- 主函数 -----------------------
def main():
    logging.info("ClassBroom 进程启动")
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    
    font = QFont("Microsoft YaHei", 10)
    app.setFont(font)
    
    launcher = LauncherWindow()
    
    screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
    center_x = screen_geometry.center().x() - launcher.width() // 2
    center_y = screen_geometry.center().y() - launcher.height() // 2
    launcher.move(center_x, center_y)
    
    launcher.show()
    
    sys.exit(app.exec())

if __name__ == '__main__':
    main()