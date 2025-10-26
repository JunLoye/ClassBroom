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

    def init_ui(self):
        self.setWindowTitle("文本显示")
        self.setGeometry(100, 100, 800, 600)

        self.main_widget = QWidget()
        self.setCentralWidget(self.main_widget)

        main_layout = QVBoxLayout(self.main_widget)

        self.create_text_input_area(main_layout)
        self.create_control_panel(main_layout)
        self.create_display_area(main_layout)

        self.setup_shortcuts()

    def create_text_input_area(self, parent_layout):
        self.input_group = QGroupBox("文本输入")
        parent_layout.addWidget(self.input_group)

        input_layout = QVBoxLayout(self.input_group)

        self.text_input = QLineEdit()
        self.text_input.setPlaceholderText("在这里输入要显示的文本")
        input_layout.addWidget(self.text_input)

        self.text_input.textChanged.connect(lambda: QTimer.singleShot(100, self.update_display))

    def create_control_panel(self, parent_layout):
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
        self.font_size.setRange(8, 72)
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

        # Horizontal Alignment
        align_layout = QHBoxLayout()
        control_layout.addLayout(align_layout)

        align_layout.addWidget(QLabel("水平对齐方式:")) # Changed label text

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

        # Vertical Alignment
        vertical_align_layout = QHBoxLayout()
        control_layout.addLayout(vertical_align_layout)

        vertical_align_layout.addWidget(QLabel("垂直对齐方式:"))

        self.vertical_alignment_group = QButtonGroup()
        self.v_top_radio = QRadioButton("顶部对齐")
        self.vertical_alignment_group.addButton(self.v_top_radio, 0)
        vertical_align_layout.addWidget(self.v_top_radio)
        
        self.v_center_radio = QRadioButton("居中对齐")
        self.v_center_radio.setChecked(True) # Default vertical alignment
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
        self.vertical_alignment_group.buttonToggled.connect(lambda: QTimer.singleShot(100, self.update_display)) # Connect new group

    def create_display_area(self, parent_layout):
        self.display_group = QGroupBox("文本显示")
        parent_layout.addWidget(self.display_group)

        display_layout = QVBoxLayout(self.display_group)

        self.display_label = QLabel("在这里显示文本")
        self.display_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        self.display_label.setWordWrap(True)
        self.display_label.setStyleSheet("background-color: white; color: black; padding: 10px; border: 1px solid #ccc;")
        display_layout.addWidget(self.display_label)
        
        # 添加一个用于全屏按钮的布局
        self.fullscreen_buttons_layout = QHBoxLayout() # 保存布局的引用
        display_layout.addLayout(self.fullscreen_buttons_layout)

        # 添加窗口内全屏按钮
        window_fullscreen_btn = QPushButton("窗口内全屏 (F11)")
        window_fullscreen_btn.clicked.connect(self.toggle_window_fullscreen)
        self.fullscreen_buttons_layout.addWidget(window_fullscreen_btn)

        # 修改文本全屏按钮的文本以显示新的快捷键
        text_fullscreen_btn = QPushButton("文本全屏 (F12)")
        text_fullscreen_btn.clicked.connect(self.toggle_text_fullscreen)
        self.fullscreen_buttons_layout.addWidget(text_fullscreen_btn)

    def setup_shortcuts(self):
        self.shortcut_exit = Qt.Key.Key_Escape
        # F11 和 F12 快捷键将在 keyPressEvent 中直接处理

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.exit_fullscreen()
        elif event.key() == Qt.Key.Key_F11: # F11 用于窗口内全屏
            self.toggle_window_fullscreen()
        elif event.key() == Qt.Key.Key_F12: # F12 用于文本全屏
            self.toggle_text_fullscreen()

    def default_settings(self):
        self.font_family.setCurrentFont(QFont("Microsoft YaHei"))
        self.font_size.setValue(12)
        self.bold_check.setChecked(False)
        self.italic_check.setChecked(False)
        self.underline_check.setChecked(False)
        self.text_color = QColor(Qt.GlobalColor.black)
        self.bg_color = QColor(Qt.GlobalColor.white)
        self.left_radio.setChecked(True)
        self.v_center_radio.setChecked(True) # Set default for new vertical alignment
        self.update_display()

    def update_display(self):
        text = self.text_input.text()
        if not text:
            text = "在这里显示文本"

        font = self.font_family.currentFont()
        font.setPointSize(self.font_size.value())
        font.setBold(self.bold_check.isChecked())
        font.setItalic(self.italic_check.isChecked())
        font.setUnderline(self.underline_check.isChecked())

        # Determine horizontal alignment
        h_alignment = Qt.AlignmentFlag.AlignLeft
        if self.left_radio.isChecked():
            h_alignment = Qt.AlignmentFlag.AlignLeft
        elif self.center_radio.isChecked():
            h_alignment = Qt.AlignmentFlag.AlignCenter
        else: # right_radio.isChecked()
            h_alignment = Qt.AlignmentFlag.AlignRight

        # Determine vertical alignment
        v_alignment = Qt.AlignmentFlag.AlignVCenter
        if self.v_top_radio.isChecked():
            v_alignment = Qt.AlignmentFlag.AlignTop
        elif self.v_center_radio.isChecked():
            v_alignment = Qt.AlignmentFlag.AlignVCenter
        else: # v_bottom_radio.isChecked()
            v_alignment = Qt.AlignmentFlag.AlignBottom

        self.display_label.setText(text)
        self.display_label.setFont(font)
        self.display_label.setAlignment(h_alignment | v_alignment) # Combine horizontal and vertical
        
        # 根据窗口内全屏状态应用不同的样式表
        if self.is_window_fullscreen:
            style_sheet = f"background-color: {self.bg_color.name()}; color: {self.text_color.name()}; padding: 0px; border: none;"
        else:
            style_sheet = f"background-color: {self.bg_color.name()}; color: {self.text_color.name()}; padding: 10px; border: 1px solid #ccc;"
        self.display_label.setStyleSheet(style_sheet)


    def choose_text_color(self):
        color = QColorDialog.getColor(self.text_color, self, "选择文字颜色")
        if color.isValid():
            self.text_color = color
            self.update_display()

    def choose_bg_color(self):
        color = QColorDialog.getColor(self.bg_color, self, "选择背景颜色")
        if color.isValid():
            self.bg_color = color
            self.update_display()

    def toggle_fullscreen(self):
        if not self.is_fullscreen:
            self.original_geometry = self.geometry()

            self.showFullScreen()
            self.is_fullscreen = True

            if self.input_group:
                self.input_group.hide()
            if self.control_group:
                self.control_group.hide()

            if self.display_group:
                self.display_group.setTitle("")

            self.exit_btn = QPushButton("退出全屏 (ESC)")
            self.exit_btn.clicked.connect(self.exit_fullscreen)
            self.exit_btn.setParent(self)
            self.exit_btn.move(self.width() - self.exit_btn.width() - 10, 10)
            self.exit_btn.show()

            self.update_display()
        else:
            self.exit_fullscreen()

    def toggle_window_fullscreen(self):
        if not self.is_window_fullscreen:
            self.is_window_fullscreen = True

            main_layout = self.main_widget.layout()
            self.original_margins['main_layout'] = main_layout.contentsMargins()
            main_layout.setContentsMargins(0, 0, 0, 0)

            if self.input_group:
                self.input_group.hide()
            if self.control_group:
                self.control_group.hide()

            if self.display_group:
                self.display_group.hide()
                self.display_label_parent_layout = self.display_group.layout()
                main_layout.addWidget(self.display_label)

            self.update_display()

            self.exit_btn = QPushButton("退出窗口内全屏 (ESC/F11)")
            self.exit_btn.clicked.connect(self.exit_window_fullscreen)
            self.exit_btn.setParent(self.centralWidget())
            self.exit_btn.setStyleSheet("padding: 5px 10px;")
            self.exit_btn.adjustSize()
            self.exit_btn.move(self.centralWidget().width() - self.exit_btn.width() - 20, 20)
            self.exit_btn.show()

        else:
            self.exit_window_fullscreen()

    def exit_fullscreen(self):
        if self.is_fullscreen:
            self.showNormal()
            self.is_fullscreen = False

            if self.original_geometry:
                self.setGeometry(self.original_geometry)

            self.restore_ui()

            if hasattr(self, 'exit_btn'):
                self.exit_btn.hide()
                self.exit_btn.deleteLater()

    def exit_window_fullscreen(self):
        if self.is_window_fullscreen:
            self.is_window_fullscreen = False

            self.restore_ui()

            if hasattr(self, 'exit_btn'):
                self.exit_btn.hide()
                self.exit_btn.deleteLater()

    def restore_ui(self):
        main_layout = self.main_widget.layout()
        if 'main_layout' in self.original_margins:
            main_layout.setContentsMargins(self.original_margins['main_layout'])

        if self.display_label_parent_layout:
            main_layout.removeWidget(self.display_label)
            self.display_label_parent_layout.insertWidget(0, self.display_label)
            self.display_label_parent_layout = None

        if self.input_group:
            self.input_group.show()
        if self.control_group:
            self.control_group.show()

        if self.display_group:
            self.display_group.show()

        self.update_display()
        
    def toggle_text_fullscreen(self):
        if not self.is_text_fullscreen:
            self.is_text_fullscreen = True
            
            self.text_fullscreen_window = QMainWindow()
            self.text_fullscreen_window.showFullScreen()
            
            text_label = QLabel(self.display_label.text())
            text_label.setFont(self.display_label.font())
            text_label.setAlignment(self.display_label.alignment())
            text_label.setStyleSheet(f"background-color: {self.bg_color.name()}; color: {self.text_color.name()};")
            text_label.setWordWrap(True)
            
            self.text_fullscreen_window.setCentralWidget(text_label)
            
            exit_btn = QPushButton("退出文本全屏 (ESC/F12)")
            exit_btn.clicked.connect(self.exit_text_fullscreen)
            exit_btn.setParent(self.text_fullscreen_window)
            exit_btn.setStyleSheet("padding: 5px 10px;")
            exit_btn.adjustSize()
            exit_btn.move(self.text_fullscreen_window.width() - exit_btn.width() - 20, 20)
            exit_btn.show()
            
            self.text_fullscreen_window.resizeEvent = self.text_fullscreen_resize_event
            
            self.text_fullscreen_window.keyPressEvent = self.text_fullscreen_keyPressEvent
        else:
            self.exit_text_fullscreen()
            
    def text_fullscreen_keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape or event.key() == Qt.Key.Key_F12:
            self.exit_text_fullscreen()
            
    def text_fullscreen_resize_event(self, event):
        if hasattr(self, "text_fullscreen_window") and hasattr(self.text_fullscreen_window, "findChild"):
            exit_btn = self.text_fullscreen_window.findChild(QPushButton)
            if exit_btn:
                exit_btn.move(self.text_fullscreen_window.width() - exit_btn.width() - 20, 20)
            
    def exit_text_fullscreen(self):
        if self.is_text_fullscreen:
            self.is_text_fullscreen = False
            
            if hasattr(self, 'text_fullscreen_window'):
                self.text_fullscreen_window.close()
                del self.text_fullscreen_window

    def load_text_from_config(self):
        try:
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, "r", encoding="utf-8") as file:
                    config = json.load(file)

                td_config = config.get("apps", {}).get("TextDisplay", {})

                self.text_input.setText(td_config.get("content", ""))

                if "font_family" in td_config:
                    self.font_family.setCurrentFont(QFont(td_config["font_family"]))
                if "font_size" in td_config:
                    self.font_size.setValue(td_config["font_size"])
                if "bold" in td_config:
                    self.bold_check.setChecked(td_config["bold"])
                if "italic" in td_config:
                    self.italic_check.setChecked(td_config["italic"])
                if "underline" in td_config:
                    self.underline_check.setChecked(td_config["underline"])

                if "text_color" in td_config:
                    self.text_color = QColor(td_config["text_color"])
                if "bg_color" in td_config:
                    self.bg_color = QColor(td_config["bg_color"])

                h_alignment = td_config.get("horizontal_alignment")
                if h_alignment == "center":
                    self.center_radio.setChecked(True)
                elif h_alignment == "right":
                    self.right_radio.setChecked(True)
                else:
                    self.left_radio.setChecked(True)

                v_alignment = td_config.get("vertical_alignment")
                if v_alignment == "top":
                    self.v_top_radio.setChecked(True)
                elif v_alignment == "bottom":
                    self.v_bottom_radio.setChecked(True)
                else:
                    self.v_center_radio.setChecked(True)

                self.update_display()
        except Exception as e:
            logging.error(f"[TextDisplay] 加载配置失败: {e}")

    def save_text_to_config(self):
        try:
            logging.info("[TextDisplay] 开始保存配置")
            
            config = {}
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, "r", encoding="utf-8") as file:
                    config = json.load(file)

            text_display_config = config.setdefault("apps", {}).setdefault("TextDisplay", {})

            text_content = self.text_input.text()

            # Save horizontal alignment
            h_alignment_str = "left"
            if self.left_radio.isChecked():
                h_alignment_str = "left"
            elif self.center_radio.isChecked():
                h_alignment_str = "center"
            else: # right_radio.isChecked()
                h_alignment_str = "right"
            
            # Save vertical alignment
            v_alignment_str = "center"
            if self.v_top_radio.isChecked():
                v_alignment_str = "top"
            elif self.v_center_radio.isChecked():
                v_alignment_str = "center"
            else: # v_bottom_radio.isChecked()
                v_alignment_str = "bottom"
                
            temp_update = {
                "content": text_content,
                "font_family": self.font_family.currentFont().family(),
                "font_size": self.font_size.value(),
                "bold": self.bold_check.isChecked(),
                "italic": self.italic_check.isChecked(),
                "underline": self.underline_check.isChecked(),
                "text_color": self.text_color.name(),
                "bg_color": self.bg_color.name(),
                "horizontal_alignment": h_alignment_str, # Changed key name
                "vertical_alignment": v_alignment_str # Added vertical alignment
            }
            
            text_display_config.update(temp_update)

            with open(CONFIG_PATH, "w", encoding="utf-8") as file:
                json.dump(config, file, indent=4, ensure_ascii=False)

            logging.info("[TextDisplay] 保存配置成功")
            
        except Exception as e:
            logging.error(f"[TextDisplay] 保存配置失败: {e}")

    def closeEvent(self, event):
        self.save_text_to_config()
        self.closed.emit()
        event.accept()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self.is_window_fullscreen and hasattr(self, 'exit_btn') and self.exit_btn.isVisible():
            self.exit_btn.move(self.centralWidget().width() - self.exit_btn.width() - 20, 20)

def start_app(parent=None):
    window = TextDisplayWindow()
    return window

if __name__ == '__main__':
    # For standalone execution
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    # In standalone mode, the application should exit when the last window is closed.
    app.setQuitOnLastWindowClosed(True)
    
    window = start_app() # 现在 start_app 只返回窗口实例
    window.show()
    sys.exit(app.exec())