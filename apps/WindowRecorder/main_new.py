# ----------------------- 导入模块 -----------------------
import sys
import time
import logging
import pyautogui
import os
import win32gui
import win32con
from datetime import datetime
from PIL import ImageGrab

from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QHBoxLayout,
                             QLabel, QVBoxLayout, QFrame, QPushButton, QDialog, QFormLayout, QLineEdit, QSpinBox,
                             QDialogButtonBox, QComboBox, QCheckBox, QScrollArea, QGroupBox,
)
from PyQt6.QtCore import Qt, pyqtSignal, QThread, QTimer
from PyQt6.QtGui import QFont, QIcon


# ===== 配置 =====
DEFAULT_INTERVAL = 10  # 默认每隔多少秒截图
DEFAULT_OUTPUT_DIR = "screenshots"
# ================


class ScreenshotThread(QThread):
    """截图线程，用于在后台执行截图任务"""
    log_signal = pyqtSignal(str)  # 用于发送日志信号

    def __init__(self, interval=DEFAULT_INTERVAL, output_dir=DEFAULT_OUTPUT_DIR):
        super().__init__()
        self.interval = interval
        self.output_dir = output_dir
        self.running = False
        os.makedirs(self.output_dir, exist_ok=True)

    def run(self):
        """线程主函数，执行定时截图任务"""
        self.running = True
        self.log_signal.emit(f"开始定时截图，每 {self.interval} 秒保存一次到文件夹：{self.output_dir}")

        while self.running:
            try:
                self.capture_fullscreen()
                self.capture_windows()
                time.sleep(self.interval)
            except Exception as e:
                self.log_signal.emit(f"[错误] {e}")
                time.sleep(self.interval)

    def stop(self):
        """停止截图线程"""
        self.running = False
        self.wait()
        self.log_signal.emit("截图任务已停止")

    def timestamp(self):
        """生成时间戳字符串"""
        return datetime.now().strftime("%Y%m%d_%H%M%S")

    def capture_fullscreen(self):
        """截图整个屏幕"""
        img = ImageGrab.grab(all_screens=True)
        filename = os.path.join(self.output_dir, f"screen_{self.timestamp()}.png")
        img.save(filename)
        self.log_signal.emit(f"[✓] 全屏截图：{filename}")

    def capture_windows(self):
        """截图当前所有窗口（排除最小化或无效窗口）"""
        def enum_windows_callback(hwnd, windows):
            """枚举窗口的回调函数"""
            if win32gui.IsWindowVisible(hwnd) and win32gui.GetWindowText(hwnd):
                rect = win32gui.GetWindowRect(hwnd)
                if rect[2] - rect[0] > 0 and rect[3] - rect[1] > 0:  # 确保窗口有有效大小
                    title = win32gui.GetWindowText(hwnd)
                    windows.append((hwnd, title, rect))
            return True

        windows = []
        win32gui.EnumWindows(enum_windows_callback, windows)

        for hwnd, title, rect in windows:
            try:
                # 跳过最小化窗口
                if win32gui.IsIconic(hwnd):
                    continue

                # 获取窗口区域
                left, top, right, bottom = rect
                width = right - left
                height = bottom - top

                # 截图
                box = (left, top, width, height)
                img = pyautogui.screenshot(region=box)

                # 处理文件名
                safe_title = title.strip().replace(' ', '_').replace('/', '_').replace('\', '_') or "untitled"
                filename = os.path.join(self.output_dir, f"window_{safe_title}_{self.timestamp()}.png")
                img.save(filename)
                self.log_signal.emit(f"    [→] 窗口截图：{title}")
            except Exception as e:
                self.log_signal.emit(f"    [×] 无法截图窗口：{title} ({e})")


class SettingsDialog(QDialog):
    """设置对话框，用于配置截图参数"""
    def __init__(self, parent=None, interval=DEFAULT_INTERVAL, output_dir=DEFAULT_OUTPUT_DIR):
        super().__init__(parent)
        self.interval = interval
        self.output_dir = output_dir
        self.setWindowTitle("窗口记录器设置")
        self.setModal(True)
        self.resize(400, 200)
        self.init_ui()

    def init_ui(self):
        """初始化UI界面"""
        layout = QVBoxLayout(self)

        # 设置表单
        form_layout = QFormLayout()

        # 截图间隔设置
        self.interval_spinbox = QSpinBox()
        self.interval_spinbox.setRange(1, 3600)
        self.interval_spinbox.setSuffix(" 秒")
        self.interval_spinbox.setValue(self.interval)
        form_layout.addRow("截图间隔:", self.interval_spinbox)

        # 输出目录设置
        self.output_dir_edit = QLineEdit(self.output_dir)
        browse_button = QPushButton("浏览...")
        browse_button.clicked.connect(self.browse_output_dir)

        dir_layout = QHBoxLayout()
        dir_layout.addWidget(self.output_dir_edit)
        dir_layout.addWidget(browse_button)
        form_layout.addRow("输出目录:", dir_layout)

        layout.addLayout(form_layout)

        # 按钮组
        button_box = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)

    def browse_output_dir(self):
        """浏览并选择输出目录"""
        from PyQt6.QtWidgets import QFileDialog
        dir_path = QFileDialog.getExistingDirectory(self, "选择输出目录", self.output_dir)
        if dir_path:
            self.output_dir_edit.setText(dir_path)

    def get_settings(self):
        """获取设置值"""
        return {
            "interval": self.interval_spinbox.value(),
            "output_dir": self.output_dir_edit.text()
        }


class WindowRecorderApp(QMainWindow):
    """窗口记录器主窗口"""
    def __init__(self):
        super().__init__()
        self.screenshot_thread = None
        self.init_ui()
        self.load_settings()

    def init_ui(self):
        """初始化UI界面"""
        self.setWindowTitle("窗口记录器")
        self.setFixedSize(400, 300)

        # 设置窗口图标
        self.setWindowIcon(QIcon("icon.png"))

        # 中心部件
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        # 主布局
        main_layout = QVBoxLayout(central_widget)
        main_layout.setSpacing(10)
        main_layout.setContentsMargins(15, 15, 15, 15)

        # 标题
        title_label = QLabel("窗口记录器")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_font = QFont("Microsoft YaHei", 16, QFont.Weight.Bold)
        title_label.setFont(title_font)
        main_layout.addWidget(title_label)

        # 状态显示
        self.status_label = QLabel("状态: 未开始")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(self.status_label)

        # 设置显示
        self.settings_group = QGroupBox("当前设置")
        settings_layout = QVBoxLayout(self.settings_group)

        self.interval_label = QLabel(f"截图间隔: {DEFAULT_INTERVAL} 秒")
        self.output_dir_label = QLabel(f"输出目录: {DEFAULT_OUTPUT_DIR}")

        settings_layout.addWidget(self.interval_label)
        settings_layout.addWidget(self.output_dir_label)

        main_layout.addWidget(self.settings_group)

        # 日志区域
        log_group = QGroupBox("日志")
        log_layout = QVBoxLayout(log_group)

        self.log_scroll = QScrollArea()
        self.log_scroll.setWidgetResizable(True)
        self.log_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        self.log_widget = QWidget()
        self.log_layout = QVBoxLayout(self.log_widget)
        self.log_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        self.log_scroll.setWidget(self.log_widget)
        log_layout.addWidget(self.log_scroll)

        main_layout.addWidget(log_group)

        # 按钮区域
        button_layout = QHBoxLayout()

        self.start_button = QPushButton("开始记录")
        self.start_button.clicked.connect(self.start_recording)

        self.stop_button = QPushButton("停止记录")
        self.stop_button.clicked.connect(self.stop_recording)
        self.stop_button.setEnabled(False)

        self.settings_button = QPushButton("设置")
        self.settings_button.clicked.connect(self.open_settings)

        button_layout.addWidget(self.start_button)
        button_layout.addWidget(self.stop_button)
        button_layout.addWidget(self.settings_button)

        main_layout.addLayout(button_layout)

    def load_settings(self):
        """加载设置"""
        # 这里可以从配置文件加载设置
        self.interval = DEFAULT_INTERVAL
        self.output_dir = DEFAULT_OUTPUT_DIR
        self.update_settings_display()

    def update_settings_display(self):
        """更新设置显示"""
        self.interval_label.setText(f"截图间隔: {self.interval} 秒")
        self.output_dir_label.setText(f"输出目录: {self.output_dir}")

    def add_log(self, message):
        """添加日志消息"""
        log_label = QLabel(message)
        log_label.setWordWrap(True)
        self.log_layout.addWidget(log_label)

        # 自动滚动到底部
        self.log_scroll.verticalScrollBar().setValue(
            self.log_scroll.verticalScrollBar().maximum()
        )

        # 限制日志条数，避免内存占用过多
        if self.log_layout.count() > 100:
            item = self.log_layout.itemAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()
                self.log_layout.removeItem(item)

    def start_recording(self):
        """开始截图记录"""
        if not self.screenshot_thread or not self.screenshot_thread.isRunning():
            self.screenshot_thread = ScreenshotThread(self.interval, self.output_dir)
            self.screenshot_thread.log_signal.connect(self.add_log)
            self.screenshot_thread.start()

            self.status_label.setText("状态: 正在记录")
            self.start_button.setEnabled(False)
            self.stop_button.setEnabled(True)
            self.settings_button.setEnabled(False)

            self.add_log("截图记录已开始")

    def stop_recording(self):
        """停止截图记录"""
        if self.screenshot_thread and self.screenshot_thread.isRunning():
            self.screenshot_thread.stop()

            self.status_label.setText("状态: 已停止")
            self.start_button.setEnabled(True)
            self.stop_button.setEnabled(False)
            self.settings_button.setEnabled(True)

            self.add_log("截图记录已停止")

    def open_settings(self):
        """打开设置对话框"""
        dialog = SettingsDialog(self, self.interval, self.output_dir)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            settings = dialog.get_settings()
            self.interval = settings["interval"]
            self.output_dir = settings["output_dir"]
            self.update_settings_display()

            # 如果正在运行，重启截图线程以应用新设置
            if self.screenshot_thread and self.screenshot_thread.isRunning():
                self.stop_recording()
                self.start_recording()

            self.add_log("设置已更新")


def main():
    """主函数，启动窗口记录器应用"""
    logging.info("[WindowRecorder] 启动成功")
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    font = QFont("Microsoft YaHei", 11)
    app.setFont(font)

    window_recorder = WindowRecorderApp()
    window_recorder.show()

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
