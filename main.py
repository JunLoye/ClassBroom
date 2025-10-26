import sys
import os
import logging
import re
import urllib.request
import importlib.util
import importlib

from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QLabel, QFrame, QScrollArea, QSystemTrayIcon, QMenu, QStyle, QHBoxLayout)
from PyQt6.QtCore import Qt, pyqtSignal, QTimer, QPropertyAnimation, QRect, QEasingCurve, QUrl
from PyQt6.QtGui import QFont, QGuiApplication, QAction, QCursor, QDesktopServices


CONFIG = {
    "version": "v-3.0.0",
    "apps": {
        "Weather": {
            "name": "天气检测",
            "icon": "🌤️",
            "enabled": True,
            "position": 0,
        },
        "Countdown": {
            "name": "倒记日",
            "icon": "📆",
            "enabled": False,
            "position": 1,
        },
        "TextDisplay": {
            "name": "大字显示",
            "icon": "📄",
            "enabled": True,
            "position": 2,
        },
        "WindowRecorder": {
            "name": "窗口记录",
            "icon": "🪟",
            "enabled": True,
            "position": 3,
        },
        "Settings": {
            "name": "全局设置",
            "icon": "⚙️",
            "enabled": False,
            "position": 4,
        },
        "DemoModule": { # <-- 新增的示范模块配置
            "name": "示范模块",
            "icon": "💡",
            "enabled": True,
            "position": 5,
        }
    },
    "columns": 3
}

def mods_load():
    mods = {}
    mods_path = 'mods'

    if not os.path.exists(mods_path):
        logging.warning(f"模块目录 '{mods_path}' 不存在。")
        return mods

    for item_name in os.listdir(mods_path):
        mod_dir_path = os.path.join(mods_path, item_name)

        if os.path.isdir(mod_dir_path) and not item_name.startswith('__'):
            mod_name = item_name
            main_file_path = os.path.join(mod_dir_path, 'main.py')

            if not os.path.exists(main_file_path):
                logging.warning(f"模块 '{mod_name}' 目录中未找到规范性文件 'main.py'，跳过加载。")
                continue

            spec = importlib.util.spec_from_file_location(mod_name, main_file_path)
            if spec is None:
                logging.error(f"无法为模块 {mod_name} (路径: {main_file_path}) 创建规范")
                continue
            mod = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)
                sys.modules[mod_name] = mod  # 将模块添加到 sys.modules
                mods[mod_name] = mod
                logging.info(f"成功加载模块: {mod_name} (来自 {main_file_path})")
            except Exception as e:
                logging.error(f"加载模块 {mod_name} (来自 {main_file_path}) 失败: {e}")
    return mods


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
logging.info("[ClassBroom] 日志系统初始化完成，日志级别设置为 INFO")


mods_load()


class AppLauncher(QFrame):
    appClicked = pyqtSignal(str)

    def __init__(self, app_id, app_config_PATH, parent=None):
        super().__init__(parent)
        self.app_id = app_id
        self.app_config_PATH = app_config_PATH
        logging.debug(f"[AppLauncher] 初始化 AppLauncher，ID: {app_id}")
        self.init_ui()

    def init_ui(self):
        self.setFixedSize(80, 90)
        self.setFrameStyle(QFrame.Shape.NoFrame)
        logging.debug(f"[AppLauncher] {self.app_id}] 设置固定大小和边框样式")

        layout = QVBoxLayout()
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.setSpacing(5)
        layout.setContentsMargins(5, 8, 5, 8)
        logging.debug(f"[AppLauncher] {self.app_id}] 设置布局")

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
        logging.debug(f"[AppLauncher] {self.app_id}] 设置图标标签，图标: {icon_text}")

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
        logging.debug(f"[AppLauncher] {self.app_id}] 设置名称标签，名称: {self.app_config_PATH.get('name', '应用')}")

        layout.addWidget(icon_label)
        layout.addWidget(name_label)
        self.setLayout(layout)

        self.update_style()
        logging.debug(f"[AppLauncher] {self.app_id}] UI 初始化完成")

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
        logging.debug(f"[AppLauncher] {self.app_id}] 样式已更新")

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.appClicked.emit(self.app_id)
            logging.info(f"[AppLauncher] {self.app_id}] 应用启动器被点击")
        event.accept()


class Main(QMainWindow):
    def __init__(self):
        super().__init__()
        self.expanded = False
        self.animation = QPropertyAnimation(self, b"geometry")
        self.animation.setDuration(250)
        logging.debug("[ClassBroom] 初始化 ClassBroom")
        
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
            "DemoModule": { # <-- 新增的示范模块映射
                "module": "DemoModule", "function": "start_app", "instance_attr": "demo_app_instance", "takes_parent": True,
                "name": "示范模块", "icon": "💡"
            },
        }
        logging.debug(f"[ClassBroom] 应用映射已加载: {list(self.app_map.keys())}")
        
        self.init_ui()
        self.init_tray()
        self.setup_animation()

        self.hover_timer = QTimer(self)
        self.hover_timer.setSingleShot(True)
        self.hover_timer.timeout.connect(self.check_hover)
        logging.debug("[ClassBroom] 悬停计时器已设置")
    

        self.setMouseTracking(True)
        self.centralWidget().setMouseTracking(True)
        for child in self.centralWidget().findChildren(QWidget):
            child.setMouseTracking(True)
        logging.debug("[ClassBroom] 鼠标跟踪已启用")

        QTimer.singleShot(2000, self.check_for_updates)
        logging.debug("[ClassBroom] 2秒后检查更新的单次计时器已启动")

    def init_ui(self):
        self.setWindowTitle("ClassBroom")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool | Qt.WindowType.WindowStaysOnTopHint)
        logging.debug("[ClassBroom] 设置窗口标题和标志")

        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setStyleSheet("""
            QMainWindow {
                background: transparent;
            }
        """)
        logging.debug("[ClassBroom] 设置窗口为半透明背景")

        screen = QGuiApplication.primaryScreen()
        if not screen:
            logging.error("[ClassBroom] 无法获取屏幕信息，窗口初始化可能不正确")
            return
        screen_geometry = screen.availableGeometry()
        self.collapsed_width = 10
        self.expanded_width = 280
        self.window_height = 500
        logging.debug(f"[ClassBroom] 屏幕可用几何: {screen_geometry.width()}x{screen_geometry.height()}，窗口高度: {self.window_height}")

        self.setGeometry(screen_geometry.right() - self.collapsed_width, 
                         (screen_geometry.height() - self.window_height) // 2,
                         self.collapsed_width, self.window_height)
        logging.debug(f"[ClassBroom] 初始窗口几何: {self.geometry()}")

        central_widget = QWidget()
        central_widget.setStyleSheet("""
            QWidget {
                background: rgba(255, 255, 255, 220);
                border-radius: 12px;
            }
        """)
        self.setCentralWidget(central_widget)
        logging.debug("[ClassBroom] 设置中心小部件")

        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(8, 12, 8, 12)
        main_layout.setSpacing(8)
        logging.debug("[ClassBroom] 设置主布局")

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
        logging.debug("[ClassBroom] 添加标题标签")

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
        logging.debug("[ClassBroom] 添加滚动区域")

        self.apps_container = QWidget()
        self.apps_layout = QVBoxLayout(self.apps_container)
        self.apps_layout.setSpacing(5)
        self.apps_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.apps_layout.setContentsMargins(5, 5, 5, 5)
        scroll_area.setWidget(self.apps_container)
        logging.debug("[ClassBroom] 设置应用容器和布局")

        self.copyright_label = QLabel()
        self.copyright_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.copyright_label.setOpenExternalLinks(True)
        self.copyright_label.setStyleSheet("""
            font-size: 9px;
            background: transparent;
            margin-top: 5px;
        """)
        main_layout.addWidget(self.copyright_label)
        logging.debug("[ClassBroom] 添加版权标签")

        self.update_theme_style()
        
        self.load_apps()

        self.apps_container.hide()
        title_label.hide()
        self.copyright_label.hide()
        logging.debug("[ClassBroom] 初始状态下隐藏应用容器、标题和版权标签")

    def update_theme_style(self):
        theme = CONFIG.get("theme", "light")
        bg_color = "rgba(255, 255, 255, 220)" if theme == "light" else "rgba(45, 55, 72, 220)"
        text_color = "#333" if theme == "light" else "#e2e8f0"
        link_color = "#3498db" if theme == "light" else "#5dade2"
        logging.debug(f"[ClassBroom] 更新主题样式，当前主题: {theme}")

        central_widget = self.centralWidget()
        if central_widget:
            central_widget.setStyleSheet(f"""
                QWidget {{
                    background: {bg_color};
                    border-radius: 12px;
                    color: {text_color};
                }}
            """)
            logging.debug(f"[ClassBroom] 中心小部件样式已更新，背景: {bg_color}，文本颜色: {text_color}")

        copyright_text = (f"<p style='color:{text_color};'>© 2025 Jun_Loye<br/>"
                          f"<a style='color:{link_color}; text-decoration:none;' href='https://github.com/JunLoye/ClassBroom'>"
                          f"https://github.com/JunLoye/ClassBroom</a></p>")
        self.copyright_label.setText(copyright_text)
        logging.debug("[ClassBroom] 版权标签文本已更新")

    def init_tray(self):
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.tray_icon = QSystemTrayIcon(self)

            style = self.style()
            if style:
                icon = style.standardIcon(QStyle.StandardPixmap.SP_ComputerIcon)
                self.tray_icon.setIcon(icon)
                logging.debug("[ClassBroom] 系统托盘图标已设置")

            tray_menu = QMenu()

            show_action = QAction("显示", self)
            show_action.triggered.connect(self.show_window)
            tray_menu.addAction(show_action)
            logging.debug("[ClassBroom] '显示' 动作已添加到托盘菜单")

            update_action = QAction("检查更新", self)
            update_action.triggered.connect(self.check_for_updates)
            tray_menu.addAction(update_action)
            logging.debug("[ClassBroom] '检查更新' 动作已添加到托盘菜单")
                
            quit_action = QAction("退出", self)
            quit_action.triggered.connect(self.quit_application)
            tray_menu.addAction(quit_action)
            logging.debug("[ClassBroom] '退出' 动作已添加到托盘菜单")

            self.tray_icon.setContextMenu(tray_menu)
            self.tray_icon.setToolTip("ClassBroom")
            self.tray_icon.activated.connect(self.on_tray_icon_activated)
            self.tray_icon.messageClicked.connect(self.open_releases_page)
            self.tray_icon.show()
            logging.info("[ClassBroom] 系统托盘初始化完成并显示")
        else:
            logging.warning("[ClassBroom] 系统托盘不可用")

    def check_for_updates(self):
        logging.info("[ClassBroom] 开始检查更新")
        try:
            url = "https://github.com/JunLoye/ClassBroom/releases/latest"
            logging.debug(f"[ClassBroom] 尝试从 URL 获取最新版本: {url}")
            
            with urllib.request.urlopen(url) as response:
                final_url = response.geturl()
            logging.debug(f"[ClassBroom] 获取到的最终 URL: {final_url}")
            
            if not final_url or "tag" not in final_url:
                self.show_update_notification("检查更新失败", "无法获取最新版本信息")
                logging.warning("[ClassBroom] 无法从最终 URL 中解析出版本标签")
                return

            latest_version_tag = final_url.split('/')[-1]
            local_version = CONFIG.get("version", "0.0.0")

            latest_version_numbers = tuple(map(int, (re.findall(r'\d+', latest_version_tag) or ['0'])))
            local_version_numbers = tuple(map(int, (re.findall(r'\d+', local_version) or ['0'])))
            logging.debug(f"[ClassBroom] 解析版本: 最新版本标签 '{latest_version_tag}' -> {latest_version_numbers}, 本地版本 '{local_version}' -> {local_version_numbers}")

            if latest_version_numbers > local_version_numbers:
                title = "发现新版本！"
                message = f"新版本 {latest_version_tag} 可用\n当前版本 {local_version}\n→前往GitHub查看详情"
                logging.info(f"[ClassBroom] 发现新版本: {latest_version_tag} (本地: {local_version})")
            else:
                title = "已是最新版本"
                message = f"您当前已是最新版本 {local_version}\n→前往GitHub查看详情"
                logging.info(f"[ClassBroom] 已是最新版本: {local_version}")
            
            self.show_update_notification(title, message)
            logging.info(f"[ClassBroom] 检查更新完成: 本地版本 {local_version}, 最新版本 {latest_version_tag}")

        except Exception as e:
            logging.exception(f"[ClassBroom] 检查更新失败: {e}")
            self.show_update_notification("检查更新失败", "请检查您的网络连接")

    def show_update_notification(self, title, message):
        self.tray_icon.showMessage(title, message, QSystemTrayIcon.MessageIcon.Information, 5000)
        logging.debug(f"[ClassBroom] 显示更新通知: 标题='{title}', 消息='{message}'")

    def open_releases_page(self):
        url = "https://github.com/LoyeJun/ClassBroom/releases/latest"
        QDesktopServices.openUrl(QUrl(url))
        logging.info(f"[ClassBroom] 打开更新页面: {url}")

    def setup_animation(self):
        self.animation.setEasingCurve(QEasingCurve.Type.OutQuad)
        logging.debug("[ClassBroom] 动画缓动曲线已设置为 OutQuad")

    def toggle_window(self):
        if self.expanded:
            self.collapse_window()
            logging.debug("[ClassBroom] 切换窗口状态：从展开到收起")
        else:
            self.expand_window()
            logging.debug("[ClassBroom] 切换窗口状态：从收起到展开")

    def expand_window(self):
        if not self.expanded:
            self.update_theme_style()
            screen = QGuiApplication.primaryScreen()
            if not screen: 
                logging.warning("[ClassBroom] 无法获取屏幕信息，无法展开窗口")
                return
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
            logging.debug(f"[ClassBroom] 展开窗口动画开始，从 {start_geometry} 到 {end_geometry}")

            self.apps_container.show()
            title_label = self.centralWidget().findChild(QLabel)
            if title_label: title_label.show()
            self.copyright_label.show()
            logging.debug("[ClassBroom] 应用容器、标题和版权标签已显示")

            self.expanded = True
            logging.info("[ClassBroom] 侧载窗口已展开")
        else:
            logging.debug("[ClassBroom] 窗口已展开，无需重复展开")

    def collapse_window(self):
        if self.expanded:
            screen = QGuiApplication.primaryScreen()
            if not screen: 
                logging.warning("[ClassBroom] 无法获取屏幕信息，无法收起窗口")
                return
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
            logging.debug(f"[ClassBroom] 收起窗口动画开始，从 {start_geometry} 到 {end_geometry}")

            self.apps_container.hide()
            title_label = self.centralWidget().findChild(QLabel)
            if title_label: title_label.hide()
            self.copyright_label.hide()
            logging.debug("[ClassBroom] 应用容器、标题和版权标签已隐藏")

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
            logging.debug(f"[ClassBroom] 收起窗口时中心小部件样式已更新，背景: {bg_color}")

            self.expanded = False
            logging.info("[ClassBroom] 侧载窗口已收起")
        else:
            logging.debug("[ClassBroom] 窗口已收起，无需重复收起")

    def enterEvent(self, event):
        self.hover_timer.start(10)
        logging.debug("[ClassBroom] 鼠标进入窗口区域，启动悬停计时器")
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.hover_timer.start(10)
        logging.debug("[ClassBroom] 鼠标离开窗口区域，启动悬停计时器")
        super().leaveEvent(event)

    def check_hover(self):
        cursor_pos = QCursor.pos()
        logging.debug(f"[ClassBroom] 检查鼠标悬停状态，当前鼠标位置: {cursor_pos.x()}, {cursor_pos.y()}")

        if not self.expanded:
            screen = QGuiApplication.primaryScreen()
            if not screen: 
                logging.warning("[ClassBroom] 无法获取屏幕信息，无法检查悬停")
                return
            screen_geometry = screen.availableGeometry()
            edge_rect = QRect(screen_geometry.right() - 10, screen_geometry.top(), 20, screen_geometry.height())
            logging.debug(f"[ClassBroom] 窗口未展开，检测边缘区域: {edge_rect}")

            if edge_rect.contains(cursor_pos):
                self.expand_window()
                logging.debug("[ClassBroom] 鼠标悬停在边缘区域，展开窗口")

        elif self.expanded:
            window_rect = self.geometry()
            expanded_rect = QRect(window_rect.x(), window_rect.y(), 
                                  window_rect.width() + 25, window_rect.height())
            logging.debug(f"[ClassBroom] 窗口已展开，检测扩展区域: {expanded_rect}")

            if not expanded_rect.contains(cursor_pos):
                self.collapse_window()
                logging.debug("[ClassBroom] 鼠标离开扩展区域，收起窗口")

    def load_apps(self):
        logging.info("[ClassBroom] 开始加载应用")
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
                        logging.debug(f"[ClassBroom] 移除旧的应用小部件: {child_item.widget().__class__.__name__}")
            
            widget = item.widget()
            if widget is not None:
                widget.deleteLater()
                logging.debug(f"[ClassBroom] 移除旧的布局小部件: {widget.__class__.__name__}")
        logging.debug("[ClassBroom] 已清除所有现有应用布局")

        user_apps_config = CONFIG.get("apps", {})
        enabled_apps = []

        for app_id, app_info in self.app_map.items():
            user_config = user_apps_config.get(app_id, {})
            if user_config.get("enabled", False):
                full_config = app_info.copy()
                full_config.update(user_config)
                enabled_apps.append((app_id, full_config))
                logging.debug(f"[ClassBroom] 已启用应用: {app_id}，配置: {full_config}")
            else:
                logging.debug(f"[ClassBroom] 应用 {app_id} 未启用或配置缺失")

        enabled_apps.sort(key=lambda x: x[1].get("position", 0))
        logging.debug(f"[ClassBroom] 启用应用已按位置排序: {[app[0] for app in enabled_apps]}")

        columns = CONFIG.get("columns", 3)
        if not isinstance(columns, int) or columns <= 0:
            columns = 3
            logging.warning(f"[ClassBroom] 配置中列数无效，使用默认值 {columns}")
        logging.debug(f"[ClassBroom] 应用布局列数: {columns}")
        
        num_apps = len(enabled_apps)
        if num_apps == 0:
            logging.info("[ClassBroom] 没有启用的应用可加载")
            return

        num_rows = (num_apps + columns - 1) // columns
        row_layouts = []
        for i in range(num_rows):
            h_layout = QHBoxLayout()
            h_layout.setSpacing(5)
            h_layout.setContentsMargins(0, 0, 0, 0)
            row_layouts.append(h_layout)
            self.apps_layout.addLayout(h_layout)
            logging.debug(f"[ClassBroom] 创建第 {i+1} 行布局")

        for index, (app_id, config) in enumerate(enabled_apps):
            app_launcher = AppLauncher(app_id, config)
            app_launcher.appClicked.connect(self.on_app_clicked)
            
            row = index // columns
            row_layouts[row].addWidget(app_launcher)
            logging.debug(f"[ClassBroom] 将应用启动器 {app_id} 添加到第 {row+1} 行")

        for layout in row_layouts:
            layout.insertStretch(0, 1)
            layout.addStretch(1)
            logging.debug("[ClassBroom] 在行布局中添加伸缩器以居中应用")
        
        self.apps_layout.addStretch(1)
        logging.info(f"[ClassBroom] 已加载 {num_apps} 个应用")


    def on_app_clicked(self, app_id):
        logging.info(f"[ClassBroom] 接收到应用点击事件，应用ID: {app_id}")
        self.launch_app(app_id)

    def launch_app(self, app_id):
        app_info = self.app_map.get(app_id)
        if not app_info:
            logging.warning(f"[ClassBroom] 未知应用ID: {app_id}，无法启动")
            return

        instance_attr = app_info.get("instance_attr")
        current_instance = getattr(self, instance_attr, None)
        logging.debug(f"[ClassBroom] 尝试启动应用 {app_id}，实例属性: {instance_attr}")

        if current_instance:
            # 检查 current_instance 是否仍然是有效的 QObject
            if not isinstance(current_instance, QWidget) or current_instance.parent() is None and not current_instance.isVisible():
                logging.warning(f"[ClassBroom] 应用 {app_id} 的实例 {instance_attr} 已被删除或无效，尝试重新创建")
                setattr(self, instance_attr, None) # 清除无效引用
                current_instance = None # 强制重新创建
            else:
                logging.debug(f"[ClassBroom] 应用 {app_id} 的实例已存在")
                if hasattr(current_instance, 'show_window'):
                    current_instance.show_window()
                    logging.debug(f"[ClassBroom] 调用 {app_id} 实例的 show_window 方法")
                else:
                    current_instance.show()
                    logging.debug(f"[ClassBroom] 调用 {app_id} 实例的 show 方法")
                
                if hasattr(current_instance, 'activateWindow'):
                    current_instance.activateWindow()
                    logging.debug(f"[ClassBroom] 激活 {app_id} 实例窗口")
                
                logging.info(f"[ClassBroom] 显示已存在的 {app_id} 实例")
                return

        try:
            module_path = app_info["module"] # 这是完整的模块路径，例如 "DemoModule" 或 "apps.Weather.main"
            logging.debug(f"[ClassBroom] 尝试加载模块: {module_path}")

            module = None
            # 首先，检查它是否是 mods_load 加载的模块（简单名称）
            if module_path in sys.modules:
                module = sys.modules[module_path]
                logging.debug(f"[ClassBroom] 模块 {module_path} 已在 sys.modules 中找到。")
            else:
                # 如果在 sys.modules 中未直接找到，则尝试标准导入
                try:
                    module = importlib.import_module(module_path)
                    logging.debug(f"[ClassBroom] 模块 {module_path} 已通过 importlib.import_module 成功加载。")
                except ImportError as e:
                    logging.error(f"[ClassBroom] 无法通过标准导入加载模块 {module_path}: {e}")
                    raise # 重新抛出异常，以便被外部的 try-except 捕获

            if module is None:
                raise ImportError(f"模块 '{module_path}' 无法加载。")
            
            instance = None
            takes_parent = app_info.get("takes_parent", False)

            if "class" in app_info:
                AppClass = getattr(module, app_info["class"])
                instance = AppClass(parent=self) if takes_parent else AppClass()
                instance.show()
                logging.debug(f"[ClassBroom] 已实例化类 {app_info['class']} 并显示")
            elif "function" in app_info:
                AppFunction = getattr(module, app_info["function"])
                instance = AppFunction(parent=self) if takes_parent else AppFunction()
                logging.debug(f"[ClassBroom] 已调用函数 {app_info['function']}")
            
            if instance:
                setattr(self, instance_attr, instance)
                logging.debug(f"[ClassBroom] 已将 {app_id} 实例存储在 self.{instance_attr}")
                
                if hasattr(instance, 'closed'):
                    instance.closed.connect(lambda app_id=app_id: self._app_closed_cleanup(app_id))
                    logging.debug(f"[ClassBroom] 已连接 {app_id} 的 closed 信号到清理槽")

                if app_id == "Weather":
                    screen = QGuiApplication.primaryScreen()
                    if screen:
                        screen_geometry = screen.availableGeometry()
                        center_x = screen_geometry.center().x() - instance.width() // 2
                        center_y = screen_geometry.center().y() - instance.height() // 2
                        instance.move(center_x, center_y)
                        logging.debug(f"[ClassBroom] Weather 应用已定位到屏幕中心: ({center_x}, {center_y})")
                
                # 确保所有新创建的窗口都显示
                if app_id != "Settings" and hasattr(instance, 'show') and not instance.isVisible():
                    instance.show()
                    logging.debug(f"[ClassBroom] 确保 {app_id} 窗口可见")

                logging.info(f"[ClassBroom] {app_id} 已成功启动")

        except Exception as e:
            logging.exception(f"[ClassBroom] {app_id} 启动失败，错误: {e}")

    def _app_closed_cleanup(self, app_id):
        """
        当一个子应用窗口关闭时，清理 Main 中对应的实例引用
        """
        logging.info(f"[ClassBroom] 接收到应用 {app_id} 关闭信号，清理实例引用")
        app_info = self.app_map.get(app_id)
        if app_info:
            instance_attr = app_info.get("instance_attr")
            if hasattr(self, instance_attr):
                setattr(self, instance_attr, None)
                logging.debug(f"[ClassBroom] 已将 self.{instance_attr} 设置为 None")
        else:
            logging.warning(f"[ClassBroom] 尝试清理未知应用ID: {app_id}")

    def on_tray_icon_activated(self, reason):
        logging.debug(f"[ClassBroom] 系统托盘图标被激活，原因: {reason}")
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            if self.expanded:
                self.collapse_window()
                logging.debug("[ClassBroom] 托盘图标点击：窗口已展开，执行收起操作")
            else:
                self.show_window()
                logging.debug("[ClassBroom] 托盘图标点击：窗口未展开，执行显示操作")

    def show_window(self):
        self.show()
        self.expand_window()
        logging.info("[ClassBroom] 主窗口已显示并展开")

    def quit_application(self):
        logging.info("[ClassBroom] 应用程序退出中...")
        
        for app_id, info in self.app_map.items():
            instance_attr = info["instance_attr"]
            if hasattr(self, instance_attr):
                app_instance = getattr(self, instance_attr)
                if app_instance:
                    logging.debug(f"[ClassBroom] 尝试关闭应用实例: {app_id}")
                    try:
                        if app_id == "WindowRecorder":
                            if hasattr(app_instance, 'quit_app'):
                                app_instance.quit_app()
                                logging.info(f"[ClassBroom] {app_id} 已通过 quit_app 方法关闭")
                            else:
                                logging.warning(f"[ClassBroom] {app_id} 实例没有 quit_app 方法")
                        else:
                            app_instance.close()
                            logging.info(f"[ClassBroom] {app_id} 已通过 close 方法关闭")
                    except RuntimeError as e:
                        logging.exception(f"[ClassBroom] {app_id} 关闭错误 (RuntimeError): {e}")
                    except Exception as e:
                        logging.exception(f"[ClassBroom] {app_id} 关闭时发生未知错误: {e}")
                else:
                    logging.debug(f"[ClassBroom] 应用实例 {app_id} 不存在或为 None，跳过关闭")
            else:
                logging.debug(f"[ClassBroom] 未找到应用 {app_id} 的实例属性 {instance_attr}")
            
        QApplication.quit()
        logging.info("[ClassBroom] QApplication 已退出")


def main():
    logging.info("[ClassBroom] 应用程序主函数启动")
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    logging.debug("[ClassBroom] QApplication 已创建，并设置不随最后一个窗口关闭而退出")

    font = QFont("Microsoft YaHei", 10)
    app.setFont(font)
    logging.debug("[ClassBroom] 应用程序字体已设置为 'Microsoft YaHei', 10pt")

    launcher = Main()
    launcher.show()
    logging.info("[ClassBroom] Main 实例已创建并显示")

    sys.exit(app.exec())

if __name__ == '__main__':
    main()