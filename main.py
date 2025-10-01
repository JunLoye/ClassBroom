# ----------------------- 导入模块 -----------------------
import sys
import os
import json
import logging
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QLabel, QFrame, QScrollArea, QGridLayout,
                             QSystemTrayIcon, QMenu, QStyle)
from PyQt6.QtCore import Qt, pyqtSignal, QTimer, QPropertyAnimation, QRect, QEasingCurve
from PyQt6.QtGui import QFont, QPixmap, QGuiApplication, QAction, QCursor


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
# ----------------------- 配置文件 -----------------------
LAUNCHER_CONFIG_FILE = "config.json"

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
            "enabled": True,
            "position": 1
        },
        "calculator": {
            "name": "计算器",
            "icon": "calc_icon.png",
            "enabled": False,
            "position": 2
        },
        "countdown": {
            "name": "倒计日",
            "icon": "countdown_icon.png",
            "enabled": True,
            "position": 3,
            "config": {
                "target_date": "2024-12-31",
                "title": "目标日"
            }
        }
    },
    "theme": "light",
    "columns": 3
}

def save_launcher_config():
    try:
        with open(LAUNCHER_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(LAUNCHER_CONFIG, f, indent=4, ensure_ascii=False)
        logging.info("[ClassBroom] 启动器配置已保存")
    except Exception as e:
        logging.error(f"[ClassBroom] 保存启动器配置失败: {e}")

try:
    with open(LAUNCHER_CONFIG_FILE, 'r', encoding='utf-8') as f:
        LAUNCHER_CONFIG = json.load(f)
except Exception as e:
    logging.info(f"[ClassBroom] 读取启动器配置文件失败，使用默认配置: {e}")
    with open(LAUNCHER_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(default_launcher_config, f, indent=4, ensure_ascii=False)
    LAUNCHER_CONFIG = default_launcher_config.copy()


# ----------------------- 应用启动 -----------------------
class AppLauncher(QFrame):
    appClicked = pyqtSignal(str)
    dragStarted = pyqtSignal(QWidget)

    def __init__(self, app_id, app_config, parent=None):
        super().__init__(parent)
        self.app_id = app_id
        self.app_config = app_config
        self.drag_start_position = None
        self.init_ui()

    def init_ui(self):
        self.setFixedSize(80, 90)
        self.setFrameStyle(QFrame.Shape.NoFrame)

        layout = QVBoxLayout()
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.setSpacing(5)
        layout.setContentsMargins(5, 8, 5, 8)

        icon_label = QLabel()
        icon_label.setFixedSize(48, 48)
        icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        icon_path = self.app_config.get("icon", "")
        if icon_path and os.path.exists(icon_path):
            pixmap = QPixmap(icon_path)
            pixmap = pixmap.scaled(40, 40, Qt.AspectRatioMode.KeepAspectRatio,
                                 Qt.TransformationMode.SmoothTransformation)
            icon_label.setPixmap(pixmap)
        else:
            icon_map = {
                "weather": "🌤️",
                "notes": "📝",
                "calculator": "🧮",
                "countdown": "⏰"
            }
            icon_text = icon_map.get(self.app_id, "📱")
            icon_label.setText(icon_text)
            icon_label.setStyleSheet("""
                QLabel {
                    font-size: 24px;
                    background: transparent;
                }
            """)

        name_label = QLabel(self.app_config.get("name", "应用"))
        name_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        name_label.setStyleSheet("""
            font-size: 11px; 
            font-weight: bold; 
            color: #333;
            background: transparent;
            padding: 2px;
        """)
        name_label.setWordWrap(True)
        name_label.setMaximumHeight(30)

        layout.addWidget(icon_label)
        layout.addWidget(name_label)
        self.setLayout(layout)

        self.update_style()

    def update_style(self):
        theme = LAUNCHER_CONFIG.get("theme", "light")
        if theme == "dark":
            self.setStyleSheet("""
                AppLauncher {
                    background: rgba(45, 55, 72, 200);
                    border-radius: 8px;
                    margin: 3px;
                }
                AppLauncher:hover {
                    background: rgba(55, 65, 82, 240);
                    border: 1px solid rgba(74, 144, 226, 0.5);
                }
            """)
        else:
            self.setStyleSheet("""
                AppLauncher {
                    background: rgba(255, 255, 255, 200);
                    border-radius: 8px;
                    margin: 3px;
                }
                AppLauncher:hover {
                    background: rgba(255, 255, 255, 240);
                    border: 1px solid rgba(52, 152, 219, 0.5);
                }
            """)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_start_position = event.pos()
            event.accept()

    def mouseMoveEvent(self, event):
        if not (event.buttons() & Qt.MouseButton.LeftButton):
            return
        
        if self.drag_start_position is None:
            return
            
        if (event.pos() - self.drag_start_position).manhattanLength() < QApplication.startDragDistance():
            return
        
        self.dragStarted.emit(self)
        self.drag_start_position = None

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            if self.drag_start_position is not None:
                self.appClicked.emit(self.app_id)
            self.drag_start_position = None
        event.accept()


# ----------------------- 屏幕边缘托盘窗体 -----------------------
class EdgeTrayWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.expanded = False
        self.animation = QPropertyAnimation(self, b"geometry")
        self.animation.setDuration(250)

        self.weather_app = None
        self.notes_app = None
        self.countdown_app = None
        self.dragging_widget = None
        self.drag_start_pos = None
        
        self.init_ui()
        self.init_tray()
        self.setup_animation()

        self.hover_timer = QTimer(self)
        self.hover_timer.setSingleShot(True)
        self.hover_timer.timeout.connect(self.check_hover)

        self.setMouseTracking(True)
        self.centralWidget().setMouseTracking(True)
        for child in self.centralWidget().findChildren(QWidget):
            child.setMouseTracking(True)

    def init_ui(self):
        self.setWindowTitle("ClassBroom")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool | Qt.WindowType.WindowStaysOnTopHint)

        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setStyleSheet("""
            QMainWindow {
                background: transparent;
            }
        """)

        screen = QGuiApplication.primaryScreen().availableGeometry()
        self.collapsed_width = 10
        self.expanded_width = 280
        self.height = 500

        self.setGeometry(screen.right() - self.collapsed_width, 
                         (screen.height() - self.height) // 2,
                         self.collapsed_width, self.height)

        central_widget = QWidget()
        central_widget.setStyleSheet("""
            QWidget {
                background: rgba(255, 255, 255, 220);
                border-radius: 12px;
            }
        """)
        self.setCentralWidget(central_widget)

        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(8, 12, 8, 12)
        main_layout.setSpacing(8)

        title_label = QLabel("ClassBroom")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            font-size: 16px; 
            font-weight: bold; 
            margin: 5px; 
            color: #333;
            background: transparent;
        """)
        main_layout.addWidget(title_label)

        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll_area.setStyleSheet("""
            QScrollArea {
                border: none;
                background: transparent;
            }
            QScrollBar:vertical {
                background: rgba(200, 200, 200, 100);
                width: 8px;
                margin: 0px;
                border-radius: 4px;
            }
            QScrollBar::handle:vertical {
                background: rgba(150, 150, 150, 150);
                border-radius: 4px;
                min-height: 20px;
            }
            QScrollBar::handle:vertical:hover {
                background: rgba(120, 120, 120, 200);
            }
        """)
        main_layout.addWidget(scroll_area)

        self.apps_container = QWidget()
        self.apps_layout = QGridLayout(self.apps_container)
        self.apps_layout.setSpacing(5)
        self.apps_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.apps_layout.setContentsMargins(5, 5, 5, 5)
        scroll_area.setWidget(self.apps_container)

        self.update_theme_style()
        
        self.load_apps()

        self.apps_container.hide()
        title_label.hide()

    def update_theme_style(self):
        theme = LAUNCHER_CONFIG.get("theme", "light")
        bg_color = "rgba(255, 255, 255, 220)" if theme == "light" else "rgba(45, 55, 72, 220)"
        text_color = "#333" if theme == "light" else "#e2e8f0"

        self.centralWidget().setStyleSheet(f"""
            QWidget {{
                background: {bg_color};
                border-radius: 12px;
                color: {text_color};
            }}
        """)

    def init_tray(self):
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.tray_icon = QSystemTrayIcon(self)

            icon = self.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon)
            self.tray_icon.setIcon(icon)

            tray_menu = QMenu()

            show_action = QAction("显示", self)
            show_action.triggered.connect(self.show_window)
            tray_menu.addAction(show_action)

            weather_action = QAction("天气", self)
            weather_action.triggered.connect(self.launch_weather_app)
            tray_menu.addAction(weather_action)

            notes_action = QAction("便签", self)
            notes_action.triggered.connect(self.launch_notes_app)
            tray_menu.addAction(notes_action)

            countdown_action = QAction("倒计时", self)
            countdown_action.triggered.connect(self.launch_countdown_app)
            tray_menu.addAction(countdown_action)

            quit_action = QAction("退出", self)
            quit_action.triggered.connect(self.quit_application)
            tray_menu.addAction(quit_action)

            self.tray_icon.setContextMenu(tray_menu)
            self.tray_icon.setToolTip("ClassBroom")
            self.tray_icon.show()
            logging.info("[ClassBroom] 系统托盘初始化完成")

    def setup_animation(self):
        self.animation.setEasingCurve(QEasingCurve.Type.OutQuad)

    def toggle_window(self):
        if self.expanded:
            self.collapse_window()
        else:
            self.expand_window()

    def expand_window(self):
        if not self.expanded:
            screen = QGuiApplication.primaryScreen().availableGeometry()

            start_geometry = QRect(screen.right() - self.collapsed_width, 
                                  (screen.height() - self.height) // 2,
                                  self.collapsed_width, self.height)

            end_geometry = QRect(screen.right() - self.expanded_width, 
                                (screen.height() - self.height) // 2,
                                self.expanded_width, self.height)

            self.animation.setStartValue(start_geometry)
            self.animation.setEndValue(end_geometry)
            self.animation.start()

            self.apps_container.show()
            self.centralWidget().findChild(QLabel).show()

            self.expanded = True
            logging.info("[ClassBroom] 窗口已展开")

    def collapse_window(self):
        if self.expanded:
            screen = QGuiApplication.primaryScreen().availableGeometry()

            start_geometry = QRect(screen.right() - self.expanded_width, 
                                  (screen.height() - self.height) // 2,
                                  self.expanded_width, self.height)

            end_geometry = QRect(screen.right() - self.collapsed_width, 
                                (screen.height() - self.height) // 2,
                                self.collapsed_width, self.height)

            self.animation.setStartValue(start_geometry)
            self.animation.setEndValue(end_geometry)
            self.animation.start()

            self.apps_container.hide()
            self.centralWidget().findChild(QLabel).hide()

            self.centralWidget().setStyleSheet("""
                QWidget {
                    background: rgba(255, 255, 255, 220);
                    border-top-left-radius: 12px;
                    border-bottom-left-radius: 12px;
                    border-top-right-radius: 0px;
                    border-bottom-right-radius: 0px;
                }
            """)

            self.expanded = False
            logging.info("[ClassBroom] 窗口已收起")

    def enterEvent(self, event):
        self.hover_timer.start(10)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.hover_timer.start(10)
        super().leaveEvent(event)

    def check_hover(self):
        cursor_pos = QCursor.pos()

        if not self.expanded:
            screen = QGuiApplication.primaryScreen().availableGeometry()
            edge_rect = QRect(screen.right() - 10, screen.top(), 20, screen.height())

            if edge_rect.contains(cursor_pos):
                self.expand_window()

        elif self.expanded:
            window_rect = self.geometry()
            expanded_rect = QRect(window_rect.x(), window_rect.y(), 
                                  window_rect.width() + 25, window_rect.height())

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

        columns = LAUNCHER_CONFIG.get("columns", 3)
        for index, (app_id, config) in enumerate(enabled_apps):
            app_launcher = AppLauncher(app_id, config)
            app_launcher.appClicked.connect(self.on_app_clicked)
            app_launcher.dragStarted.connect(self.start_app_drag)
            
            row = index // columns
            col = index % columns
            self.apps_layout.addWidget(app_launcher, row, col, Qt.AlignmentFlag.AlignCenter)

    def start_app_drag(self, widget):
        logging.info('[ClassBroom] 开始拖拽应用')
        self.dragging_widget = widget
        self.drag_start_pos = widget.pos()
        
        widget.setStyleSheet("""
            AppLauncher {
                background: rgba(52, 152, 219, 180);
                border-radius: 8px;
                margin: 3px;
                border: 2px dashed rgba(41, 128, 185, 0.8);
            }
        """)

    def mouseMoveEvent(self, event):
        if self.dragging_widget and (event.buttons() & Qt.MouseButton.LeftButton):
            pass
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if self.dragging_widget and event.button() == Qt.MouseButton.LeftButton:
            target_pos = self.apps_container.mapFromGlobal(event.globalPosition().toPoint())
            self.handle_app_drop(target_pos)
            
        super().mouseReleaseEvent(event)

    def handle_app_drop(self, drop_pos):
        if not self.dragging_widget:
            return
            
        target_index = self.find_drop_index(drop_pos)
        if target_index >= 0:
            self.reorder_apps(self.dragging_widget, target_index)
            
        self.dragging_widget.update_style()
        self.dragging_widget = None
        self.drag_start_pos = None

    def find_drop_index(self, drop_pos):
        columns = LAUNCHER_CONFIG.get("columns", 3)
        app_count = self.apps_layout.count()
        
        if app_count == 0:
            return 0
            
        item = self.apps_layout.itemAt(0)
        if not item:
            return 0
            
        cell_width = item.widget().width() + self.apps_layout.horizontalSpacing()
        cell_height = item.widget().height() + self.apps_layout.verticalSpacing()
        
        col = drop_pos.x() // cell_width if cell_width > 0 else 0
        row = drop_pos.y() // cell_height if cell_height > 0 else 0
        
        col = min(max(0, col), columns - 1)
        
        target_index = row * columns + col
        return min(target_index, app_count - 1)

    def reorder_apps(self, dragged_widget, target_index):
        apps = []
        for i in range(self.apps_layout.count()):
            item = self.apps_layout.itemAt(i)
            if item and item.widget():
                apps.append(item.widget())
        
        if dragged_widget not in apps:
            return
            
        apps.remove(dragged_widget)
        
        if target_index < len(apps):
            apps.insert(target_index, dragged_widget)
        else:
            apps.append(dragged_widget)
        
        for i in reversed(range(self.apps_layout.count())):
            self.apps_layout.itemAt(i).widget().setParent(None)
        
        columns = LAUNCHER_CONFIG.get("columns", 3)
        for index, app in enumerate(apps):
            row = index // columns
            col = index % columns
            self.apps_layout.addWidget(app, row, col, Qt.AlignmentFlag.AlignCenter)
            
        self.update_app_positions()

    def update_app_positions(self):
        apps_config = LAUNCHER_CONFIG.get("apps", {})
        
        app_ids = []
        for i in range(self.apps_layout.count()):
            item = self.apps_layout.itemAt(i)
            if item and item.widget():
                app_launcher = item.widget()
                app_ids.append(app_launcher.app_id)
        
        for position, app_id in enumerate(app_ids):
            if app_id in apps_config:
                apps_config[app_id]["position"] = position
                
        save_launcher_config()
        logging.info("[ClassBroom] 应用位置已更新")

    def on_app_clicked(self, app_id):
        if app_id == "weather":
            self.launch_weather_app()
        elif app_id == "notes":
            self.launch_notes_app()
        elif app_id == "countdown":
            self.launch_countdown_app()
        else:
            logging.info(f"[ClassBroom] 启动应用 {app_id}")

    def launch_weather_app(self):
        try:
            from apps.weather.main import WeatherApp

            self.weather_app = WeatherApp()

            screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
            center_x = screen_geometry.center().x() - self.weather_app.width() // 2
            center_y = screen_geometry.center().y() - self.weather_app.height() // 2
            self.weather_app.move(center_x, center_y)
            self.weather_app.show()

            logging.info("[ClassBroom] weather 已启动")

        except Exception as e:
            logging.error(f"[ClassBroom] weather 启动失败: {e}")

    def launch_notes_app(self):
        try:
            from apps.notes.main import NotesApp

            self.notes_app = NotesApp()

            screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
            self.notes_app.move(screen_geometry.right() - self.notes_app.width() - 50, 
                               screen_geometry.top() + 100)
            self.notes_app.show()

            logging.info("[ClassBroom] notes 已启动")

        except Exception as e:
            logging.error(f"[ClassBroom] notes 启动失败: {e}")

    def launch_countdown_app(self):
        try:
            from apps.countdown.main import CountdownManager
            
            self.countdown_manager = CountdownManager()
            self.countdown_manager.show()
            
            logging.info("[ClassBroom] countdown 已启动")
            
        except Exception as e:
            logging.error(f"[ClassBroom] countdown 启动失败: {e}")

    def show_window(self):
        self.show()
        self.expand_window()

    def quit_application(self):
        logging.info("[ClassBroom] 应用退出")
        if self.weather_app:
            self.weather_app.close()
        if self.notes_app:
            self.notes_app.close()
        if self.countdown_app:
            self.countdown_app.close()
        QApplication.quit()


# ----------------------- 主函数 -----------------------
def main():
    logging.info("[ClassBroom] 进程启动")
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    font = QFont("Microsoft YaHei", 10)
    app.setFont(font)

    launcher = EdgeTrayWindow()
    launcher.show()

    sys.exit(app.exec())

if __name__ == '__main__':
    main()