from PyQt6.QtWidgets import QWidget, QLabel, QVBoxLayout, QPushButton, QHBoxLayout
from PyQt6.QtCore import pyqtSignal, Qt, QTimer
from PyQt6.QtGui import QFont

class DemoApp(QWidget):
    closed = pyqtSignal()

    def __init__(self, parent: QWidget = None):
        super().__init__(parent)
        self.setWindowTitle("示范应用 - DemoApp")
        self.setGeometry(200, 200, 350, 150) # 初始位置和大小
        self.setWindowFlags(Qt.WindowType.Window | Qt.WindowType.WindowStaysOnTopHint) # 保持在最上层
        self.init_ui()
        self.count = 0
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.update_count)
        self.timer.start(1000) # 每秒更新一次

    def init_ui(self):
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(15, 15, 15, 15)
        main_layout.setSpacing(10)

        self.info_label = QLabel("欢迎来到示范应用！")
        self.info_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.info_label.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        main_layout.addWidget(self.info_label)

        self.counter_label = QLabel("计数: 0")
        self.counter_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.counter_label.setFont(QFont("Microsoft YaHei", 10))
        main_layout.addWidget(self.counter_label)

        button_layout = QHBoxLayout()
        close_button = QPushButton("关闭窗口")
        close_button.clicked.connect(self.close)
        
        reset_button = QPushButton("重置计数")
        reset_button.clicked.connect(self.reset_count)

        button_layout.addStretch(1)
        button_layout.addWidget(reset_button)
        button_layout.addWidget(close_button)
        button_layout.addStretch(1)

        main_layout.addLayout(button_layout)
        self.setLayout(main_layout)

        self.setStyleSheet("""
            QWidget {
                background-color: #f0f8ff;
                border-radius: 10px;
                border: 1px solid #a0c0e0;
            }
            QLabel {
                color: #333;
            }
            QPushButton {
                background-color: #4CAF50;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 5px;
                font-size: 10px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
        """)

    def update_count(self):
        self.count += 1
        self.counter_label.setText(f"计数: {self.count}")

    def reset_count(self):
        self.count = 0
        self.counter_label.setText(f"计数: {self.count}")

    def closeEvent(self, event):
        """
        当窗口关闭时，发出 closed 信号，并停止计时器。
        """
        self.timer.stop()
        self.closed.emit()
        super().closeEvent(event)

    def show_window(self):
        """
        提供一个方法让主程序可以重新显示此窗口。
        """
        self.show()
        self.activateWindow() # 激活窗口
        self.raise_()         # 将窗口带到前台

# 如果主程序通过函数调用来启动，可以提供一个包装函数
def start_app(parent: QWidget = None):
    """
    ClassBroom 主程序调用的入口函数。
    返回 DemoApp 的实例。
    """
    instance = DemoApp(parent)
    instance.show() # 确保窗口显示
    return instance # 必须返回实例，以便主程序可以持有引用和连接信号
