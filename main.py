# ----------------------- 导入模块 -----------------------
import sys
import os
import json
import logging

from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QLabel, QFrame, QScrollArea, QGridLayout,
                             QSystemTrayIcon, QMenu, QStyle)
from PyQt6.QtCore import Qt, pyqtSignal, QTimer, QPropertyAnimation, QRect, QEasingCurve
from PyQt6.QtGui import QFont, QGuiApplication, QAction, QCursor


# ----------------------- 嵌套文件 -----------------------
def get_path(relative_path):
    try:
        base_path = getattr(sys, '_MEIPASS', None) or os.path.abspath(".")
    except AttributeError:
        base_path = os.path.abspath(".")
 
    return os.path.normpath(os.path.join(base_path, relative_path))


# ----------------------- 日志输出配置 -----------------------
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
CONFIG_FILE = "config.json"
DEFAULT_CONFIG_FILE = get_path("default/config.json")

def load_default_config():
    try:
        with open(DEFAULT_CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logging.error(f"[ClassBroom] 读取默认配置文件失败: {e}")
        return {}

def save_launcher_config(config=None):
    if config is None:
        config = LAUNCHER_CONFIG
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4, ensure_ascii=False)
        logging.info("[ClassBroom] 启动器配置已保存")
        return True
    except Exception as e:
        logging.error(f"[ClassBroom] 保存启动器配置失败: {e}")
        return False


LAUNCHER_CONFIG = {}
try:
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            LAUNCHER_CONFIG = json.load(f)
        logging.info("[ClassBroom] 成功读取配置文件")
    else:
        raise FileNotFoundError("配置文件不存在")
except Exception as e:
    logging.info(f"[ClassBroom] 读取启动器配置文件失败，使用默认配置: {e}")
    default_launcher_config = load_default_config()
    if default_launcher_config:
        LAUNCHER_CONFIG = default_launcher_config.copy()
        save_launcher_config(LAUNCHER_CONFIG)


# ----------------------- 应用启动 -----------------------
class AppLauncher(QFrame):
    appClicked = pyqtSignal(str)

    def __init__(self, app_id, app_config, parent=None):
        super().__init__(parent)
        self.app_id = app_id
        self.app_config = app_config
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

        icon_text = self.app_config.get("icon", "📱")
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

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.appClicked.emit(self.app_id)
        event.accept()


# ----------------------- 屏幕边缘托盘窗体 -----------------------
class EdgeTrayWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.expanded = False
        self.animation = QPropertyAnimation(self, b"geometry")
        self.animation.setDuration(250)

        self.Weather_app = None
        self.countdown_app = None
        
        self.init_ui()
        self.init_tray()
        self.setup_animation()

        self.hover_timer = QTimer(self)
        self.hover_timer.setSingleShot(True)
        self.hover_timer.timeout.connect(self.check_hover)
        
        # 添加全屏检测定时器
        self.fullscreen_check_timer = QTimer(self)
        self.fullscreen_check_timer.timeout.connect(self.check_fullscreen_apps)
        self.fullscreen_check_timer.start(1000)  # 每1秒检查一次

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
        # 如果有全屏应用，不响应鼠标悬停
        if not self.has_fullscreen_app():
            self.hover_timer.start(10)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.hover_timer.start(10)
        super().leaveEvent(event)

    def check_hover(self):
        # 如果有全屏应用，不展开窗口
        if self.has_fullscreen_app():
            if self.expanded:
                self.collapse_window()
            return
            
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

    def check_fullscreen_apps(self):
        """检查是否有全屏应用运行"""
        if self.has_fullscreen_app():
            # 如果有全屏应用，隐藏窗口
            if self.expanded:
                self.collapse_window()
            self.hide()
        else:
            # 如果没有全屏应用，显示窗口
            if not self.isVisible():
                self.show()

    def has_fullscreen_app(self):
        """检测是否有全屏应用运行"""
        try:
            import win32gui
            import win32con
            
            # 获取前台窗口
            hwnd = win32gui.GetForegroundWindow()
            if hwnd:
                # 检查窗口是否全屏
                placement = win32gui.GetWindowPlacement(hwnd)
                if placement[1] == win32con.SW_SHOWMAXIMIZED:
                    # 检查窗口是否覆盖整个屏幕
                    screen_rect = QGuiApplication.primaryScreen().availableGeometry()
                    window_rect = win32gui.GetWindowRect(hwnd)
                    
                    # 转换为QRect进行比较
                    window_qrect = QRect(window_rect[0], window_rect[1], 
                                       window_rect[2] - window_rect[0], 
                                       window_rect[3] - window_rect[1])
                    
                    # 如果窗口大小接近屏幕大小，认为是全屏应用
                    if (abs(window_qrect.width() - screen_rect.width()) < 50 and 
                        abs(window_qrect.height() - screen_rect.height()) < 50):
                        return True
                        
        except Exception as e:
            logging.debug(f"[ClassBroom] 全屏检测失败: {e}")
            
        return False

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
            
            row = index // columns
            col = index % columns
            self.apps_layout.addWidget(app_launcher, row, col, Qt.AlignmentFlag.AlignCenter)


    def on_app_clicked(self, app_id):
        if app_id == "Weather":
            self.launch_Weather_app()
        elif app_id == "countdown":
            self.launch_countdown_app()
        elif app_id == "TextDisplay":
            self.launch_TextDisplay_app()
        elif app_id == "WindowRecorder":
            self.launch_WindowRecorder_app()
        else:
            logging.info(f"[ClassBroom] 启动应用 {app_id}")

    def launch_Weather_app(self):
        try:
            from apps.Weather.main import WeatherApp

            self.Weather_app = WeatherApp()

            screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
            center_x = screen_geometry.center().x() - self.Weather_app.width() // 2
            center_y = screen_geometry.center().y() - self.Weather_app.height() // 2
            self.Weather_app.move(center_x, center_y)
            self.Weather_app.show()

            logging.info("[ClassBroom] Weather 已启动")

        except Exception as e:
            logging.error(f"[ClassBroom] Weather 启动失败: {e}")

    def launch_countdown_app(self):
        try:
            from apps.countdown.main import CountdownManager
            
            self.countdown_manager = CountdownManager()
            self.countdown_manager.show()
            
            logging.info("[ClassBroom] countdown 已启动")
            
        except Exception as e:
            logging.error(f"[ClassBroom] countdown 启动失败: {e}")

    def show_window(self):
        # 只有在没有全屏应用时才显示
        if not self.has_fullscreen_app():
            self.show()
            self.expand_window()

    def launch_TextDisplay_app(self):
        try:
            # 直接创建PyQt6版本的文本显示窗口

            from apps.TextDisplay.main import main as textdisplay_qt_main
            
            self.TextDisplay_manager = textdisplay_qt_main()
            logging.info("[ClassBroom] TextDisplay 已启动")
            
        except Exception as e:
            logging.error(f"[ClassBroom] TextDisplay 启动失败: {e}")
            
    def launch_WindowRecorder_app(self):
        try:
<<<<<<< HEAD
            from apps.WindowRecorder.main import create_window
            
            self.WindowRecorder = create_window()
=======
            from apps.WindowRecorder.main import main as WindowRecorder
            
            self.WindowRecorder = WindowRecorder()
>>>>>>> fb79ad24413b96a55fb169f828d2aa06e0f4cc88
            logging.info("[ClassBroom] WindowRecorder 已启动")
            
        except Exception as e:
            logging.error(f"[ClassBroom] WindowRecorder 启动失败: {e}")

    def quit_application(self):
        logging.info("[ClassBroom] 进程退出")
        if hasattr(self, 'Weather_app') and self.Weather_app:
            try:
                self.Weather_app.close()
            except RuntimeError as e:
                logging.warning(f"[ClassBroom] WeatherApp关闭错误: {e}")
        if hasattr(self, 'countdown_app') and self.countdown_app:
            self.countdown_app.close()
        if hasattr(self, 'TextDisplay_manager') and self.TextDisplay_manager:
            try:
                self.TextDisplay_manager.close()
            except:
                pass
<<<<<<< HEAD
        if hasattr(self, 'WindowRecorder') and self.WindowRecorder:
            try:
                self.WindowRecorder.close()
                logging.info("[ClassBroom] WindowRecorder 已关闭")
            except Exception as e:
                logging.warning(f"[ClassBroom] WindowRecorder关闭错误: {e}")
=======
>>>>>>> fb79ad24413b96a55fb169f828d2aa06e0f4cc88
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

    # 不使用sys.exit避免GIL问题
    app.exec()
    # 应用正常退出

if __name__ == '__main__':
    main()