# ----------------------- 导入模块 -----------------------
import sys
import json
import logging
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QLabel, QFrame, QPushButton, QLineEdit, QMessageBox)
from PyQt6.QtCore import Qt, pyqtSignal, QTimer, QDateTime
from PyQt6.QtGui import QFont, QGuiApplication


# ----------------------- 倒计日管理器 -----------------------
class CountdownManager:
    """倒计日管理器"""
    def __init__(self):
        self.compact_widget = CompactCountdownWidget()
        self.settings_window = CountdownApp(self.compact_widget)
        
        # 连接信号
        self.compact_widget.doubleClicked.connect(self.show_settings)
        
        # 初始化位置
        self.position_widget()
    
    def position_widget(self):
        """将紧凑窗口定位到屏幕顶端"""
        screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
        x = (screen_geometry.width() - self.compact_widget.width()) // 2
        y = screen_geometry.top() + 10
        self.compact_widget.move(x, y)
    
    def show_settings(self):
        """显示设置窗口"""
        screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
        x = screen_geometry.center().x() - self.settings_window.width() // 2
        y = screen_geometry.center().y() - self.settings_window.height() // 2
        self.settings_window.move(x, y)
        self.settings_window.show()
    
    def show(self):
        """显示紧凑窗口"""
        self.compact_widget.show()

class CompactCountdownWidget(QFrame):
    """紧凑型倒计日窗口"""
    appClicked = pyqtSignal(str)
    doubleClicked = pyqtSignal()
    dragStarted = pyqtSignal(QWidget)
    
    def __init__(self, app_id="countdown"):
        super().__init__()
        self.app_id = app_id
        self.config_file = "config.json"
        self.target_date = None
        self.countdown_title = "目标日"
        self.is_compact = True
        
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_countdown)
        self.timer.start(1000)  # 每秒更新
        
        self.load_config()
        self.init_ui()
    
    def init_ui(self):
        self.setFixedSize(200, 100)  # 固定窗口大小
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)  # 无边框
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)  # 修复：确保透明背景属性正确

        self.update_style()
        
        # 标题
        self.title_label = QLabel(self.countdown_title, self)
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.title_label.setStyleSheet("""
            QLabel {
                font-size: 14px; 
                font-weight: bold; 
                margin: 5px; 
                color: #333;
            }
        """)
        
        # 倒计时标签
        self.countdown_label = QLabel("", self)
        self.countdown_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.countdown_label.setStyleSheet("""
            QLabel {
                font-size: 24px; 
                font-weight: bold; 
                margin: 10px; 
                color: #e74c3c;
            }
        """)
        
        # 布局
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(5)
        layout.addWidget(self.title_label)
        layout.addWidget(self.countdown_label)
        self.setLayout(layout)

    def update_style(self):
        """更新窗口样式"""
        self.setStyleSheet("""
            CompactCountdownWidget {
                background: #ffffff;
                border: 1px solid #dcdcdc;
                border-radius: 12px;
            }
            QLabel {
                color: #2c3e50;
            }
        """)

    def update_countdown(self):
        if not self.target_date:
            return
        
        try:
            target_datetime = QDateTime.fromString(self.target_date, "yyyy-MM-dd")
            current_datetime = QDateTime.currentDateTime()
            
            if current_datetime >= target_datetime:
                self.countdown_label.setText("倒计时结束")
                return
            
            remaining_time = current_datetime.secsTo(target_datetime)
            
            days = remaining_time // (24 * 3600)
            hours = (remaining_time % (24 * 3600)) // 3600
            minutes = (remaining_time % 3600) // 60
            seconds = remaining_time % 60
            
            if self.is_compact:
                self.countdown_label.setText(f"{days}天")
            else:
                self.countdown_label.setText(f"{days}天 {hours}小时")
        
        except Exception as e:
            logging.error(f"[Countdown] 更新时间失败: {e}")

    def mouseDoubleClickEvent(self, event):
        pass
    
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

    def load_config(self):
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                countdown_config = config.get("apps", {}).get("countdown", {}).get("config", {})
                self.target_date = countdown_config.get("target_date", "2024-12-31")
                self.countdown_title = countdown_config.get("title", "目标日")
                logging.info("[Countdown] 配置加载成功")
        except Exception as e:
            logging.error(f"[Countdown] 加载配置失败: {e}")
            self.target_date = "2026-01-01"
            self.countdown_title = "目标日"
            

# ----------------------- 倒计日设置窗口 -----------------------
class CountdownApp(QMainWindow):
    def __init__(self, compact_widget=None):
        super().__init__()
        self.compact_widget = compact_widget
        self.config_file = "config.json"
        self.target_date = None
        self.countdown_title = "目标日"
        
        self.load_config()
        self.init_ui()
    
    def load_config(self):
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                countdown_config = config.get("apps", {}).get("countdown", {}).get("config", {})
                
                self.target_date = countdown_config.get("target_date", "2024-12-31")
                self.countdown_title = countdown_config.get("title", "目标日")
                
                logging.info("[Countdown] 配置加载成功")
        except Exception as e:
            logging.error(f"[Countdown] 加载配置失败: {e}")
            self.target_date = "2026-01-01"
            self.countdown_title = "目标日"

    
    def init_ui(self):
        self.setWindowTitle("倒计日设置")
        self.setFixedSize(300, 200)
        
        layout = QVBoxLayout()
        
        title_label = QLabel("倒计日设置")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("font-size: 16px; font-weight: bold;")
        layout.addWidget(title_label)
        
        # 事件标题输入
        title_input_label = QLabel("事件标题:")
        layout.addWidget(title_input_label)
        
        self.title_input = QLineEdit(self.countdown_title)
        layout.addWidget(self.title_input)
        
        # 目标日期输入
        date_input_label = QLabel("目标日期:")
        layout.addWidget(date_input_label)
        
        self.date_input = QLineEdit(self.target_date)
        layout.addWidget(self.date_input)
        
        # 保存按钮
        save_button = QPushButton("保存")
        save_button.clicked.connect(self.apply_settings)
        layout.addWidget(save_button)
        
        central_widget = QWidget()
        central_widget.setLayout(layout)
        self.setCentralWidget(central_widget)
    
    def apply_settings(self):
        self.countdown_title = self.title_input.text()
        self.target_date = self.date_input.text()
        self.save_config()
        
        if self.compact_widget:
            self.compact_widget.countdown_title = self.countdown_title
            self.compact_widget.target_date = self.target_date
            self.compact_widget.update_countdown()
        
        QMessageBox.information(self, "设置成功", "倒计日设置已保存")


# ----------------------- 主函数 -----------------------
def main():
    logging.info("[Countdown] 进程启动")
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    font = QFont("Microsoft YaHei", 10)
    app.setFont(font)


    sys.exit(app.exec())

if __name__ == '__main__':
    main()