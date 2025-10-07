# ----------------------- 导入模块 -----------------------
import sys
import time
import logging
import pyautogui
import os
from datetime import datetime
from PIL import ImageGrab
from datetime import datetime

from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QHBoxLayout,
                             QLabel, QVBoxLayout, QFrame, QPushButton, QDialog, QFormLayout, QLineEdit, QSpinBox, 
                             QDialogButtonBox, QComboBox, QCheckBox, QScrollArea,
)
from PyQt6.QtCore import Qt, pyqtSignal, QThread
from PyQt6.QtGui import QFont


# ===== 配置 =====
INTERVAL = 10  # 每隔多少秒截图
OUTPUT_DIR = "screenshots"
# ================

os.makedirs(OUTPUT_DIR, exist_ok=True)

def timestamp():
    return datetime.now().strftime("%Y%m%d_%H%M%S")

def capture_fullscreen():
    """截图整个屏幕"""
    img = ImageGrab.grab(all_screens=True)
    filename = os.path.join(OUTPUT_DIR, f"screen_{timestamp()}.png")
    img.save(filename)
    print(f"[✓] 全屏截图：{filename}")

def capture_windows():
    """截图当前所有窗口（排除最小化或无效窗口）"""
    windows = gw.getAllWindows()
    for w in windows:
        try:
            # 跳过最小化窗口或无效位置
            if w.isMinimized or w.width <= 0 or w.height <= 0:
                continue
            box = (w.left, w.top, w.width, w.height)
            img = pyautogui.screenshot(region=box)
            safe_title = w.title.strip().replace(' ', '_').replace('/', '_').replace('\\', '_') or "untitled"
            filename = os.path.join(OUTPUT_DIR, f"window_{safe_title}_{timestamp()}.png")
            img.save(filename)
            print(f"    [→] 窗口截图：{w.title}")
        except Exception as e:
            print(f"    [×] 无法截图窗口：{getattr(w, 'title', '?')} ({e})")

def main():
    logging.info("[Weather] 启动成功")
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    font = QFont("Microsoft YaHei", 11)
    app.setFont(font)

    App_WindowRecorder = App_WindowRecorder()
    App_WindowRecorder.show()

    sys.exit(app.exec())
    
    print(f"开始定时截图，每 {INTERVAL} 秒保存一次到文件夹：{OUTPUT_DIR}")
    while True:
        try:
            capture_fullscreen()
            capture_windows()
            time.sleep(INTERVAL)
        except KeyboardInterrupt:
            print("\n已手动终止程序。")
            break
        except Exception as e:
            print(f"[错误] {e}")
            time.sleep(INTERVAL)