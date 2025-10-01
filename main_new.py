# ----------------------- 导入模块 -----------------------
import sys
import os
import json
import logging
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QLabel, QFrame, QScrollArea, QGridLayout,
                             QSystemTrayIcon, QMenu, QPushButton, QStyle)
from PyQt6.QtCore import Qt, pyqtSignal, QTimer, QPropertyAnimation, QRect, QPoint, QEasingCurve
from PyQt6.QtGui import QFont, QPixmap, QGuiApplication, QAction, QIcon, QCursor


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


# ----------------------- 屏幕边缘托盘窗体 -----------------------
class EdgeTrayWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.expanded = False
        self.animation = QPropertyAnimation(self, b"geometry")
        self.animation.setDuration(250)  # 动画持续时间250ms

        self.weather_app = None
        self.init_ui()
        self.init_tray()
        self.setup_animation()

        # 创建悬停检测定时器
        self.hover_timer = QTimer(self)
        self.hover_timer.setSingleShot(True)
        self.hover_timer.timeout.connect(self.check_hover)

        # 设置窗口悬停检测
        self.setMouseTracking(True)
        self.centralWidget().setMouseTracking(True)
        for child in self.centralWidget().findChildren(QWidget):
            child.setMouseTracking(True)

    def init_ui(self):
        self.setWindowTitle("ClassBroom")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool | Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        # 设置初始位置和大小
        screen = QGuiApplication.primaryScreen().availableGeometry()
        self.collapsed_width = 10
        self.expanded_width = 300
        self.height = 400

        # 设置初始位置为屏幕右侧，收起状态
        self.setGeometry(screen.right() - self.collapsed_width, 
                         (screen.height() - self.height) // 2,
                         self.collapsed_width, self.height)

        # 创建中央部件
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        # 设置布局
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(5, 10, 5, 10)

        # 添加展开/收起按钮
        self.toggle_btn = QPushButton("◀")
        self.toggle_btn.setFixedSize(20, 30)
        self.toggle_btn.clicked.connect(self.toggle_window)
        main_layout.addWidget(self.toggle_btn)

        # 添加应用容器
        self.apps_container = QWidget()
        self.apps_layout = QVBoxLayout(self.apps_container)
        self.apps_layout.setSpacing(10)
        self.apps_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        main_layout.addWidget(self.apps_container)

        # 设置样式
        theme = LAUNCHER_CONFIG.get("theme", "light")
        bg_color = "#ffffff" if theme == "light" else "#2d3748"
        text_color = "#2d3748" if theme == "light" else "#e2e8f0"

        self.setStyleSheet(f"""
            QMainWindow {{
                background: {bg_color};
                border-radius: 10px 0px 0px 10px;
            }}
            QPushButton {{
                background: #3498db;
                color: white;
                border: none;
                border-radius: 5px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: #2980b9;
            }}
            QLabel {{
                color: {text_color};
            }}
        """)

        # 加载应用
        self.load_apps()

        # 初始状态为收起
        self.apps_container.hide()

    def init_tray(self):
        # 创建系统托盘图标
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.tray_icon = QSystemTrayIcon(self)

            # 设置托盘图标
            icon = self.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon)
            self.tray_icon.setIcon(icon)

            # 创建托盘菜单
            tray_menu = QMenu()

            show_action = QAction("显示", self)
            show_action.triggered.connect(self.show_window)
            tray_menu.addAction(show_action)

            quit_action = QAction("退出", self)
            quit_action.triggered.connect(self.quit_application)
            tray_menu.addAction(quit_action)

            self.tray_icon.setContextMenu(tray_menu)
            self.tray_icon.setToolTip("ClassBroom")
            self.tray_icon.show()
            logging.info("系统托盘初始化完成")

    def setup_animation(self):
        # 设置动画
        self.animation.setEasingCurve(QEasingCurve.Type.OutQuad)

    def toggle_window(self):
        if self.expanded:
            self.collapse_window()
        else:
            self.expand_window()

    def expand_window(self):
        if not self.expanded:
            screen = QGuiApplication.primaryScreen().availableGeometry()

            # 动画展开
            start_geometry = QRect(screen.right() - self.collapsed_width, 
                                  (screen.height() - self.height) // 2,
                                  self.collapsed_width, self.height)

            end_geometry = QRect(screen.right() - self.expanded_width, 
                                (screen.height() - self.height) // 2,
                                self.expanded_width, self.height)

            self.animation.setStartValue(start_geometry)
            self.animation.setEndValue(end_geometry)
            self.animation.start()

            # 更新按钮方向
            self.toggle_btn.setText("▶")

            # 显示应用容器
            self.apps_container.show()

            self.expanded = True
            logging.info("窗口已展开")

    def collapse_window(self):
        if self.expanded:
            screen = QGuiApplication.primaryScreen().availableGeometry()

            # 动画收起
            start_geometry = QRect(screen.right() - self.expanded_width, 
                                  (screen.height() - self.height) // 2,
                                  self.expanded_width, self.height)

            end_geometry = QRect(screen.right() - self.collapsed_width, 
                                (screen.height() - self.height) // 2,
                                self.collapsed_width, self.height)

            self.animation.setStartValue(start_geometry)
            self.animation.setEndValue(end_geometry)
            self.animation.start()

            # 更新按钮方向
            self.toggle_btn.setText("◀")

            # 隐藏应用容器
            self.apps_container.hide()

            self.expanded = False
            logging.info("窗口已收起")

    def enterEvent(self, event):
        # 鼠标进入窗口时，延迟检查是否需要展开
        self.hover_timer.start(200)  # 200ms延迟
        super().enterEvent(event)

    def leaveEvent(self, event):
        # 鼠标离开窗口时，延迟检查是否需要收起
        self.hover_timer.start(500)  # 500ms延迟
        super().leaveEvent(event)

    def check_hover(self):
        # 获取鼠标位置
        cursor_pos = QCursor.pos()

        # 检查鼠标是否在窗口边缘（收起状态下）
        if not self.expanded:
            screen = QGuiApplication.primaryScreen().availableGeometry()
            edge_rect = QRect(screen.right() - 20, 0, 20, screen.height())

            if edge_rect.contains(cursor_pos):
                self.expand_window()

        # 检查鼠标是否离开窗口区域（展开状态下）
        elif self.expanded:
            window_rect = self.geometry()
            expanded_rect = QRect(window_rect.x(), window_rect.y(), 
                                window_rect.width() + 20, window_rect.height())

            if not expanded_rect.contains(cursor_pos):
                self.collapse_window()

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

        for app_id, config in enabled_apps:
            app_launcher = AppLauncher(app_id, config)
            app_launcher.appClicked.connect(self.on_app_clicked)
            self.apps_layout.addWidget(app_launcher)

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

    def show_window(self):
        self.show()
        self.expand_window()

    def quit_application(self):
        logging.info("应用退出")
        if self.weather_app:
            self.weather_app.close()
        QApplication.quit()


# ----------------------- 主函数 -----------------------
def main():
    logging.info("ClassBroom 进程启动")
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    font = QFont("Microsoft YaHei", 10)
    app.setFont(font)

    launcher = EdgeTrayWindow()
    launcher.show()

    sys.exit(app.exec())

if __name__ == '__main__':
    main()
