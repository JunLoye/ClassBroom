import sys
import os
import time
import logging
import sqlite3
from datetime import datetime, timedelta
from collections import deque
import pyautogui
import win32gui
import win32process
import json

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QScrollArea, QDialog, QFrame, QLineEdit,
    QDialogButtonBox, QListWidget, QListWidgetItem
)
from PyQt6.QtGui import QFont, QPixmap, QPainter, QPen, QColor, QDesktopServices
from PyQt6.QtCore import Qt, pyqtSignal, QThread, QUrl, QPoint, QTimer, QSize


CONFIG = {
    "interval": 60,
    "screenshots_dir": "screenshots",
    "db_file": "window_records.db",
    "thumb_size": [240, 140],
    "min_hit_dist": 30,
    "tick_target": 6,
    "drag_threshold": 6,
    "inertia_friction": 0.92,
    "inertia_min_v": 10,
    "inertia_timer_ms": 16,
    "log_item_height": 20,
    "log_file": "window_recorder.log", # 新增日志文件配置
    "log_level": "INFO" # 新增日志级别配置
}

def get_config():
    global CONFIG
    try:
        with open('config.json', 'r', encoding='utf-8') as f:
            loaded_config = json.load(f)
            if 'apps' in loaded_config and 'WindowRecorder' in loaded_config['apps']:
                CONFIG.update(loaded_config['apps']['WindowRecorder'])
        logging.info("[WindowRecorder] 配置文件加载成功")
    except Exception as e:
        logging.warning(f"[WindowRecorder] 读取配置文件失败: {e}")


class DatabaseManager:
    def __init__(self, path=CONFIG["db_file"]):
        self.path = path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.path)
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                window_name TEXT,
                screenshot_name TEXT
            )
        """)
        conn.commit()
        conn.close()

    def insert(self, ts, win, fname):
        try:
            conn = sqlite3.connect(self.path)
            c = conn.cursor()
            c.execute("INSERT INTO records (timestamp, window_name, screenshot_name) VALUES (?, ?, ?)",
                      (ts, win, fname))
            conn.commit()
            conn.close()
        except Exception as e:
            logging.exception("插入数据库失败: %s", e)

    def fetch_all(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row # 方便按列名访问
        c = conn.cursor()
        c.execute("SELECT timestamp, window_name, screenshot_name FROM records ORDER BY timestamp ASC")
        rows = c.fetchall()
        conn.close()
        return rows


class ScreenshotThread(QThread):
    log_signal = pyqtSignal(str)

    def __init__(self, interval=CONFIG["interval"], output_dir=CONFIG["screenshots_dir"], db=None):
        super().__init__()
        self.interval = interval
        self.output_dir = output_dir
        self.db = db or DatabaseManager()
        self.running = False
        os.makedirs(self.output_dir, exist_ok=True)

    def run(self):
        self.running = True
        self.log_signal.emit(f"开始截图，每 {self.interval}s")
        while self.running:
            try:
                self.capture_screen()
                time.sleep(self.interval)
            except Exception as e:
                logging.exception("截图线程异常：%s", e)
                self.log_signal.emit(f"[错误] {e}")
                time.sleep(self.interval)

    def stop(self):
        self.running = False
        self.wait()
        self.log_signal.emit("截图线程已停止")

    def timestamp(self):
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def capture_screen(self):
        ts = self.timestamp()
        safe_ts = ts.replace(":", "-")
        fname = os.path.join(self.output_dir, f"screen_{safe_ts}.png")

        try:
            img = pyautogui.screenshot()
            img.save(fname)
            self.log_signal.emit(f"[✓] 截图: {fname}")
        except Exception as e:
            logging.exception("保存截图失败: %s", e)
            self.log_signal.emit(f"[错误] 截图保存失败：{e}")
            return

        try:
            my_hwnd = win32gui.GetForegroundWindow()
            current_pid = os.getpid()
            wins = []

            def enum_callback(hwnd, _):
                try:
                    if not win32gui.IsWindowVisible(hwnd):
                        return True
                    _, pid = win32process.GetWindowThreadProcessId(hwnd)
                    if pid == current_pid:
                        return True
                    title = win32gui.GetWindowText(hwnd).strip()
                    if title and hwnd != my_hwnd:
                        wins.append(title)
                except Exception:
                    pass
                return True

            win32gui.EnumWindows(enum_callback, None)

            for w in wins:
                self.db.insert(ts, w, os.path.basename(fname))

            self.log_signal.emit(f"[DB] 成功记录 {len(wins)} 个窗口")
            if not wins:
                self.log_signal.emit("[警告] 未检测到可见窗口（可能被全部最小化或权限不足）")

        except Exception as e:
            logging.exception("枚举窗口失败: %s", e)
            self.log_signal.emit(f"[错误] 枚举窗口失败：{e}")


class DetailDialog(QDialog):
    def __init__(self, filename, records, parent=None):
        super().__init__(parent)
        self.setWindowTitle("时间点详情")
        self.resize(600, 700) # 增大窗口尺寸
        layout = QVBoxLayout(self)

        img_path = os.path.join(CONFIG["screenshots_dir"], filename)
        img_label = QLabel()
        img_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        if os.path.exists(img_path):
            pix = QPixmap(img_path)
            if not pix.isNull():
                img_label.setPixmap(pix.scaled(560, 360, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            else:
                img_label.setText("[无法显示图像]")
        else:
            img_label.setText("[截图丢失]")

        layout.addWidget(img_label)

        info_label = QLabel("<b>关联窗口（时间 — 窗口名）：</b>")
        layout.addWidget(info_label)

        win_list = QListWidget()
        win_list.setSpacing(4)
        for ts, wn, fn in records:
            item_text = f"{ts}  |  {wn}"
            it = QListWidgetItem(item_text)
            it.setSizeHint(QSize(0, 22))
            win_list.addItem(it)
        layout.addWidget(win_list, stretch=1)

        buttons = QDialogButtonBox()
        open_btn = QPushButton("打开图片")
        copy_btn = QPushButton("复制所有窗口名")
        close_btn = QPushButton("关闭")
        buttons.addButton(open_btn, QDialogButtonBox.ButtonRole.ActionRole)
        buttons.addButton(copy_btn, QDialogButtonBox.ButtonRole.ActionRole)
        buttons.addButton(close_btn, QDialogButtonBox.ButtonRole.RejectRole)
        layout.addWidget(buttons)

        def open_image():
            path = os.path.join(CONFIG["screenshots_dir"], filename)
            if os.path.exists(path):
                QDesktopServices.openUrl(QUrl.fromLocalFile(os.path.abspath(path)))

        def copy_info():
            clipboard = QApplication.clipboard()
            text = "\n".join([f"{ts} | {wn}" for ts, wn, _ in records])
            clipboard.setText(text)

        open_btn.clicked.connect(open_image)
        copy_btn.clicked.connect(copy_info)
        close_btn.clicked.connect(self.reject)


class PreviewPopup(QFrame):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setStyleSheet("""
            QFrame {
                background-color: #1f1f1f;
                color: #eee;
                border: 1px solid #444;
                border-radius: 6px;
                padding: 4px;
            }
            QLabel {
                color: #eee;
                background-color: transparent;
            }
        """)
        self.img_label = QLabel()
        self.img_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.img_label.setMinimumSize(CONFIG["thumb_size"][0], CONFIG["thumb_size"][1])
        self.img_label.setStyleSheet("background-color: #2a2a2a; border-radius: 4px;")

        self.title_label = QLabel()
        self.title_label.setWordWrap(True)
        self.title_label.setMaximumWidth(CONFIG["thumb_size"][0] + 20)

        self.time_label = QLabel()

        v = QVBoxLayout(self)
        v.setContentsMargins(6, 6, 6, 6)
        v.setSpacing(6)
        v.addWidget(self.img_label)
        v.addWidget(self.title_label)
        v.addWidget(self.time_label)
        self.setVisible(False)
        self._last_file = None

    def show_preview(self, img_path, window_name, timestamp, global_pos: QPoint):
        if img_path and os.path.exists(img_path) and img_path != self._last_file:
            try:
                pix = QPixmap(img_path)
                if not pix.isNull():
                    scaled_pix = pix.scaled(
                        CONFIG["thumb_size"][0], CONFIG["thumb_size"][1],
                        Qt.AspectRatioMode.KeepAspectRatio,
                        Qt.TransformationMode.SmoothTransformation
                    )
                    self.img_label.setPixmap(scaled_pix)
                    self._last_file = img_path
                else:
                    self.img_label.setText("[无法加载图像]")
                    self.img_label.setStyleSheet("background-color: #2a2a2a; color: #ff6b6b; border-radius: 4px;")
            except Exception as e:
                logging.exception(f"预览加载失败: {e}")
                self.img_label.setText(f"[预览错误]")
                self.img_label.setStyleSheet("background-color: #2a2a2a; color: #ff6b6b; border-radius: 4px;")
        elif not img_path or not os.path.exists(img_path):
            self.img_label.setText("[图像丢失]")
            self.img_label.setStyleSheet("background-color: #2a2a2a; color: #ff6b6b; border-radius: 4px;")

        display_name = window_name
        if len(display_name) > 40:
            display_name = display_name[:37] + "..."
        self.title_label.setText(f"窗口：{display_name}")
        self.time_label.setText(f"时间：{timestamp}")

        screen_rect = QApplication.primaryScreen().availableGeometry()
        x = global_pos.x() + 16
        y = global_pos.y() + 16

        if x + self.width() > screen_rect.right():
            x = global_pos.x() - self.width() - 16
        if y + self.height() > screen_rect.bottom():
            y = global_pos.y() - self.height() - 16

        self.move(x, y)
        self.adjustSize()
        self.setVisible(True)
        self.raise_()

    def hide_preview(self):
        self.setVisible(False)


class TimelineTrack(QFrame):
    def __init__(self, date_str, items, parent=None):
        super().__init__(parent)
        self.date = date_str
        # 将时间戳字符串转换为 datetime 对象，并存储原始字符串
        self.items_parsed = []
        for ts_str, wn, fn in items:
            try:
                dt_obj = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
                self.items_parsed.append((dt_obj, wn, fn, ts_str))
            except ValueError:
                logging.warning(f"无法解析时间戳: {ts_str}")
                continue
        self.items_parsed.sort(key=lambda x: x[0])

        self.setMinimumHeight(220)
        self.setMouseTracking(True)
        self.preview = PreviewPopup(self)
        self.setStyleSheet("background-color: #0f0f0f; border-radius:6px; margin-bottom:8px;")
        self._positions = []
        self._ticks = []
        self._left_margin = 60
        self._right_margin = 60
        self._zoom_factor = 1.0
        self._min_zoom = 0.5
        self._max_zoom = 8.0
        self._pan_offset_seconds = 0.0
        self._is_dragging = False
        self._drag_start_x = None
        self._drag_start_offset = 0.0
        self._press_x = None
        self._pos_samples = deque(maxlen=6)
        self._inertia_timer = QTimer(self)
        self._inertia_timer.setInterval(CONFIG["inertia_timer_ms"])
        self._inertia_timer.timeout.connect(self._on_inertia_tick)
        self._inertia_vx = 0.0
        self._prepare_positions_and_ticks()

    def _prepare_positions_and_ticks(self):
        self._positions = []
        self._ticks = []
        if not self.items_parsed:
            return

        times = [dt_obj for dt_obj, _, _, _ in self.items_parsed]
        real_min, real_max = min(times), max(times)

        center = real_min + (real_max - real_min) / 2
        total_span = max((real_max - real_min).total_seconds(), 1.0)
        zoom_span = total_span / self._zoom_factor

        center = center + timedelta(seconds=self._pan_offset_seconds)
        tmin = center - timedelta(seconds=zoom_span / 2)
        tmax = center + timedelta(seconds=zoom_span / 2)
        span_seconds = max((tmax - tmin).total_seconds(), 1.0)

        approx_interval = span_seconds / max(1, (CONFIG["tick_target"] - 1))
        nice_units = [60, 300, 600, 900, 1800, 3600, 7200, 14400]
        tick_interval = min(nice_units, key=lambda u: abs(u - approx_interval))

        start_epoch = int(tmin.timestamp())
        end_epoch = int(tmax.timestamp())
        first_tick = (start_epoch // tick_interval) * tick_interval
        ticks = list(range(first_tick, end_epoch + tick_interval, tick_interval))

        avail_w = max(10, self.width() - self._left_margin - self._right_margin)

        for dt_obj, win, fn, ts_str in self.items_parsed:
            rel = (dt_obj.timestamp() - tmin.timestamp()) / span_seconds
            x = int(self._left_margin + rel * avail_w)
            self._positions.append((x, (ts_str, win, fn)))

        for te in ticks:
            if te < int(tmin.timestamp()) or te > int(tmax.timestamp()):
                continue
            rel = (te - tmin.timestamp()) / span_seconds
            x = int(self._left_margin + rel * avail_w)
            label = datetime.fromtimestamp(te).strftime("%H:%M")
            self._ticks.append((x, label))

    def resizeEvent(self, e):
        self._prepare_positions_and_ticks()
        super().resizeEvent(e)

    def paintEvent(self, e):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        top_y = 28
        painter.setPen(QPen(QColor("#4fc1ff"), 2))
        painter.drawLine(self._left_margin, top_y, self.width() - self._right_margin, top_y)
        painter.setPen(QPen(QColor("#88cfff"), 1))
        for x, label in self._ticks:
            painter.drawLine(x, top_y - 6, x, top_y + 6)
            painter.drawText(x - 25, top_y - 18, 50, 14, Qt.AlignmentFlag.AlignCenter, label)

        line_y = self.height() // 2
        pen_line = QPen(QColor("#2f9cff"))
        pen_line.setWidth(3)
        painter.setPen(pen_line)
        left = self._left_margin
        right = self.width() - self._right_margin
        painter.drawLine(left, line_y, right, line_y)

        if self._positions and len(self._positions) > 1:
            sorted_positions = sorted(self._positions, key=lambda p: p[0])

            if sorted_positions[0][0] > left:
                pen_gap = QPen(QColor("#666666"))
                pen_gap.setStyle(Qt.PenStyle.DashLine)
                pen_gap.setWidth(2)
                painter.setPen(pen_gap)
                painter.drawLine(left, line_y, sorted_positions[0][0], line_y)

            for i in range(len(sorted_positions) - 1):
                x1 = sorted_positions[i][0]
                x2 = sorted_positions[i+1][0]
                if x2 - x1 > 30:
                    pen_gap = QPen(QColor("#666666"))
                    pen_gap.setStyle(Qt.PenStyle.DashLine)
                    pen_gap.setWidth(2)
                    painter.setPen(pen_gap)
                    painter.drawLine(x1, line_y, x2, line_y)

            if sorted_positions[-1][0] < right:
                pen_gap = QPen(QColor("#666666"))
                pen_gap.setStyle(Qt.PenStyle.DashLine)
                pen_gap.setWidth(2)
                painter.setPen(pen_gap)
                painter.drawLine(sorted_positions[-1][0], line_y, right, line_y)

        if self._positions:
            for x, (ts, win, fn) in self._positions:
                point_size = max(4, min(8, int(6 * self._zoom_factor)))
                painter.setBrush(QColor("#1f1f1f"))
                painter.setPen(QPen(QColor("#ff6b6b"), 2))
                painter.drawEllipse(QPoint(x, line_y), point_size + 2, point_size + 2)
                painter.setBrush(QColor("#ff6b6b"))
                painter.setPen(Qt.PenStyle.NoPen)
                painter.drawEllipse(QPoint(x, line_y), point_size, point_size)

                if self._zoom_factor > 2.0:
                    time_str = ts.split(" ")[1][:5]
                    painter.setPen(QPen(QColor("#ffffff")))
                    painter.drawText(x - 25, line_y - 15, 50, 12, Qt.AlignmentFlag.AlignCenter, time_str)

        legend_y = self.height() - 25
        legend_x = self._left_margin
        painter.setPen(QPen(QColor("#ff6b6b")))
        painter.setBrush(QColor("#ff6b6b"))
        painter.drawEllipse(QPoint(legend_x, legend_y), 4, 4)
        painter.setPen(QPen(QColor("#dddddd")))
        painter.drawText(legend_x + 10, legend_y - 8, 80, 16, Qt.AlignmentFlag.AlignLeft, "截图记录")
        legend_x += 100
        pen_gap = QPen(QColor("#666666"))
        pen_gap.setStyle(Qt.PenStyle.DashLine)
        pen_gap.setWidth(2)
        painter.setPen(pen_gap)
        painter.drawLine(legend_x - 10, legend_y, legend_x + 10, legend_y)
        painter.setPen(QPen(QColor("#dddddd")))
        painter.drawText(legend_x + 15, legend_y - 8, 80, 16, Qt.AlignmentFlag.AlignLeft, "无记录区间")
        legend_x += 100
        painter.setPen(QPen(QColor("#88cfff")))
        painter.drawText(legend_x, legend_y - 8, 140, 16, Qt.AlignmentFlag.AlignLeft, f"缩放: {self._zoom_factor:.1f}x")

        painter.end()

    def wheelEvent(self, event):
        old_zoom = self._zoom_factor
        delta = event.angleDelta().y()
        zoom_delta = 0.12 if delta > 0 else -0.12
        mx = event.position().x()
        
        if not self.items_parsed:
            return
        times = [dt_obj for dt_obj, _, _, _ in self.items_parsed]
        real_min, real_max = min(times), max(times)
        total_span = max((real_max - real_min).total_seconds(), 1.0)
        
        old_zoom = self._zoom_factor
        self._zoom_factor = max(self._min_zoom, min(self._max_zoom, self._zoom_factor + zoom_delta))
        if self._zoom_factor != old_zoom:
            avail_w = max(10, self.width() - self._left_margin - self._right_margin)
            center = real_min + (real_max - real_min) / 2
            old_zoom_span = total_span / old_zoom
            old_center = center + timedelta(seconds=self._pan_offset_seconds)
            old_tmin = old_center - timedelta(seconds=old_zoom_span / 2)
            old_span_seconds = old_zoom_span
            rel = (mx - self._left_margin) / max(1.0, avail_w)
            rel = max(0.0, min(1.0, rel))
            ts_under_mouse = old_tmin + timedelta(seconds=rel * old_span_seconds)

            new_zoom_span = total_span / self._zoom_factor
            new_center = center + timedelta(seconds=self._pan_offset_seconds)
            desired_center = ts_under_mouse - timedelta(seconds=new_zoom_span * (rel - 0.5))
            center_nominal = real_min + (real_max - real_min) / 2
            new_pan_offset = (desired_center - center_nominal).total_seconds()
            self._pan_offset_seconds = new_pan_offset
            self._prepare_positions_and_ticks()
            self.update()

        event.accept()

    def mousePressEvent(self, e):
        if e.button() == Qt.MouseButton.LeftButton:
            self._press_x = e.position().x()
            self._drag_start_x = e.position().x()
            self._drag_start_offset = self._pan_offset_seconds
            self._is_dragging = False
            self.setCursor(Qt.CursorShape.ClosedHandCursor)
            self._pos_samples.clear()
            now = time.time()
            self._pos_samples.append((self._drag_start_x, now))
            if self._inertia_timer.isActive():
                self._inertia_timer.stop()
                self._inertia_vx = 0.0
        super().mousePressEvent(e)

    def mouseMoveEvent(self, e):
        now = time.time()
        mx = e.position().x()
        self._pos_samples.append((mx, now))

        buttons = QApplication.mouseButtons()
        if buttons & Qt.MouseButton.LeftButton and self._drag_start_x is not None:
            dx = e.position().x() - self._drag_start_x
            if not self._is_dragging and abs(dx) >= CONFIG["drag_threshold"]:
                self._is_dragging = True
            if self._is_dragging:
                if not self.items_parsed: # 避免在没有数据时计算
                    return
                times = [dt_obj for dt_obj, _, _, _ in self.items_parsed]
                real_min, real_max = min(times), max(times)
                total_span = max((real_max - real_min).total_seconds(), 1.0)
                zoom_span = total_span / self._zoom_factor
                avail_w = max(10, self.width() - self._left_margin - self._right_margin)
                sec_per_px = zoom_span / max(1.0, avail_w)
                delta_seconds = -dx * sec_per_px
                self._pan_offset_seconds = self._drag_start_offset + delta_seconds
                self._prepare_positions_and_ticks()
                self.update()

        if not self._is_dragging:
            if not self._positions:
                self.preview.hide_preview()
                return
            closest = None
            best_dx = None
            for x, info in self._positions:
                dx = abs(mx - x)
                if best_dx is None or dx < best_dx:
                    best_dx = dx
                    closest = (x, info)
            if best_dx is not None and best_dx <= CONFIG["min_hit_dist"]:
                x, (ts, win, fn) = closest
                img_path = os.path.join(CONFIG["screenshots_dir"], fn)
                global_pos = self.mapToGlobal(e.position().toPoint())
                self.preview.show_preview(img_path, win, ts, global_pos)
            else:
                self.preview.hide_preview()

        super().mouseMoveEvent(e)

    def mouseReleaseEvent(self, e):
        if e.button() == Qt.MouseButton.LeftButton:
            if self._is_dragging:
                if len(self._pos_samples) >= 2:
                    x0, t0 = self._pos_samples[0]
                    x1, t1 = self._pos_samples[-1]
                    dt = t1 - t0
                    if dt > 0:
                        vx = (x1 - x0) / dt
                        self._inertia_vx = vx
                    else:
                        self._inertia_vx = 0.0
                else:
                    self._inertia_vx = 0.0

                self._is_dragging = False
                self._drag_start_x = None
                self._press_x = None
                self.setCursor(Qt.CursorShape.ArrowCursor)
                if abs(self._inertia_vx) >= CONFIG['inertia_min_v']:
                    if not self._inertia_timer.isActive():
                        self._inertia_timer.start()
                return # 拖拽结束后不触发点击事件

            mx = e.position().x()
            for x, (ts, win, fn) in self._positions:
                if abs(mx - x) <= CONFIG['min_hit_dist']:
                    self.preview.hide_preview()
                    # 从原始 items 中筛选，因为 DetailDialog 期望 (ts_str, wn, fn)
                    related = [(original_ts_str, original_wn, original_fn) 
                               for _, original_wn, original_fn, original_ts_str in self.items_parsed 
                               if original_fn == fn]
                    dlg = DetailDialog(fn, related, parent=self.window())
                    dlg.exec()
                    break

            self._drag_start_x = None
            self._press_x = None
            self.setCursor(Qt.CursorShape.ArrowCursor)

        super().mouseReleaseEvent(e)

    def _on_inertia_tick(self):
        if abs(self._inertia_vx) < CONFIG["inertia_min_v"]:
            self._inertia_timer.stop()
            self._inertia_vx = 0.0
            return

        if not self.items_parsed:
            self._inertia_timer.stop()
            self._inertia_vx = 0.0
            return
        times = [dt_obj for dt_obj, _, _, _ in self.items_parsed]
        real_min, real_max = min(times), max(times)
        total_span = max((real_max - real_min).total_seconds(), 1.0)
        zoom_span = total_span / self._zoom_factor
        avail_w = max(10, self.width() - self._left_margin - self._right_margin)
        sec_per_px = zoom_span / max(1.0, avail_w)

        dt = CONFIG["inertia_timer_ms"] / 1000.0
        delta_seconds = - self._inertia_vx * sec_per_px * dt
        self._pan_offset_seconds += delta_seconds
        self._prepare_positions_and_ticks()
        self.update()

        self._inertia_vx *= CONFIG["inertia_friction"]
        if abs(self._inertia_vx) < CONFIG["inertia_min_v"]:
            self._inertia_timer.stop()
            self._inertia_vx = 0.0
            

class TimelineViewer(QDialog):
    def __init__(self, db: DatabaseManager, parent=None):
        super().__init__(parent)
        self.setWindowTitle("时间轴")
        self.resize(1000, 700)
        self.db = db
        self.output_dir = CONFIG['screenshots_dir']
        self.init_ui()

    def init_ui(self):
        main_v = QVBoxLayout(self)

        search_layout = QHBoxLayout()
        self.search_edit = QLineEdit()
        self.search_edit.setPlaceholderText("🔍 搜索窗口名或截图名（支持模糊搜索）")
        self.search_edit.textChanged.connect(self.load_data)
        search_layout.addWidget(self.search_edit)
        hint = QLabel("🖱️")
        hint.setStyleSheet("color:#88cfff;")
        search_layout.addWidget(hint)
        main_v.addLayout(search_layout)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.container = QWidget()
        self.vlayout = QVBoxLayout(self.container)
        self.vlayout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.scroll.setWidget(self.container)
        main_v.addWidget(self.scroll)

        self.load_data()

    def load_data(self):
        while self.vlayout.count():
            it = self.vlayout.takeAt(0)
            if it.widget():
                it.widget().deleteLater()

        keyword = self.search_edit.text().strip().lower()
        rows = self.db.fetch_all()
        if keyword:
            rows = [r for r in rows if keyword in r['window_name'].lower() or keyword in r['screenshot_name'].lower()]

        if not rows:
            label = QLabel("暂无记录")
            label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.vlayout.addWidget(label)
            return

        grouped = {}
        for row in rows:
            ts, wn, fn = row['timestamp'], row['window_name'], row['screenshot_name']
            d = ts.split(" ")[0]
            grouped.setdefault(d, []).append((ts, wn, fn))

        for d in sorted(grouped.keys()):
            items = sorted(grouped[d], key=lambda x: x[0])
            title = QLabel(f"📅 {d}")
            title.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
            title.setStyleSheet("color:#8fd8ff; margin-top:8px;")
            self.vlayout.addWidget(title)

            track = TimelineTrack(d, items, parent=self)
            self.vlayout.addWidget(track)


class WindowRecorderApp(QMainWindow):
    def __init__(self, parent=None): # 移除未使用的 config 参数
        super().__init__(parent)
        self.db = DatabaseManager()
        self.thread = None
        
        self.interval = CONFIG['interval']
        self.output_dir = CONFIG['screenshots_dir']
        
        self.init_ui()

    def init_ui(self):
        self.setWindowTitle('窗口记录')
        self.resize(520, 600)
        central = QWidget()
        self.setCentralWidget(central)
        v = QVBoxLayout(central)

        title = QLabel('窗口记录')
        title.setFont(QFont("Microsoft YaHei", 16, QFont.Weight.Bold))
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.addWidget(title)

        self.status_label = QLabel("状态：未开始")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.addWidget(self.status_label)

        self.log_list = QListWidget()
        self.log_list.setSpacing(2)
        self.log_list.setUniformItemSizes(True)
        v.addWidget(self.log_list, stretch=1)

        h = QHBoxLayout()
        self.start_btn = QPushButton("开始")
        self.stop_btn = QPushButton("停止")
        self.view_btn = QPushButton("时间轴")
        h.addWidget(self.start_btn)
        h.addWidget(self.stop_btn)
        h.addWidget(self.view_btn)
        v.addLayout(h)

        self.start_btn.clicked.connect(self.start_record)
        self.stop_btn.clicked.connect(self.stop_record)
        self.view_btn.clicked.connect(self.open_timeline)
        self.stop_btn.setEnabled(False)

    def add_log(self, msg):
        item = QListWidgetItem(msg)
        item.setSizeHint(QSize(0, CONFIG['log_item_height']))
        self.log_list.addItem(item)
        self.log_list.scrollToBottom()

    def start_record(self):
        if not self.thread or not self.thread.isRunning():
            self.thread = ScreenshotThread(self.interval, self.output_dir, self.db)
            self.thread.log_signal.connect(self.add_log)
            self.thread.start()
            self.status_label.setText("状态：运行中")
            self.start_btn.setEnabled(False)
            self.stop_btn.setEnabled(True)

    def stop_record(self):
        if self.thread and self.thread.isRunning():
            self.thread.stop()
            self.status_label.setText("状态：已停止")
            self.start_btn.setEnabled(True)
            self.stop_btn.setEnabled(False)

    def open_timeline(self):
        viewer = TimelineViewer(self.db, parent=self) # 移除未使用的 output_dir 参数
        viewer.exec()
    
    def closeEvent(self, event):
        self.stop_record() # 确保线程在关闭主窗口时停止
        super().closeEvent(event)


def WindowRecorder_main(parent=None):
    get_config()
    
    logging.info("[WindowRecorder] 创建窗口")
    
    win = WindowRecorderApp(parent)
    win.show()
    return win

def main():
    get_config()
    
    logging.info("[WindowRecorder] 进程启动")
    app = QApplication(sys.argv)
    app.setFont(QFont("Microsoft YaHei", 10))
    win = WindowRecorderApp()
    win.show()
    sys.exit(app.exec())