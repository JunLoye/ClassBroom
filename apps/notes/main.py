import os
import json
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QTextEdit, QPushButton, QLabel, 
                             QFrame, QScrollArea, QMessageBox)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont, QIcon

class NoteWidget(QFrame):
    deleteRequested = pyqtSignal(QWidget)
    
    def __init__(self, content="", parent=None):
        super().__init__(parent)
        self.content = content
        self.init_ui()
        
    def init_ui(self):
        self.setFrameStyle(QFrame.Shape.Box)
        self.setLineWidth(1)
        self.setStyleSheet("""
            NoteWidget {
                background: rgba(255, 255, 255, 220);
                border: 1px solid #ccc;
                border-radius: 8px;
                margin: 5px;
            }
        """)
        
        layout = QVBoxLayout()
        layout.setContentsMargins(8, 8, 8, 8)
        
        # 文本编辑区域
        self.text_edit = QTextEdit()
        self.text_edit.setPlainText(self.content)
        self.text_edit.setMaximumHeight(150)
        self.text_edit.setStyleSheet("""
            QTextEdit {
                background: transparent;
                border: none;
                font-size: 12px;
            }
        """)
        self.text_edit.textChanged.connect(self.on_text_changed)
        
        # 底部按钮区域
        button_layout = QHBoxLayout()
        
        delete_btn = QPushButton("删除")
        delete_btn.setStyleSheet("""
            QPushButton {
                background: #e74c3c;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 10px;
            }
            QPushButton:hover {
                background: #c0392b;
            }
        """)
        delete_btn.clicked.connect(lambda: self.deleteRequested.emit(self))
        
        button_layout.addStretch()
        button_layout.addWidget(delete_btn)
        
        layout.addWidget(self.text_edit)
        layout.addLayout(button_layout)
        
        self.setLayout(layout)
    
    def on_text_changed(self):
        self.content = self.text_edit.toPlainText()
    
    def get_content(self):
        return self.content

class NotesApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.notes = []
        self.notes_file = "notes_data.json"
        self.load_notes()
        self.init_ui()
        
    def init_ui(self):
        self.setWindowTitle("便签")
        self.setWindowFlags(Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.Tool)
        self.setFixedSize(300, 500)
        
        # 设置窗口样式
        self.setStyleSheet("""
            QMainWindow {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #667eea, stop:1 #764ba2);
            }
        """)
        
        central_widget = QWidget()
        central_widget.setStyleSheet("""
            QWidget {
                background: transparent;
            }
        """)
        self.setCentralWidget(central_widget)
        
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(10, 10, 10, 10)
        main_layout.setSpacing(10)
        
        # 标题
        title_label = QLabel("便签")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            QLabel {
                color: white;
                font-size: 18px;
                font-weight: bold;
                padding: 5px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 5px;
            }
        """)
        main_layout.addWidget(title_label)
        
        # 添加新便签按钮
        add_btn = QPushButton("+ 添加新便签")
        add_btn.setStyleSheet("""
            QPushButton {
                background: rgba(255, 255, 255, 0.9);
                border: none;
                border-radius: 5px;
                padding: 8px;
                font-size: 12px;
                font-weight: bold;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 1);
            }
        """)
        add_btn.clicked.connect(self.add_new_note)
        main_layout.addWidget(add_btn)
        
        # 滚动区域
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll_area.setStyleSheet("""
            QScrollArea {
                border: none;
                background: transparent;
            }
            QScrollBar:vertical {
                background: rgba(255, 255, 255, 0.3);
                width: 8px;
                border-radius: 4px;
            }
            QScrollBar::handle:vertical {
                background: rgba(255, 255, 255, 0.6);
                border-radius: 4px;
                min-height: 20px;
            }
        """)
        
        self.notes_container = QWidget()
        self.notes_layout = QVBoxLayout(self.notes_container)
        self.notes_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.notes_layout.setSpacing(5)
        
        scroll_area.setWidget(self.notes_container)
        main_layout.addWidget(scroll_area)
        
        # 加载保存的便签
        self.load_notes_ui()
    
    def add_new_note(self):
        note_widget = NoteWidget()
        note_widget.deleteRequested.connect(self.delete_note)
        self.notes_layout.addWidget(note_widget)
        self.notes.append(note_widget)
    
    def delete_note(self, note_widget):
        reply = QMessageBox.question(self, '确认删除', '确定要删除这个便签吗？',
                                   QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.Yes:
            self.notes.remove(note_widget)
            note_widget.deleteLater()
            self.save_notes()
    
    def load_notes_ui(self):
        for note_content in self.notes:
            note_widget = NoteWidget(note_content)
            note_widget.deleteRequested.connect(self.delete_note)
            self.notes_layout.addWidget(note_widget)
            self.notes.append(note_widget)
    
    def load_notes(self):
        if os.path.exists(self.notes_file):
            try:
                with open(self.notes_file, 'r', encoding='utf-8') as f:
                    self.notes = json.load(f)
            except:
                self.notes = []
        else:
            self.notes = []
    
    def save_notes(self):
        try:
            note_contents = [note.get_content() for note in self.notes]
            with open(self.notes_file, 'w', encoding='utf-8') as f:
                json.dump(note_contents, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"保存便签失败: {e}")
    
    def closeEvent(self, event):
        self.save_notes()
        event.accept()

if __name__ == "__main__":
    import sys
    app = QApplication(sys.argv)
    window = NotesApp()
    window.show()
    sys.exit(app.exec())