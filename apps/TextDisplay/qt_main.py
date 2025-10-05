import json
import os
import logging

from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                            QHBoxLayout, QLabel, QLineEdit, QPushButton, 
                            QCheckBox, QComboBox, QSpinBox, QFrame, 
                            QFontComboBox, QColorDialog, QFileDialog, 
                            QMessageBox, QRadioButton, QButtonGroup, QGroupBox)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QFont, QColor

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config.json")

class TextDisplayWindow(QMainWindow):
    """基于PyQt6的文本显示窗口"""
    closed = pyqtSignal()

    def __init__(self):
        super().__init__()
        self.is_fullscreen = False
        self.is_window_fullscreen = False
        self.original_geometry = None
        self.init_ui()
        self.default_settings()
        self.load_text_from_config()

    def init_ui(self):
        """初始化用户界面"""
        self.setWindowTitle("文本显示")
        self.setGeometry(100, 100, 800, 600)

        # 主窗口部件
        self.main_widget = QWidget()
        self.setCentralWidget(self.main_widget)

        # 主布局
        main_layout = QVBoxLayout(self.main_widget)

        # 创建输入区域
        self.create_text_input_area(main_layout)

        # 创建控制面板
        self.create_control_panel(main_layout)

        # 创建显示区域
        self.create_display_area(main_layout)

        # 绑定ESC键事件
        self.setup_shortcuts()

    def create_text_input_area(self, parent_layout):
        """创建文本输入区域"""
        input_group = QGroupBox("文本输入")
        parent_layout.addWidget(input_group)

        input_layout = QVBoxLayout(input_group)

        # 文本输入框
        self.text_input = QLineEdit()
        self.text_input.setPlaceholderText("在这里输入要显示的文本")
        input_layout.addWidget(self.text_input)

        # 更新按钮
        update_btn = QPushButton("更新显示")
        update_btn.clicked.connect(self.update_display)
        input_layout.addWidget(update_btn)

        # 绑定文本变化事件，实时更新显示
        self.text_input.textChanged.connect(lambda: QTimer.singleShot(100, self.update_display))

    def create_control_panel(self, parent_layout):
        """创建控制面板"""
        control_group = QGroupBox("显示设置")
        parent_layout.addWidget(control_group)

        control_layout = QVBoxLayout(control_group)

        # 字体设置
        font_layout = QHBoxLayout()
        control_layout.addLayout(font_layout)

        # 字体选择
        font_layout.addWidget(QLabel("字体:"))
        self.font_family = QFontComboBox()
        self.font_family.setCurrentFont(QFont("Microsoft YaHei"))
        font_layout.addWidget(self.font_family)

        # 字体大小
        font_layout.addWidget(QLabel("大小:"))
        self.font_size = QSpinBox()
        self.font_size.setRange(8, 72)
        self.font_size.setValue(12)
        font_layout.addWidget(self.font_size)

        # 字体样式
        style_layout = QHBoxLayout()
        control_layout.addLayout(style_layout)

        self.bold_check = QCheckBox("粗体")
        style_layout.addWidget(self.bold_check)

        self.italic_check = QCheckBox("斜体")
        style_layout.addWidget(self.italic_check)

        self.underline_check = QCheckBox("下划线")
        style_layout.addWidget(self.underline_check)

        # 颜色设置
        color_layout = QHBoxLayout()
        control_layout.addLayout(color_layout)

        self.text_color = QColor(Qt.GlobalColor.black)
        self.text_color_btn = QPushButton("文字颜色")
        self.text_color_btn.clicked.connect(self.choose_text_color)
        color_layout.addWidget(self.text_color_btn)

        self.bg_color = QColor(Qt.GlobalColor.white)
        self.bg_color_btn = QPushButton("背景颜色")
        self.bg_color_btn.clicked.connect(self.choose_bg_color)
        color_layout.addWidget(self.bg_color_btn)

        # 对齐方式
        align_layout = QHBoxLayout()
        control_layout.addLayout(align_layout)

        align_layout.addWidget(QLabel("对齐方式:"))

        self.alignment_group = QButtonGroup()
        self.left_radio = QRadioButton("左对齐")
        self.left_radio.setChecked(True)
        self.alignment_group.addButton(self.left_radio, 0)
        align_layout.addWidget(self.left_radio)

        self.center_radio = QRadioButton("居中")
        self.alignment_group.addButton(self.center_radio, 1)
        align_layout.addWidget(self.center_radio)

        self.right_radio = QRadioButton("右对齐")
        self.alignment_group.addButton(self.right_radio, 2)
        align_layout.addWidget(self.right_radio)

        # 绑定控件变化事件
        self.font_family.currentFontChanged.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.font_size.valueChanged.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.bold_check.toggled.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.italic_check.toggled.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.underline_check.toggled.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.alignment_group.buttonToggled.connect(lambda: QTimer.singleShot(100, self.update_display))

    def create_display_area(self, parent_layout):
        """创建显示区域"""
        display_group = QGroupBox("文本显示")
        parent_layout.addWidget(display_group)

        display_layout = QVBoxLayout(display_group)

        # 文本显示标签
        self.display_label = QLabel("在这里显示文本")
        self.display_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        self.display_label.setWordWrap(True)
        self.display_label.setStyleSheet("background-color: white; color: black; padding: 10px; border: 1px solid #ccc;")
        display_layout.addWidget(self.display_label)

        # 按钮区域
        button_layout = QHBoxLayout()
        display_layout.addLayout(button_layout)

        # 全屏按钮
        self.fullscreen_btn = QPushButton("全屏显示")
        self.fullscreen_btn.clicked.connect(self.toggle_fullscreen)
        button_layout.addWidget(self.fullscreen_btn)

        # 窗口内全屏按钮
        self.window_fullscreen_btn = QPushButton("窗口内全屏")
        self.window_fullscreen_btn.clicked.connect(self.toggle_window_fullscreen)
        button_layout.addWidget(self.window_fullscreen_btn)

    def setup_shortcuts(self):
        """设置快捷键"""
        # ESC键退出全屏
        self.shortcut_exit = Qt.Key.Key_Escape

    def keyPressEvent(self, event):
        """处理按键事件"""
        if event.key() == Qt.Key.Key_Escape:
            self.exit_fullscreen()
        elif event.key() == Qt.Key.Key_F11:
            self.toggle_fullscreen()

    def default_settings(self):
        """设置默认值"""
        self.font_family.setCurrentFont(QFont("Microsoft YaHei"))
        self.font_size.setValue(12)
        self.bold_check.setChecked(False)
        self.italic_check.setChecked(False)
        self.underline_check.setChecked(False)
        self.text_color = QColor(Qt.GlobalColor.black)
        self.bg_color = QColor(Qt.GlobalColor.white)
        self.left_radio.setChecked(True)
        self.update_display()

    def update_display(self):
        """更新显示区域的文本和样式"""
        text = self.text_input.text()
        if not text:
            text = "在这里显示文本"

        # 创建字体
        font = self.font_family.currentFont()
        font.setPointSize(self.font_size.value())
        font.setBold(self.bold_check.isChecked())
        font.setItalic(self.italic_check.isChecked())
        font.setUnderline(self.underline_check.isChecked())

        # 获取对齐方式
        if self.left_radio.isChecked():
            alignment = Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter
        elif self.center_radio.isChecked():
            alignment = Qt.AlignmentFlag.AlignCenter | Qt.AlignmentFlag.AlignVCenter
        else:
            alignment = Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter

        # 应用样式
        self.display_label.setText(text)
        self.display_label.setFont(font)
        self.display_label.setAlignment(alignment)
        self.display_label.setStyleSheet(f"background-color: {self.bg_color.name()}; color: {self.text_color.name()}; padding: 10px; border: 1px solid #ccc;")

        # 保存文本内容到config.json
        self.save_text_to_config()

    def choose_text_color(self):
        """选择文字颜色"""
        color = QColorDialog.getColor(self.text_color, self, "选择文字颜色")
        if color.isValid():
            self.text_color = color
            self.update_display()

    def choose_bg_color(self):
        """选择背景颜色"""
        color = QColorDialog.getColor(self.bg_color, self, "选择背景颜色")
        if color.isValid():
            self.bg_color = color
            self.update_display()

    def toggle_fullscreen(self):
        """切换全屏显示模式"""
        if not self.is_fullscreen:
            # 保存当前窗口状态
            self.original_geometry = self.geometry()

            # 进入全屏模式
            self.showFullScreen()
            self.is_fullscreen = True

            # 隐藏输入区域和控制面板
            input_group = self.findChild(QGroupBox, "文本输入")
            if input_group:
                input_group.hide()
            control_group = self.findChild(QGroupBox, "显示设置")
            if control_group:
                control_group.hide()

            # 调整显示区域
            display_group = self.findChild(QGroupBox, "文本显示")
            if display_group:
                display_group.setTitle("")

            # 隐藏全屏按钮和窗口内全屏按钮
            if hasattr(self, 'fullscreen_btn'):
                self.fullscreen_btn.hide()
            if hasattr(self, 'window_fullscreen_btn'):
                self.window_fullscreen_btn.hide()

            # 添加退出全屏按钮
            self.exit_btn = QPushButton("退出全屏 (ESC)")
            self.exit_btn.clicked.connect(self.exit_fullscreen)
            self.exit_btn.setParent(self)
            self.exit_btn.move(self.width() - self.exit_btn.width() - 10, 10)
            self.exit_btn.show()

            # 更新显示
            self.update_display()
        else:
            self.exit_fullscreen()

    def toggle_window_fullscreen(self):
        """切换窗口内全屏显示模式"""
        if not self.is_window_fullscreen:
            # 保存当前状态
            self.is_window_fullscreen = True

            # 隐藏输入区域和控制面板
            input_group = self.findChild(QGroupBox, "文本输入")
            if input_group:
                input_group.hide()
            control_group = self.findChild(QGroupBox, "显示设置")
            if control_group:
                control_group.hide()

            # 调整显示区域
            display_group = self.findChild(QGroupBox, "文本显示")
            if display_group:
                display_group.setTitle("")

            # 隐藏全屏按钮和窗口内全屏按钮
            if hasattr(self, 'fullscreen_btn'):
                self.fullscreen_btn.hide()
            if hasattr(self, 'window_fullscreen_btn'):
                self.window_fullscreen_btn.hide()

            # 添加退出全屏按钮
            self.exit_btn = QPushButton("退出全屏 (ESC)")
            self.exit_btn.clicked.connect(self.exit_window_fullscreen)
            self.exit_btn.setParent(self.centralWidget())
            self.exit_btn.move(self.centralWidget().width() - self.exit_btn.width() - 10, 10)
            self.exit_btn.show()

            # 更新显示
            self.update_display()
        else:
            self.exit_window_fullscreen()

    def exit_fullscreen(self):
        """退出全屏显示模式"""
        if self.is_fullscreen:
            # 退出全屏模式
            self.showNormal()
            self.is_fullscreen = False

            # 恢复窗口大小
            if self.original_geometry:
                self.setGeometry(self.original_geometry)

            # 恢复界面
            self.restore_ui()

            # 移除退出全屏按钮
            if hasattr(self, 'exit_btn'):
                self.exit_btn.hide()
                self.exit_btn.deleteLater()

        elif self.is_window_fullscreen:
            self.exit_window_fullscreen()

    def exit_window_fullscreen(self):
        """退出窗口内全屏显示模式"""
        if self.is_window_fullscreen:
            self.is_window_fullscreen = False

            # 恢复界面
            self.restore_ui()

            # 移除退出全屏按钮
            if hasattr(self, 'exit_btn'):
                self.exit_btn.hide()
                self.exit_btn.deleteLater()

    def restore_ui(self):
        """恢复用户界面"""
        # 恢复输入区域和控制面板
        input_group = self.findChild(QGroupBox, "文本输入")
        if input_group:
            input_group.show()
        control_group = self.findChild(QGroupBox, "显示设置")
        if control_group:
            control_group.show()

        # 恢复显示区域标题
        display_group = self.findChild(QGroupBox, "文本显示")
        if display_group:
            display_group.setTitle("文本显示")

        # 显示全屏按钮和窗口内全屏按钮
        if hasattr(self, 'fullscreen_btn'):
            self.fullscreen_btn.show()
        if hasattr(self, 'window_fullscreen_btn'):
            self.window_fullscreen_btn.show()

        # 更新显示
        self.update_display()

    def load_text_from_config(self):
        """从config.json加载文本内容和设置"""
        try:
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, "r", encoding="utf-8") as file:
                    config = json.load(file)

                # 获取TextDisplay应用的配置
                if "apps" in config and "TextDisplay" in config["apps"]:
                    app_config = config["apps"]["TextDisplay"]["config"]

                    # 加载文本内容
                    text_content = app_config.get("content", "")
                    if text_content:
                        self.text_input.setText(text_content)

                    # 加载字体设置
                    font_family = app_config.get("font_family", "Microsoft YaHei")
                    self.font_family.setCurrentFont(QFont(font_family))

                    font_size = app_config.get("font_size", 12)
                    self.font_size.setValue(font_size)

                    # 加载字体样式
                    self.bold_check.setChecked(app_config.get("bold", False))
                    self.italic_check.setChecked(app_config.get("italic", False))
                    self.underline_check.setChecked(app_config.get("underline", False))

                    # 加载颜色设置
                    text_color = app_config.get("text_color", "#000000")
                    self.text_color = QColor(text_color)

                    bg_color = app_config.get("bg_color", "#FFFFFF")
                    self.bg_color = QColor(bg_color)

                    # 加载对齐方式
                    alignment = app_config.get("alignment", "left")
                    if alignment == "center":
                        self.center_radio.setChecked(True)
                    elif alignment == "right":
                        self.right_radio.setChecked(True)
                    else:
                        self.left_radio.setChecked(True)

                    # 更新显示
                    self.update_display()
        except Exception as e:
            logging.error(f"加载配置失败: {e}")

    def save_text_to_config(self):
        """保存所有设置到config.json"""
        try:
            logging.info("[TextDisplay] 开始保存配置到主配置文件")
            with open(CONFIG_PATH, "r", encoding="utf-8") as file:
                config = json.load(file)

            # 确保TextDisplay应用配置存在
            if "apps" not in config:
                config["apps"] = {}
                logging.warning("[TextDisplay] 配置文件中缺少apps节点，已创建")

            if "TextDisplay" not in config["apps"]:
                config["apps"]["TextDisplay"] = {"name": "大字显示", "icon": "📄", "enabled": True, "position": 2, "config": {}}
                logging.warning("[TextDisplay] 配置文件中缺少TextDisplay节点，已创建")

            if "config" not in config["apps"]["TextDisplay"]:
                config["apps"]["TextDisplay"]["config"] = {}
                logging.warning("[TextDisplay] TextDisplay配置中缺少config节点，已创建")

            # 获取当前设置
            text_content = self.text_input.text()

            # 获取对齐方式
            if self.left_radio.isChecked():
                alignment = "left"
            elif self.center_radio.isChecked():
                alignment = "center"
            else:
                alignment = "right"

            # 更新配置
            config["apps"]["TextDisplay"]["config"].update({
                "content": text_content,
                "font_family": self.font_family.currentFont().family(),
                "font_size": self.font_size.value(),
                "bold": self.bold_check.isChecked(),
                "italic": self.italic_check.isChecked(),
                "underline": self.underline_check.isChecked(),
                "text_color": self.text_color.name(),
                "bg_color": self.bg_color.name(),
                "alignment": alignment
            })

            logging.info(f"[TextDisplay] 保存配置: 字体={self.font_family.currentFont().family()}, 大小={self.font_size.value()}, "
                        f"粗体={self.bold_check.isChecked()}, 斜体={self.italic_check.isChecked()}, 下划线={self.underline_check.isChecked()}, "
                        f"文字颜色={self.text_color.name()}, 背景颜色={self.bg_color.name()}, 对齐方式={alignment}")

            with open(CONFIG_PATH, "w", encoding="utf-8") as file:
                json.dump(config, file, ensure_ascii=False, indent=4)

            logging.info("[TextDisplay] 配置已成功保存到主配置文件")
        except Exception as e:
            logging.error(f"[TextDisplay] 保存配置失败: {e}")

    def closeEvent(self, event):
        """窗口关闭事件"""
        self.save_text_to_config()
        self.closed.emit()
        event.accept()


# 主函数
def main():
    """主函数"""
    app = QApplication.instance()
    if app is None:
        app = QApplication([])

    window = TextDisplayWindow()
    window.show()

    return window
