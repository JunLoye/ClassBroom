import json
import os
import logging
import sys

from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                            QHBoxLayout, QLabel, QLineEdit, QPushButton, 
                            QCheckBox, QSpinBox, QFontComboBox, QColorDialog, QRadioButton, QButtonGroup, QGroupBox)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QFont, QColor


CONFIG_PATH = 'config.json'

class TextDisplayWindow(QMainWindow):
    closed = pyqtSignal()

    def __init__(self):
        super().__init__()
        logging.debug("[TextDisplay] 初始化窗口实例。")
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        self.is_fullscreen = False
        self.is_window_fullscreen = False
        self.is_text_fullscreen = False
        self.original_geometry = None
        self.original_margins = {}
        self.display_label_parent_layout = None
        self.init_ui()
        self.default_settings()
        self.load_text_from_config()
        logging.info("[TextDisplay] 窗口初始化完成。")

    def init_ui(self):
        logging.debug("[TextDisplay] 初始化用户界面。")
        self.setWindowTitle("文本显示")
        self.setGeometry(100, 100, 800, 600)

        self.main_widget = QWidget()
        self.setCentralWidget(self.main_widget)

        main_layout = QVBoxLayout(self.main_widget)

        self.create_text_input_area(main_layout)
        self.create_control_panel(main_layout)
        self.create_display_area(main_layout)

        self.setup_shortcuts()
        logging.debug("[TextDisplay] 用户界面设置完成。")

    def create_text_input_area(self, parent_layout):
        logging.debug("[TextDisplay] 创建文本输入区域。")
        self.input_group = QGroupBox("文本输入")
        parent_layout.addWidget(self.input_group)

        input_layout = QVBoxLayout(self.input_group)

        self.text_input = QLineEdit()
        self.text_input.setPlaceholderText("在这里输入要显示的文本")
        input_layout.addWidget(self.text_input)

        self.text_input.textChanged.connect(lambda: QTimer.singleShot(100, self.update_display))
        logging.debug("[TextDisplay] 文本输入区域创建完成。")

    def create_control_panel(self, parent_layout):
        logging.debug("[TextDisplay] 创建控制面板。")
        self.control_group = QGroupBox("显示设置")
        parent_layout.addWidget(self.control_group)

        control_layout = QVBoxLayout(self.control_group)

        font_layout = QHBoxLayout()
        control_layout.addLayout(font_layout)

        font_layout.addWidget(QLabel("字体:"))
        self.font_family = QFontComboBox()
        self.font_family.setCurrentFont(QFont("Microsoft YaHei"))
        font_layout.addWidget(self.font_family)

        font_layout.addWidget(QLabel("大小:"))
        self.font_size = QSpinBox()
        self.font_size.setRange(4, 144)
        self.font_size.setValue(12)
        font_layout.addWidget(self.font_size)

        style_layout = QHBoxLayout()
        control_layout.addLayout(style_layout)

        self.bold_check = QCheckBox("粗体")
        style_layout.addWidget(self.bold_check)

        self.italic_check = QCheckBox("斜体")
        style_layout.addWidget(self.italic_check)

        self.underline_check = QCheckBox("下划线")
        style_layout.addWidget(self.underline_check)

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

        align_layout = QHBoxLayout()
        control_layout.addLayout(align_layout)

        align_layout.addWidget(QLabel("水平对齐方式:"))

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

        
        vertical_align_layout = QHBoxLayout()
        control_layout.addLayout(vertical_align_layout)

        vertical_align_layout.addWidget(QLabel("垂直对齐方式:"))

        self.vertical_alignment_group = QButtonGroup()
        self.v_top_radio = QRadioButton("顶部对齐")
        self.vertical_alignment_group.addButton(self.v_top_radio, 0)
        vertical_align_layout.addWidget(self.v_top_radio)
        
        self.v_center_radio = QRadioButton("居中对齐")
        self.v_center_radio.setChecked(True) 
        self.vertical_alignment_group.addButton(self.v_center_radio, 1)
        vertical_align_layout.addWidget(self.v_center_radio)

        self.v_bottom_radio = QRadioButton("底部对齐")
        self.vertical_alignment_group.addButton(self.v_bottom_radio, 2)
        vertical_align_layout.addWidget(self.v_bottom_radio)

        self.font_family.currentFontChanged.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.font_size.valueChanged.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.bold_check.toggled.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.italic_check.toggled.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.underline_check.toggled.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.alignment_group.buttonToggled.connect(lambda: QTimer.singleShot(100, self.update_display))
        self.vertical_alignment_group.buttonToggled.connect(lambda: QTimer.singleShot(100, self.update_display)) 
        logging.debug("[TextDisplay] 控制面板创建完成。")

    def create_display_area(self, parent_layout):
        logging.debug("[TextDisplay] 创建显示区域。")
        self.display_group = QGroupBox("文本显示")
        parent_layout.addWidget(self.display_group)

        display_layout = QVBoxLayout(self.display_group)

        self.display_label = QLabel("在这里显示文本")
        self.display_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        self.display_label.setWordWrap(True)
        self.display_label.setStyleSheet("background-color: white; color: black; padding: 10px; border: 1px solid #ccc;")
        display_layout.addWidget(self.display_label)
        
        
        self.fullscreen_buttons_layout = QHBoxLayout() 
        display_layout.addLayout(self.fullscreen_buttons_layout)

        
        window_fullscreen_btn = QPushButton("窗口内全屏 (F11)")
        window_fullscreen_btn.clicked.connect(self.toggle_window_fullscreen)
        self.fullscreen_buttons_layout.addWidget(window_fullscreen_btn)

        
        text_fullscreen_btn = QPushButton("文本全屏 (F12)")
        text_fullscreen_btn.clicked.connect(self.toggle_text_fullscreen)
        self.fullscreen_buttons_layout.addWidget(text_fullscreen_btn)
        logging.debug("[TextDisplay] 显示区域创建完成。")

    def setup_shortcuts(self):
        logging.debug("[TextDisplay] 设置快捷键。")
        self.shortcut_exit = Qt.Key.Key_Escape
        
        logging.debug("[TextDisplay] 快捷键设置完成。")

    def keyPressEvent(self, event):
        logging.debug(f"[TextDisplay] 捕获到按键事件: {event.key()}")
        if event.key() == Qt.Key.Key_Escape:
            self.exit_fullscreen()
            logging.info("[TextDisplay] 按下 ESC 键，尝试退出全屏。")
        elif event.key() == Qt.Key.Key_F11: 
            self.toggle_window_fullscreen()
            logging.info("[TextDisplay] 按下 F11 键，尝试切换窗口内全屏。")
        elif event.key() == Qt.Key.Key_F12: 
            self.toggle_text_fullscreen()
            logging.info("[TextDisplay] 按下 F12 键，尝试切换文本全屏。")
        else:
            super().keyPressEvent(event)

    def default_settings(self):
        logging.debug("[TextDisplay] 应用默认设置。")
        self.font_family.setCurrentFont(QFont("Microsoft YaHei"))
        self.font_size.setValue(12)
        self.bold_check.setChecked(False)
        self.italic_check.setChecked(False)
        self.underline_check.setChecked(False)
        self.text_color = QColor(Qt.GlobalColor.black)
        self.bg_color = QColor(Qt.GlobalColor.white)
        self.left_radio.setChecked(True)
        self.v_center_radio.setChecked(True) 
        self.update_display()
        logging.info("[TextDisplay] 默认设置已应用。")

    def update_display(self):
        logging.debug("[TextDisplay] 更新显示文本和样式。")
        text = self.text_input.text()
        if not text:
            text = "在这里显示文本"
            logging.debug("[TextDisplay] 文本输入为空，使用默认占位符文本。")

        font = self.font_family.currentFont()
        font.setPointSize(self.font_size.value())
        font.setBold(self.bold_check.isChecked())
        font.setItalic(self.italic_check.isChecked())
        font.setUnderline(self.underline_check.isChecked())
        logging.debug(f"[TextDisplay] 字体设置 - 家族: {font.family()}, 大小: {font.pointSize()}, 粗体: {font.bold()}, 斜体: {font.italic()}, 下划线: {font.underline()}")

        
        h_alignment = Qt.AlignmentFlag.AlignLeft
        if self.left_radio.isChecked():
            h_alignment = Qt.AlignmentFlag.AlignLeft
            logging.debug("[TextDisplay] 水平对齐方式设置为左对齐。")
        elif self.center_radio.isChecked():
            h_alignment = Qt.AlignmentFlag.AlignCenter
            logging.debug("[TextDisplay] 水平对齐方式设置为居中。")
        else: 
            h_alignment = Qt.AlignmentFlag.AlignRight
            logging.debug("[TextDisplay] 水平对齐方式设置为右对齐。")

        
        v_alignment = Qt.AlignmentFlag.AlignVCenter
        if self.v_top_radio.isChecked():
            v_alignment = Qt.AlignmentFlag.AlignTop
            logging.debug("[TextDisplay] 垂直对齐方式设置为顶部对齐。")
        elif self.v_center_radio.isChecked():
            v_alignment = Qt.AlignmentFlag.AlignVCenter
            logging.debug("[TextDisplay] 垂直对齐方式设置为居中对齐。")
        else: 
            v_alignment = Qt.AlignmentFlag.AlignBottom
            logging.debug("[TextDisplay] 垂直对齐方式设置为底部对齐。")

        self.display_label.setText(text)
        self.display_label.setFont(font)
        self.display_label.setAlignment(h_alignment | v_alignment) 
        
        
        if self.is_window_fullscreen:
            style_sheet = f"background-color: {self.bg_color.name()}; color: {self.text_color.name()}; padding: 0px; border: none;"
            logging.debug("[TextDisplay] 窗口内全屏模式下应用无边框样式。")
        else:
            style_sheet = f"background-color: {self.bg_color.name()}; color: {self.text_color.name()}; padding: 10px; border: 1px solid #ccc;"
            logging.debug("[TextDisplay] 非窗口内全屏模式下应用默认边框样式。")
        self.display_label.setStyleSheet(style_sheet)
        logging.debug(f"[TextDisplay] 显示标签样式更新为: {style_sheet}")


    def choose_text_color(self):
        logging.debug("[TextDisplay] 打开文字颜色选择器。")
        color = QColorDialog.getColor(self.text_color, self, "选择文字颜色")
        if color.isValid():
            self.text_color = color
            self.update_display()
            logging.info(f"[TextDisplay] 文字颜色已更改为: {self.text_color.name()}")
        else:
            logging.debug("[TextDisplay] 文字颜色选择器被取消。")

    def choose_bg_color(self):
        logging.debug("[TextDisplay] 打开背景颜色选择器。")
        color = QColorDialog.getColor(self.bg_color, self, "选择背景颜色")
        if color.isValid():
            self.bg_color = color
            self.update_display()
            logging.info(f"[TextDisplay] 背景颜色已更改为: {self.bg_color.name()}")
        else:
            logging.debug("[TextDisplay] 背景颜色选择器被取消。")

    def toggle_fullscreen(self):
        logging.info("[TextDisplay] 尝试切换传统全屏模式。")
        if not self.is_fullscreen:
            self.original_geometry = self.geometry()
            logging.debug(f"[TextDisplay] 保存原始窗口几何信息: {self.original_geometry}")

            self.showFullScreen()
            self.is_fullscreen = True
            logging.info("[TextDisplay] 进入传统全屏模式。")

            if self.input_group:
                self.input_group.hide()
                logging.debug("[TextDisplay] 隐藏输入组。")
            if self.control_group:
                self.control_group.hide()
                logging.debug("[TextDisplay] 隐藏控制组。")

            if self.display_group:
                self.display_group.setTitle("")
                logging.debug("[TextDisplay] 清空显示组标题。")

            self.exit_btn = QPushButton("退出全屏 (ESC)")
            self.exit_btn.clicked.connect(self.exit_fullscreen)
            self.exit_btn.setParent(self)
            self.exit_btn.move(self.width() - self.exit_btn.width() - 10, 10)
            self.exit_btn.show()
            logging.debug("[TextDisplay] 显示退出全屏按钮。")

            self.update_display()
        else:
            self.exit_fullscreen()

    def toggle_window_fullscreen(self):
        logging.info("[TextDisplay] 尝试切换窗口内全屏模式。")
        if not self.is_window_fullscreen:
            self.is_window_fullscreen = True
            logging.info("[TextDisplay] 进入窗口内全屏模式。")

            main_layout = self.main_widget.layout()
            self.original_margins['main_layout'] = main_layout.contentsMargins()
            main_layout.setContentsMargins(0, 0, 0, 0)
            logging.debug(f"[TextDisplay] 保存主布局边距并设置为0。")

            if self.input_group:
                self.input_group.hide()
                logging.debug("[TextDisplay] 隐藏输入组。")
            if self.control_group:
                self.control_group.hide()
                logging.debug("[TextDisplay] 隐藏控制组。")

            if self.display_group:
                self.display_group.hide()
                self.display_label_parent_layout = self.display_group.layout()
                main_layout.addWidget(self.display_label)
                logging.debug("[TextDisplay] 隐藏显示组，并将显示标签直接添加到主布局。")

            self.update_display()

            self.exit_btn = QPushButton("退出窗口内全屏 (ESC/F11)")
            self.exit_btn.clicked.connect(self.exit_window_fullscreen)
            self.exit_btn.setParent(self.centralWidget())
            self.exit_btn.setStyleSheet("padding: 5px 10px;")
            self.exit_btn.adjustSize()
            self.exit_btn.move(self.centralWidget().width() - self.exit_btn.width() - 20, 20)
            self.exit_btn.show()
            logging.debug("[TextDisplay] 显示退出窗口内全屏按钮。")

        else:
            self.exit_window_fullscreen()

    def exit_fullscreen(self):
        logging.info("[TextDisplay] 尝试退出传统全屏模式。")
        if self.is_fullscreen:
            self.showNormal()
            self.is_fullscreen = False
            logging.info("[TextDisplay] 退出传统全屏模式。")

            if self.original_geometry:
                self.setGeometry(self.original_geometry)
                logging.debug("[TextDisplay] 恢复原始窗口几何信息。")

            self.restore_ui()

            if hasattr(self, 'exit_btn'):
                self.exit_btn.hide()
                self.exit_btn.deleteLater()
                logging.debug("[TextDisplay] 隐藏并删除退出全屏按钮。")

    def exit_window_fullscreen(self):
        logging.info("[TextDisplay] 尝试退出窗口内全屏模式。")
        if self.is_window_fullscreen:
            self.is_window_fullscreen = False
            logging.info("[TextDisplay] 退出窗口内全屏模式。")

            self.restore_ui()

            if hasattr(self, 'exit_btn'):
                self.exit_btn.hide()
                self.exit_btn.deleteLater()
                logging.debug("[TextDisplay] 隐藏并删除退出窗口内全屏按钮。")

    def restore_ui(self):
        logging.debug("[TextDisplay] 恢复用户界面布局和可见性。")
        main_layout = self.main_widget.layout()
        if 'main_layout' in self.original_margins:
            main_layout.setContentsMargins(self.original_margins['main_layout'])
            logging.debug("[TextDisplay] 恢复主布局边距。")

        if self.display_label_parent_layout:
            main_layout.removeWidget(self.display_label)
            self.display_label_parent_layout.insertWidget(0, self.display_label)
            self.display_label_parent_layout = None
            logging.debug("[TextDisplay] 将显示标签恢复到其原始父布局。")

        if self.input_group:
            self.input_group.show()
            logging.debug("[TextDisplay] 显示输入组。")
        if self.control_group:
            self.control_group.show()
            logging.debug("[TextDisplay] 显示控制组。")

        if self.display_group:
            self.display_group.show()
            logging.debug("[TextDisplay] 显示显示组。")

        self.update_display()
        logging.debug("[TextDisplay] UI恢复完成，更新显示。")
        
    def toggle_text_fullscreen(self):
        logging.info("[TextDisplay] 尝试切换文本全屏模式。")
        if not self.is_text_fullscreen:
            self.is_text_fullscreen = True
            logging.info("[TextDisplay] 进入文本全屏模式。")
            
            self.text_fullscreen_window = QMainWindow()
            self.text_fullscreen_window.showFullScreen()
            
            text_label = QLabel(self.display_label.text())
            text_label.setFont(self.display_label.font())
            text_label.setAlignment(self.display_label.alignment())
            text_label.setStyleSheet(f"background-color: {self.bg_color.name()}; color: {self.text_color.name()};")
            text_label.setWordWrap(True)
            logging.debug("[TextDisplay] 创建文本全屏标签并应用样式。")
            
            self.text_fullscreen_window.setCentralWidget(text_label)
            
            exit_btn = QPushButton("退出文本全屏 (ESC/F12)")
            exit_btn.clicked.connect(self.exit_text_fullscreen)
            exit_btn.setParent(self.text_fullscreen_window)
            exit_btn.setStyleSheet("padding: 5px 10px;")
            exit_btn.adjustSize()
            exit_btn.move(self.text_fullscreen_window.width() - exit_btn.width() - 20, 20)
            exit_btn.show()
            logging.debug("[TextDisplay] 显示退出文本全屏按钮。")
            
            self.text_fullscreen_window.resizeEvent = self.text_fullscreen_resize_event
            
            self.text_fullscreen_window.keyPressEvent = self.text_fullscreen_keyPressEvent
        else:
            self.exit_text_fullscreen()
            
    def text_fullscreen_keyPressEvent(self, event):
        logging.debug(f"[TextDisplay] 文本全屏窗口捕获到按键事件: {event.key()}")
        if event.key() == Qt.Key.Key_Escape or event.key() == Qt.Key.Key_F12:
            self.exit_text_fullscreen()
            logging.info("[TextDisplay] 文本全屏模式下按下 ESC/F12 键，尝试退出。")
            
    def text_fullscreen_resize_event(self, event):
        logging.debug("[TextDisplay] 文本全屏窗口大小调整事件。")
        if hasattr(self, "text_fullscreen_window") and hasattr(self.text_fullscreen_window, "findChild"):
            exit_btn = self.text_fullscreen_window.findChild(QPushButton)
            if exit_btn:
                exit_btn.move(self.text_fullscreen_window.width() - exit_btn.width() - 20, 20)
                logging.debug("[TextDisplay] 调整文本全屏退出按钮位置。")
            
    def exit_text_fullscreen(self):
        logging.info("[TextDisplay] 尝试退出文本全屏模式。")
        if self.is_text_fullscreen:
            self.is_text_fullscreen = False
            logging.info("[TextDisplay] 退出文本全屏模式。")
            
            if hasattr(self, 'text_fullscreen_window'):
                self.text_fullscreen_window.close()
                del self.text_fullscreen_window
                logging.debug("[TextDisplay] 关闭并删除文本全屏窗口。")

    def load_text_from_config(self):
        logging.info("[TextDisplay] 尝试从配置文件加载设置。")
        try:
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, "r", encoding="utf-8") as file:
                    config = json.load(file)
                logging.debug(f"[TextDisplay] 配置文件 '{CONFIG_PATH}' 已加载。")

                td_config = config.get("apps", {}).get("TextDisplay", {})
                logging.debug(f"[TextDisplay] 获取 TextDisplay 配置: {td_config}")

                self.text_input.setText(td_config.get("content", ""))
                logging.debug(f"[TextDisplay] 加载文本内容: '{td_config.get('content', '')}'")

                if "font_family" in td_config:
                    self.font_family.setCurrentFont(QFont(td_config["font_family"]))
                    logging.debug(f"[TextDisplay] 加载字体家族: {td_config['font_family']}")
                if "font_size" in td_config:
                    self.font_size.setValue(td_config["font_size"])
                    logging.debug(f"[TextDisplay] 加载字体大小: {td_config['font_size']}")
                if "bold" in td_config:
                    self.bold_check.setChecked(td_config["bold"])
                    logging.debug(f"[TextDisplay] 加载粗体设置: {td_config['bold']}")
                if "italic" in td_config:
                    self.italic_check.setChecked(td_config["italic"])
                    logging.debug(f"[TextDisplay] 加载斜体设置: {td_config['italic']}")
                if "underline" in td_config:
                    self.underline_check.setChecked(td_config["underline"])
                    logging.debug(f"[TextDisplay] 加载下划线设置: {td_config['underline']}")

                if "text_color" in td_config:
                    self.text_color = QColor(td_config["text_color"])
                    logging.debug(f"[TextDisplay] 加载文字颜色: {td_config['text_color']}")
                if "bg_color" in td_config:
                    self.bg_color = QColor(td_config["bg_color"])
                    logging.debug(f"[TextDisplay] 加载背景颜色: {td_config['bg_color']}")

                h_alignment = td_config.get("horizontal_alignment")
                if h_alignment == "center":
                    self.center_radio.setChecked(True)
                elif h_alignment == "right":
                    self.right_radio.setChecked(True)
                else:
                    self.left_radio.setChecked(True)
                logging.debug(f"[TextDisplay] 加载水平对齐方式: {h_alignment}")

                v_alignment = td_config.get("vertical_alignment")
                if v_alignment == "top":
                    self.v_top_radio.setChecked(True)
                elif v_alignment == "bottom":
                    self.v_bottom_radio.setChecked(True)
                else:
                    self.v_center_radio.setChecked(True)
                logging.debug(f"[TextDisplay] 加载垂直对齐方式: {v_alignment}")

                self.update_display()
                logging.info("[TextDisplay] 配置加载成功并更新显示。")
            else:
                logging.info(f"[TextDisplay] 配置文件 '{CONFIG_PATH}' 不存在，跳过加载。")
        except Exception as e:
            logging.exception(f"[TextDisplay] 加载配置失败: {e}") 

    def save_text_to_config(self):
        try:
            logging.info("[TextDisplay] 开始保存配置。")
            
            config = {}
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, "r", encoding="utf-8") as file:
                    config = json.load(file)
                logging.debug(f"[TextDisplay] 配置文件 '{CONFIG_PATH}' 已加载以进行更新。")

            text_display_config = config.setdefault("apps", {}).setdefault("TextDisplay", {})

            text_content = self.text_input.text()

            
            h_alignment_str = "left"
            if self.left_radio.isChecked():
                h_alignment_str = "left"
            elif self.center_radio.isChecked():
                h_alignment_str = "center"
            else: 
                h_alignment_str = "right"
            logging.debug(f"[TextDisplay] 保存水平对齐方式: {h_alignment_str}")
            
            
            v_alignment_str = "center"
            if self.v_top_radio.isChecked():
                v_alignment_str = "top"
            elif self.v_center_radio.isChecked():
                v_alignment_str = "center"
            else: 
                v_alignment_str = "bottom"
            logging.debug(f"[TextDisplay] 保存垂直对齐方式: {v_alignment_str}")
                
            temp_update = {
                "content": text_content,
                "font_family": self.font_family.currentFont().family(),
                "font_size": self.font_size.value(),
                "bold": self.bold_check.isChecked(),
                "italic": self.italic_check.isChecked(),
                "underline": self.underline_check.isChecked(),
                "text_color": self.text_color.name(),
                "bg_color": self.bg_color.name(),
                "horizontal_alignment": h_alignment_str, 
                "vertical_alignment": v_alignment_str 
            }
            logging.debug(f"[TextDisplay] 准备保存的配置数据: {temp_update}")
            
            text_display_config.update(temp_update)

            with open(CONFIG_PATH, "w", encoding="utf-8") as file:
                json.dump(config, file, indent=4, ensure_ascii=False)

            logging.info("[TextDisplay] 保存配置成功。")
            
        except Exception as e:
            logging.exception(f"[TextDisplay] 保存配置失败: {e}") 

    def closeEvent(self, event):
        logging.info("[TextDisplay] 捕获到关闭事件，保存配置。")
        self.save_text_to_config()
        self.closed.emit()
        event.accept()
        logging.info("[TextDisplay] 窗口已关闭。")

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self.is_window_fullscreen and hasattr(self, 'exit_btn') and self.exit_btn.isVisible():
            self.exit_btn.move(self.centralWidget().width() - self.exit_btn.width() - 20, 20)
            logging.debug("[TextDisplay] 窗口内全屏模式下调整退出按钮位置。")

def start_app(parent=None):
    logging.info("TextDisplayApp: 启动 TextDisplay 应用程序。")
    window = TextDisplayWindow()
    return window

if __name__ == '__main__':
    
    logging.info("TextDisplayApp: 在独立模式下启动应用程序。")
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
        logging.debug("TextDisplayApp: 创建新的 QApplication 实例。")
    
    app.setQuitOnLastWindowClosed(True)
    
    window = start_app() 
    window.show()
    sys.exit(app.exec())
    logging.info("TextDisplayApp: 应用程序已退出。")