import sys
import os
import logging
import re
import urllib.request
import importlib

from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QLabel, QFrame, QScrollArea, QSystemTrayIcon, QMenu, QStyle, QHBoxLayout)
from PyQt6.QtCore import Qt, pyqtSignal, QTimer, QPropertyAnimation, QRect, QEasingCurve, QUrl
from PyQt6.QtGui import QFont, QGuiApplication, QAction, QCursor, QDesktopServices


CONFIG = {
    "version": "Beta-2.5.0",
    "apps": {
        "Weather": {
            "name": "天气检测",
            "icon": "🌤️",
            "enabled": True,
            "position": 0,
            "location": "",
            "api_key": ""
        },
        "Countdown": {
            "name": "倒记日",
            "icon": "📆",
            "enabled": False,
            "position": 1,
            "title": "",
            "target_date": ""
        },
        "TextDisplay": {
            "name": "大字显示",
            "icon": "📄",
            "enabled": True,
            "position": 2,
            "text": "Hello, ClassBroom!"
        },
        "WindowRecorder": {
            "name": "窗口记录",
            "icon": "🪟",
            "enabled": True,
            "position": 3,
            "interval": 60,
            "screenshots_dir": "screenshots",
            "db_file": "window_records.db",
            "thumb_size": [
                240,
                140
            ],
            "log_item_height": 20,
            "days_to_keep": 3
        },
        "Settings": {
            "name": "全局设置",
            "icon": "⚙️",
            "enabled": True,
            "position": 4
        }
    },
    "columns": 3
}


def get_path(relative_path):
    try:
        base_path = getattr(sys, '_MEIPASS', None) or os.path.abspath(".")
    except AttributeError:
        base_path = os.path.abspath(".")
 
    return os.path.normpath(os.path.join(base_path, relative_path))


log_file = "ClassBroom.log"
logger = logging.getLogger()
logger.setLevel(logging.INFO)

for handler in logger.handlers[:]:
    logger.removeHandler(handler)

file_handler = logging.FileHandler(log_file, mode='a', encoding='utf-8')
file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)


class AppLauncher(QFrame):
    appClicked = pyqtSignal(str)

    def __init__(self, app_id, app_config_PATH, parent=None):
        super().__init__(parent)
        self.app_id = app_id
        self.app_config_PATH = app_config_PATH
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

        icon_text = self.app_config_PATH.get("icon", "📱")
        icon_label.setText(icon_text)
        icon_label.setStyleSheet("""
            QLabel {
                font-size: 24px;
                background: transparent;
            }
        """)

        name_label = QLabel(self.app_config_PATH.get("name", "应用"))
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


class EdgeTrayWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.expanded = False
        self.animation = QPropertyAnimation(self, b"geometry")
        self.animation.setDuration(250)
        
        self.app_map = {
            "Weather": {
                "module": "apps.Weather.main", "function": "start_app", "instance_attr": "Weather_app", "takes_parent": False,
                "name": "天气", "icon": "☀️"
            },
            "Countdown": {
                "module": "apps.Countdown.main", "class": "CountdownManager", "instance_attr": "countdown_manager", "takes_parent": True,
                "name": "倒计时", "icon": "⏳"
            },
            "TextDisplay": {
                "module": "apps.TextDisplay.main", "function": "start_app", "instance_attr": "TextDisplay_manager", "takes_parent": True,
                "name": "文本", "icon": "📄"
            },
            "WindowRecorder": {
                "module": "apps.WindowRecorder.main", "function": "start_app", "instance_attr": "WindowRecorder", "takes_parent": True,
                "name": "窗口记录", "icon": "📹"
            },
            "Settings": {
                "module": "apps.Settings.main", "function": "start_app", "instance_attr": "Settings_window", "takes_parent": True,
                "name": "设置", "icon": "⚙️"
            },
        }
        
        self.init_ui()
        self.init_tray()
        self.setup_animation()

        self.hover_timer = QTimer(self)
        self.hover_timer.setSingleShot(True)
        self.hover_timer.timeout.connect(self.check_hover)
        
        # 移除全屏检测定时器
        # self.fullscreen_check_timer = QTimer(self)
        # self.fullscreen_check_timer.timeout.connect(self.check_fullscreen_apps)
        # self.fullscreen_check_timer.start(2000)

        self.setMouseTracking(True)
        self.centralWidget().setMouseTracking(True)
        for child in self.centralWidget().findChildren(QWidget):
            child.setMouseTracking(True)

        QTimer.singleShot(2000, self.check_for_updates)

    def init_ui(self):
        self.setWindowTitle("ClassBroom")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool | Qt.WindowType.WindowStaysOnTopHint)

        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setStyleSheet("""
            QMainWindow {
                background: transparent;
            }
        """)

        screen = QGuiApplication.primaryScreen()
        if not screen:
            logging.error("[ClassBroom] 无法获取屏幕信息")
            return
        screen_geometry = screen.availableGeometry()
        self.collapsed_width = 10
        self.expanded_width = 280
        self.window_height = 500

        self.setGeometry(screen_geometry.right() - self.collapsed_width, 
                         (screen_geometry.height() - self.window_height) // 2,
                         self.collapsed_width, self.window_height)

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
        self.apps_layout = QVBoxLayout(self.apps_container)
        self.apps_layout.setSpacing(5)
        self.apps_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.apps_layout.setContentsMargins(5, 5, 5, 5)
        scroll_area.setWidget(self.apps_container)

        self.copyright_label = QLabel()
        self.copyright_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.copyright_label.setOpenExternalLinks(True)
        self.copyright_label.setStyleSheet("""
            font-size: 9px;
            background: transparent;
            margin-top: 5px;
        """)
        main_layout.addWidget(self.copyright_label)

        self.update_theme_style()
        
        self.load_apps()

        self.apps_container.hide()
        title_label.hide()
        self.copyright_label.hide()

    def update_theme_style(self):
        theme = CONFIG.get("theme", "light")
        bg_color = "rgba(255, 255, 255, 220)" if theme == "light" else "rgba(45, 55, 72, 220)"
        text_color = "#333" if theme == "light" else "#e2e8f0"
        link_color = "#3498db" if theme == "light" else "#5dade2"

        central_widget = self.centralWidget()
        if central_widget:
            central_widget.setStyleSheet(f"""
                QWidget {{
                    background: {bg_color};
                    border-radius: 12px;
                    color: {text_color};
                }}
            """)

        copyright_text = (f"<p style='color:{text_color};'>© 2025 Jun_Loye<br/>"
                          f"<a style='color:{link_color}; text-decoration:none;' href='https://github.com/JunLoye/ClassBroom'>"
                          f"https://github.com/JunLoye/ClassBroom</a></p>")
        self.copyright_label.setText(copyright_text)

    def init_tray(self):
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.tray_icon = QSystemTrayIcon(self)

            style = self.style()
            if style:
                icon = style.standardIcon(QStyle.StandardPixmap.SP_ComputerIcon)
                self.tray_icon.setIcon(icon)

            tray_menu = QMenu()

            show_action = QAction("显示", self)
            show_action.triggered.connect(self.show_window)
            tray_menu.addAction(show_action)

            update_action = QAction("检查更新", self)
            update_action.triggered.connect(self.check_for_updates)
            tray_menu.addAction(update_action)
                
            quit_action = QAction("退出", self)
            quit_action.triggered.connect(self.quit_application)
            tray_menu.addAction(quit_action)

            self.tray_icon.setContextMenu(tray_menu)
            self.tray_icon.setToolTip("ClassBroom")
            self.tray_icon.activated.connect(self.on_tray_icon_activated)
            self.tray_icon.messageClicked.connect(self.open_releases_page)
            self.tray_icon.show()
            logging.info("[ClassBroom] 系统托盘初始化完成")

    def check_for_updates(self):
        try:
            url = "https://github.com/JunLoye/ClassBroom/releases/latest"
            
            with urllib.request.urlopen(url) as response:
                final_url = response.geturl()
            
            if not final_url or "tag" not in final_url:
                self.show_update_notification("检查更新失败", "无法获取最新版本信息。")
                logging.warning("[ClassBroom] 无法获取最新版本URL。")
                return

            latest_version_tag = final_url.split('/')[-1]
            local_version = CONFIG.get("version", "0.0.0")

            latest_version_numbers = tuple(map(int, (re.findall(r'\d+', latest_version_tag) or ['0'])))
            local_version_numbers = tuple(map(int, (re.findall(r'\d+', local_version) or ['0'])))

            if latest_version_numbers > local_version_numbers:
                title = "发现新版本！"
                message = f"新版本 {latest_version_tag} 可用\n当前版本 {local_version}"
            else:
                title = "已是最新版本"
                message = f"您当前已是最新版本 {local_version}"
            
            self.show_update_notification(title, message)
            logging.info(f"[ClassBroom] 检查更新完成: 本地版本 {local_version}, 最新版本 {latest_version_tag}")

        except Exception as e:
            logging.error(f"[ClassBroom] 检查更新失败: {e}")
            self.show_update_notification("检查更新失败", "请检查您的网络连接。")

    def show_update_notification(self, title, message):
        self.tray_icon.showMessage(title, message, QSystemTrayIcon.MessageIcon.Information, 5000)

    def open_releases_page(self):
        url = "https://github.com/LoyeJun/ClassBroom/releases/latest"
        QDesktopServices.openUrl(QUrl(url))
        logging.info(f"[ClassBroom] 打开更新页面: {url}")

    def setup_animation(self):
        self.animation.setEasingCurve(QEasingCurve.Type.OutQuad)

    def toggle_window(self):
        if self.expanded:
            self.collapse_window()
        else:
            self.expand_window()

    def expand_window(self):
        if not self.expanded:
            self.update_theme_style()
            screen = QGuiApplication.primaryScreen()
            if not screen: return
            screen_geometry = screen.availableGeometry()

            start_geometry = QRect(screen_geometry.right() - self.collapsed_width, 
                                  (screen_geometry.height() - self.window_height) // 2,
                                  self.collapsed_width, self.window_height)

            end_geometry = QRect(screen_geometry.right() - self.expanded_width, 
                                (screen_geometry.height() - self.window_height) // 2,
                                self.expanded_width, self.window_height)

            self.animation.setStartValue(start_geometry)
            self.animation.setEndValue(end_geometry)
            self.animation.start()

            self.apps_container.show()
            title_label = self.centralWidget().findChild(QLabel)
            if title_label: title_label.show()
            self.copyright_label.show()

            self.expanded = True
            logging.info("[ClassBroom] 窗口已展开")

    def collapse_window(self):
        if self.expanded:
            screen = QGuiApplication.primaryScreen()
            if not screen: return
            screen_geometry = screen.availableGeometry()

            start_geometry = QRect(screen_geometry.right() - self.expanded_width, 
                                  (screen_geometry.height() - self.window_height) // 2,
                                  self.expanded_width, self.window_height)

            end_geometry = QRect(screen_geometry.right() - self.collapsed_width, 
                                (screen_geometry.height() - self.window_height) // 2,
                                self.collapsed_width, self.window_height)

            self.animation.setStartValue(start_geometry)
            self.animation.setEndValue(end_geometry)
            self.animation.start()

            self.apps_container.hide()
            self.centralWidget().findChild(QLabel).hide()
            self.copyright_label.hide()

            theme = CONFIG.get("theme", "light")
            bg_color = "rgba(255, 255, 255, 220)" if theme == "light" else "rgba(45, 55, 72, 220)"
            self.centralWidget().setStyleSheet(f"""
                QWidget {{
                    background: {bg_color};
                    border-top-left-radius: 12px;
                    border-bottom-left-radius: 12px;
                    border-top-right-radius: 0px;
                    border-bottom-right-radius: 0px;
                }}
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
            screen = QGuiApplication.primaryScreen()
            if not screen: return
            screen_geometry = screen.availableGeometry()
            edge_rect = QRect(screen_geometry.right() - 10, screen_geometry.top(), 20, screen_geometry.height())

            if edge_rect.contains(cursor_pos):
                self.expand_window()

        elif self.expanded:
            window_rect = self.geometry()
            expanded_rect = QRect(window_rect.x(), window_rect.y(), 
                                  window_rect.width() + 25, window_rect.height())

            if not expanded_rect.contains(cursor_pos):
                self.collapse_window()

    def load_apps(self):
        while self.apps_layout.count():
            item = self.apps_layout.takeAt(0)
            if item is None:
                continue
            
            layout = item.layout()
            if layout is not None:
                while layout.count():
                    child_item = layout.takeAt(0)
                    if child_item.widget():
                        child_item.widget().deleteLater()
            
            widget = item.widget()
            if widget is not None:
                widget.deleteLater()

        user_apps_config = CONFIG.get("apps", {})
        enabled_apps = []

        for app_id, app_info in self.app_map.items():
            user_config = user_apps_config.get(app_id, {})
            if user_config.get("enabled", False):
                # 合并应用基本信息和用户配置
                full_config = app_info.copy()
                full_config.update(user_config)
                enabled_apps.append((app_id, full_config))

        enabled_apps.sort(key=lambda x: x[1].get("position", 0))

        columns = CONFIG.get("columns", 3)
        if not isinstance(columns, int) or columns <= 0:
            columns = 3
        
        num_apps = len(enabled_apps)
        if num_apps == 0:
            return

        num_rows = (num_apps + columns - 1) // columns
        row_layouts = []
        for _ in range(num_rows):
            h_layout = QHBoxLayout()
            h_layout.setSpacing(5)
            h_layout.setContentsMargins(0, 0, 0, 0)
            row_layouts.append(h_layout)
            self.apps_layout.addLayout(h_layout)

        for index, (app_id, config) in enumerate(enabled_apps):
            app_launcher = AppLauncher(app_id, config)
            app_launcher.appClicked.connect(self.on_app_clicked)
            
            row = index // columns
            row_layouts[row].addWidget(app_launcher)

        for layout in row_layouts:
            layout.insertStretch(0, 1)
            layout.addStretch(1)
        
        self.apps_layout.addStretch(1)


    def on_app_clicked(self, app_id):
        # 调用统一的启动函数
        self.launch_app(app_id)

    def launch_app(self, app_id):
        """
        统一的应用启动函数。
        根据 app_id 动态导入并启动相应的应用。
        """
        app_info = self.app_map.get(app_id)
        if not app_info:
            logging.warning(f"[ClassBroom] 未知应用ID: {app_id}")
            return

        instance_attr = app_info.get("instance_attr")
        current_instance = getattr(self, instance_attr, None)

        # 如果实例已存在，则显示它
        if current_instance:
            if hasattr(current_instance, 'show_window'):
                current_instance.show_window()
            else:
                current_instance.show()
            
            if hasattr(current_instance, 'activateWindow'):
                current_instance.activateWindow()
            
            logging.info(f"[ClassBroom] 显示已存在的 {app_id} 实例。")
            return

        # 如果实例不存在，则创建并启动
        try:
            module_path = app_info["module"]
            
            # 动态导入模块
            module = importlib.import_module(module_path)
            
            instance = None
            takes_parent = app_info.get("takes_parent", False)

            if "class" in app_info: # 对于 CountdownManager 这样的类
                AppClass = getattr(module, app_info["class"])
                instance = AppClass(parent=self) if takes_parent else AppClass()
                instance.show()
            elif "function" in app_info: # 对于统一的 start_app 函数
                AppFunction = getattr(module, app_info["function"])
                instance = AppFunction(parent=self) if takes_parent else AppFunction()
            
            if instance:
                setattr(self, instance_attr, instance)
                # WeatherApp 的特殊定位
                if app_id == "Weather":
                    screen = QGuiApplication.primaryScreen()
                    if screen:
                        screen_geometry = screen.availableGeometry()
                        center_x = screen_geometry.center().x() - instance.width() // 2
                        center_y = screen_geometry.center().y() - instance.height() // 2
                        instance.move(center_x, center_y)
                
                # 确保所有新创建的窗口都显示
                if app_id != "Settings" and hasattr(instance, 'show') and not instance.isVisible():
                    instance.show()

                logging.info(f"[ClassBroom] {app_id} 已启动")

        except Exception as e:
            logging.exception(f"[ClassBroom] {app_id} 启动失败")

    def on_tray_icon_activated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            if self.expanded:
                self.collapse_window()
            else:
                self.show_window()

    def show_window(self):
        self.show()
        self.expand_window()

    def quit_application(self):
        logging.info("[ClassBroom] 进程退出")
        
        for app_id, info in self.app_map.items():
            instance_attr = info["instance_attr"]
            if hasattr(self, instance_attr): # 检查实例是否存在
                app_instance = getattr(self, instance_attr)
                if app_instance: # 检查实例是否为 None
                    try:
                        if app_id == "WindowRecorder":
                            app_instance.quit_app() # WindowRecorder 有特殊的退出方法
                        else:
                            app_instance.close()
                        logging.info(f"[ClassBroom] {app_id} 已关闭")
                    except RuntimeError as e:
                        logging.exception(f"[ClassBroom] {app_id} 关闭错误")
                    except Exception as e:
                        logging.exception(f"[ClassBroom] {app_id} 关闭时发生未知错误")
            
        QApplication.quit()


def main():
    logging.info("[ClassBroom] 进程启动")
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    font = QFont("Microsoft YaHei", 10)
    app.setFont(font)

    launcher = EdgeTrayWindow()
    launcher.show()

    app.exec()

if __name__ == '__main__':
    main()