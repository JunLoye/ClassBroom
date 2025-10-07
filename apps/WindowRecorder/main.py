<<<<<<< HEAD
import sys
import os
import time
import logging
import sqlite3
from datetime import datetime, timedelta
from collections import deque
from PIL import Image, ImageOps
import pyautogui
import win32gui
import win32process  # <-- 新增，用于根据 PID 排除本进程窗口

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QScrollArea, QDialog, QFrame, QLineEdit,
    QDialogButtonBox, QListWidget, QListWidgetItem
)
from PyQt6.QtGui import QFont, QPixmap, QPainter, QPen, QColor, QDesktopServices
from PyQt6.QtCore import Qt, pyqtSignal, QThread, QUrl, QPoint, QTimer, QSize


# ----------------- 配置 -----------------
DEFAULT_INTERVAL = 10
DEFAULT_OUTPUT_DIR = "screenshots"
DB_FILE = "window_records.db"
APP_TITLE = "窗口记录"
THUMB_SIZE = (240, 140)         # 预览缩略图尺寸
MIN_HIT_DIST = 30               # 鼠标与时间点触发预览阈值 (px)
TICK_TARGET = 6                 # 希望的刻度数量（包含首尾）
DRAG_THRESHOLD = 6              # 拖动判定阈值（像素）
INERTIA_FRICTION = 0.92         # 惯性每帧乘数 (0..1), 越接近1减速越慢
INERTIA_MIN_V = 10              # 最小速度(px/s) 停止惯性
INERTIA_TIMER_MS = 16           # 惯性更新定时器间隔 ms
LOG_ITEM_HEIGHT = 20            # 日志项固定高度（像素）


# ----------------- 数据库管理 -----------------
class DatabaseManager:
    def __init__(self, path=DB_FILE):
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
        c = conn.cursor()
        c.execute("SELECT timestamp, window_name, screenshot_name FROM records ORDER BY timestamp ASC")
        rows = c.fetchall()
        conn.close()
        return rows
    

# ----------------- 截图线程（后台） -----------------
class ScreenshotThread(QThread):
    log_signal = pyqtSignal(str)

    def __init__(self, interval=DEFAULT_INTERVAL, output_dir=DEFAULT_OUTPUT_DIR, db=None):
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

    def _save_thumbnail(self, src_path):
        """生成并保存缩略图（与原图同文件夹，后缀 _thumb.jpg）"""
        try:
            thumb_path = os.path.splitext(src_path)[0] + "_thumb.jpg"
            with Image.open(src_path) as im:
                im = ImageOps.exif_transpose(im)
                im.thumbnail(THUMB_SIZE)
                im.save(thumb_path, "JPEG", quality=80)
            return thumb_path
        except Exception as e:
            logging.exception("生成缩略图失败: %s", e)
            return None

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

        # 生成缩略图（缓存）
        thumb = self._save_thumbnail(fname)
        if thumb:
            self.log_signal.emit(f"[✓] 生成缩略图: {thumb}")

        # 排除本应用窗口（根据前台句柄 + 标题 + PID）
        try:
            my_hwnd = win32gui.GetForegroundWindow()
            current_pid = os.getpid()  # 当前 Python 进程 PID

            def enum_callback(hwnd, results):
                try:
                    if not win32gui.IsWindowVisible(hwnd):
                        return True
                    # 获取窗口所属进程 PID
                    try:
                        _, pid = win32process.GetWindowThreadProcessId(hwnd)
                    except Exception:
                        pid = None
                    # 排除属于当前进程的窗口（包括时间轴、预览弹窗等）
                    if pid is not None and pid == current_pid:
                        return True
                    title = win32gui.GetWindowText(hwnd)
                    # 仍然排除前台窗口句柄本身（避免记录触发截图时的切换窗口）
                    if title and APP_TITLE not in title and hwnd != my_hwnd:
                        results.append(title)
                except Exception:
                    pass
                return True

            wins = []
            win32gui.EnumWindows(enum_callback, wins)
            for w in wins:
                self.db.insert(ts, w, os.path.basename(fname))
            self.log_signal.emit(f"[DB] 记录 {len(wins)} 窗口 (已排除本应用窗口)")
        except Exception as e:
            logging.exception("枚举窗口失败: %s", e)


# ----------------- 详情对话框（点击时弹出，显示所有窗口名） -----------------
class DetailDialog(QDialog):
    def __init__(self, filename, records, parent=None):
        """
        filename: 截图文件名（例如 screen_2025-10-07 12-00-00.png）
        records: 列表 [(timestamp, window_name, screenshot_name), ...]  — 所有与该文件相关的记录
        """
        super().__init__(parent)
        self.setWindowTitle("时间点详情")
        self.resize(520, 460)
        layout = QVBoxLayout(self)

        # 缩略图或占位
        thumb = os.path.splitext(os.path.join(DEFAULT_OUTPUT_DIR, filename))[0] + "_thumb.jpg"
        if not os.path.exists(thumb):
            thumb = os.path.join(DEFAULT_OUTPUT_DIR, filename)
        img_label = QLabel()
        img_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        if os.path.exists(thumb):
            pix = QPixmap(thumb)
            if not pix.isNull():
                img_label.setPixmap(pix.scaled(480, 260, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            else:
                img_label.setText("[无法显示缩略图]")
        else:
            img_label.setText("[截图丢失]")

        layout.addWidget(img_label)

        # 显示所有窗口名称（可滚动）
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

        # 按钮：打开图片 / 复制信息 / 关闭
        buttons = QDialogButtonBox()
        open_btn = QPushButton("打开图片")
        copy_btn = QPushButton("复制所有窗口名")
        close_btn = QPushButton("关闭")
        buttons.addButton(open_btn, QDialogButtonBox.ButtonRole.ActionRole)
        buttons.addButton(copy_btn, QDialogButtonBox.ButtonRole.ActionRole)
        buttons.addButton(close_btn, QDialogButtonBox.ButtonRole.RejectRole)
        layout.addWidget(buttons)

        def open_image():
            path = os.path.join(DEFAULT_OUTPUT_DIR, filename)
            if os.path.exists(path):
                QDesktopServices.openUrl(QUrl.fromLocalFile(os.path.abspath(path)))

        def copy_info():
            clipboard = QApplication.clipboard()
            text = "\n".join([f"{ts} | {wn}" for ts, wn, _ in records])
            clipboard.setText(text)

        open_btn.clicked.connect(open_image)
        copy_btn.clicked.connect(copy_info)
        close_btn.clicked.connect(self.reject)

# ----------------- 预览弹窗（Tooltip 风格） -----------------
class PreviewPopup(QFrame):
    def __init__(self, parent=None):
        # 使用弹出窗口风格，确保预览可见
        super().__init__(parent)
        # 设置窗口标志，使其浮动在最顶层
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
        self.img_label.setMinimumSize(THUMB_SIZE[0], THUMB_SIZE[1])
        self.img_label.setStyleSheet("background-color: #2a2a2a; border-radius: 4px;")

        self.title_label = QLabel()
        self.title_label.setWordWrap(True)
        self.title_label.setMaximumWidth(THUMB_SIZE[0] + 20)

        self.time_label = QLabel()

        v = QVBoxLayout(self)
        v.setContentsMargins(6, 6, 6, 6)
        v.setSpacing(6)
        v.addWidget(self.img_label)
        v.addWidget(self.title_label)
        v.addWidget(self.time_label)
        self.setVisible(False)
        self._last_file = None

    def show_preview(self, thumb_path, window_name, timestamp, global_pos: QPoint):
        # 仅在切换文件时重新加载图片
        if thumb_path and os.path.exists(thumb_path) and thumb_path != self._last_file:
            try:
                pix = QPixmap(thumb_path)
                if not pix.isNull():
                    scaled_pix = pix.scaled(
                        THUMB_SIZE[0], THUMB_SIZE[1],
                        Qt.AspectRatioMode.KeepAspectRatio,
                        Qt.TransformationMode.SmoothTransformation
                    )
                    self.img_label.setPixmap(scaled_pix)
                    self._last_file = thumb_path
                else:
                    self.img_label.setText("[无法加载缩略图]")
                    self.img_label.setStyleSheet("background-color: #2a2a2a; color: #ff6b6b; border-radius: 4px;")
            except Exception as e:
                logging.exception(f"预览加载失败: {e}")
                self.img_label.setText(f"[预览错误]")
                self.img_label.setStyleSheet("background-color: #2a2a2a; color: #ff6b6b; border-radius: 4px;")
        elif not thumb_path or not os.path.exists(thumb_path):
            self.img_label.setText("[缩略图丢失]")
            self.img_label.setStyleSheet("background-color: #2a2a2a; color: #ff6b6b; border-radius: 4px;")

        # 限制窗口名称长度
        display_name = window_name
        if len(display_name) > 40:
            display_name = display_name[:37] + "..."
        self.title_label.setText(f"窗口：{display_name}")
        self.time_label.setText(f"时间：{timestamp}")

        # 放在鼠标右下方（避免遮挡轨道），并确保不超出屏幕
        screen_rect = QApplication.primaryScreen().availableGeometry()
        x = global_pos.x() + 16
        y = global_pos.y() + 16

        # 检查是否会超出屏幕右边界
        if x + self.width() > screen_rect.right():
            x = global_pos.x() - self.width() - 16
        # 检查是否会超出屏幕下边界
        if y + self.height() > screen_rect.bottom():
            y = global_pos.y() - self.height() - 16

        self.move(x, y)
        self.adjustSize()
        self.setVisible(True)
        self.raise_()  # 确保预览窗口在最顶层

    def hide_preview(self):
        self.setVisible(False)

# ----------------- 单日轨道 -----------------
class TimelineTrack(QFrame):
    def __init__(self, date_str, items, parent=None):
        """
        date_str: 'YYYY-MM-DD'
        items: list of tuples (timestamp_str 'YYYY-MM-DD HH:MM:SS', window_name, filename)
        """
        super().__init__(parent)
        self.date = date_str
        self.items = sorted(items, key=lambda x: x[0])
        self.setMinimumHeight(220)
        self.setMouseTracking(True)
        self.preview = PreviewPopup(self)
        self.setStyleSheet("background-color: #0f0f0f; border-radius:6px; margin-bottom:8px;")
        self._positions = []       # [(x, (ts,win,fn))]
        self._ticks = []           # [(x, label_str)]
        self._left_margin = 60
        self._right_margin = 60
        self._zoom_factor = 1.0    # 缩放因子
        self._min_zoom = 0.5       # 最小缩放
        self._max_zoom = 8.0       # 最大缩放
        self._pan_offset_seconds = 0.0  # 平移偏移（秒）
        # Drag state
        self._is_dragging = False
        self._drag_start_x = None
        self._drag_start_offset = 0.0
        self._press_x = None
        # For velocity calculation (deque of (x, t))
        self._pos_samples = deque(maxlen=6)
        # Inertia timer & velocity (px/sec)
        self._inertia_timer = QTimer(self)
        self._inertia_timer.setInterval(INERTIA_TIMER_MS)
        self._inertia_timer.timeout.connect(self._on_inertia_tick)
        self._inertia_vx = 0.0
        self._prepare_positions_and_ticks()

    def _prepare_positions_and_ticks(self):
        # Called at creation and during resize to compute positions and tick labels
        self._positions = []
        self._ticks = []
        if not self.items:
            return

        # 时间转为 datetime
        times = [datetime.strptime(ts, "%Y-%m-%d %H:%M:%S") for ts, _, _ in self.items]
        real_min, real_max = min(times), max(times)

        # Apply zoom: compute center as midpoint, then apply pan offset and zoom factor
        center = real_min + (real_max - real_min) / 2
        total_span = max((real_max - real_min).total_seconds(), 1.0)
        zoom_span = total_span / self._zoom_factor

        # center shifted by pan offset (seconds)
        center = center + timedelta(seconds=self._pan_offset_seconds)
        tmin = center - timedelta(seconds=zoom_span / 2)
        tmax = center + timedelta(seconds=zoom_span / 2)
        span_seconds = max((tmax - tmin).total_seconds(), 1.0)

        # Prepare tick labels: try to produce ~TICK_TARGET ticks with "nice" intervals
        approx_interval = span_seconds / max(1, (TICK_TARGET - 1))
        nice_units = [60, 300, 600, 900, 1800, 3600, 7200, 14400]  # seconds: 1m,5m,10m,15m,30m,1h,2h,4h
        tick_interval = min(nice_units, key=lambda u: abs(u - approx_interval))

        start_epoch = int(tmin.timestamp())
        end_epoch = int(tmax.timestamp())
        first_tick = (start_epoch // tick_interval) * tick_interval
        ticks = list(range(first_tick, end_epoch + tick_interval, tick_interval))

        avail_w = max(10, self.width() - self._left_margin - self._right_margin)

        for ts, win, fn in self.items:
            t = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
            rel = (t.timestamp() - tmin.timestamp()) / span_seconds
            x = int(self._left_margin + rel * avail_w)
            self._positions.append((x, (ts, win, fn)))

        for te in ticks:
            if te < int(tmin.timestamp()) or te > int(tmax.timestamp()):
                continue
            rel = (te - tmin.timestamp()) / span_seconds
            x = int(self._left_margin + rel * avail_w)
            label = datetime.fromtimestamp(te).strftime("%H:%M")
            self._ticks.append((x, label))

    def resizeEvent(self, e):
        # Recompute positions & ticks on resize
        self._prepare_positions_and_ticks()
        super().resizeEvent(e)

    def paintEvent(self, e):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # TOP ruler line and ticks
        top_y = 28
        painter.setPen(QPen(QColor("#4fc1ff"), 2))
        painter.drawLine(self._left_margin, top_y, self.width() - self._right_margin, top_y)
        # small ticks along top using same _ticks
        painter.setPen(QPen(QColor("#88cfff"), 1))
        for x, label in self._ticks:
            painter.drawLine(x, top_y - 6, x, top_y + 6)
            painter.drawText(x - 25, top_y - 18, 50, 14, Qt.AlignmentFlag.AlignCenter, label)

        # 主时间轨道线 (lower)
        line_y = self.height() // 2
        pen_line = QPen(QColor("#2f9cff"))
        pen_line.setWidth(3)
        painter.setPen(pen_line)
        left = self._left_margin
        right = self.width() - self._right_margin
        painter.drawLine(left, line_y, right, line_y)

        # 绘制无记录时间区间（灰色虚线）
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

        # 绘制记录点（不密集时显示）
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

        # 绘制图例与缩放标注
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
        # 鼠标滚轮缩放（同时以鼠标位置为中心进行缩放）
        old_zoom = self._zoom_factor
        delta = event.angleDelta().y()
        zoom_delta = 0.12 if delta > 0 else -0.12
        # compute mouse-relative center pan preservation
        mx = event.position().x()
        # compute current span and center
        times = [datetime.strptime(ts, "%Y-%m-%d %H:%M:%S") for ts, _, _ in self.items]
        if not times:
            return
        real_min, real_max = min(times), max(times)
        total_span = max((real_max - real_min).total_seconds(), 1.0)
        old_zoom = self._zoom_factor
        self._zoom_factor = max(self._min_zoom, min(self._max_zoom, self._zoom_factor + zoom_delta))
        if self._zoom_factor != old_zoom:
            # adjust pan_offset_seconds so that the timestamp under mouse stays same
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
            new_tmin = new_center - timedelta(seconds=new_zoom_span / 2)
            desired_center = ts_under_mouse - timedelta(seconds=new_zoom_span * (rel - 0.5))
            center_nominal = real_min + (real_max - real_min) / 2
            new_pan_offset = (desired_center - center_nominal).total_seconds()
            self._pan_offset_seconds = new_pan_offset
            self._prepare_positions_and_ticks()
            self.update()

        event.accept()

    def mousePressEvent(self, e):
        # 开始可能的拖动（左键）
        if e.button() == Qt.MouseButton.LeftButton:
            self._press_x = e.position().x()
            self._drag_start_x = e.position().x()
            self._drag_start_offset = self._pan_offset_seconds
            self._is_dragging = False  # until movement exceeds threshold
            self.setCursor(Qt.CursorShape.ClosedHandCursor)
            # clear samples
            self._pos_samples.clear()
            now = time.time()
            self._pos_samples.append((self._drag_start_x, now))
            # stop any running inertia
            if self._inertia_timer.isActive():
                self._inertia_timer.stop()
                self._inertia_vx = 0.0
        super().mousePressEvent(e)

    def mouseMoveEvent(self, e):
        # store sample for velocity
        now = time.time()
        mx = e.position().x()
        self._pos_samples.append((mx, now))

        # If left button is down and dragging
        buttons = QApplication.mouseButtons()
        if buttons & Qt.MouseButton.LeftButton and self._drag_start_x is not None:
            dx = e.position().x() - self._drag_start_x
            if not self._is_dragging and abs(dx) >= DRAG_THRESHOLD:
                # 开始真正的拖动
                self._is_dragging = True
            if self._is_dragging:
                # 计算平移量（像素 -> 时间秒）
                times = [datetime.strptime(ts, "%Y-%m-%d %H:%M:%S") for ts, _, _ in self.items]
                real_min, real_max = min(times), max(times)
                total_span = max((real_max - real_min).total_seconds(), 1.0)
                zoom_span = total_span / self._zoom_factor
                avail_w = max(10, self.width() - self._left_margin - self._right_margin)
                sec_per_px = zoom_span / max(1.0, avail_w)
                delta_seconds = -dx * sec_per_px
                self._pan_offset_seconds = self._drag_start_offset + delta_seconds
                self._prepare_positions_and_ticks()
                self.update()
                return  # do not show preview while dragging

        # 非拖动：显示悬浮预览（靠近点显示）
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
            if best_dx is not None and best_dx <= MIN_HIT_DIST:
                x, (ts, win, fn) = closest
                thumb_path = os.path.splitext(os.path.join(DEFAULT_OUTPUT_DIR, fn))[0] + "_thumb.jpg"
                if not os.path.exists(thumb_path):
                    thumb_path = os.path.join(DEFAULT_OUTPUT_DIR, fn)
                global_pos = self.mapToGlobal(e.position().toPoint())
                self.preview.show_preview(thumb_path, win, ts, global_pos)
            else:
                self.preview.hide_preview()

        super().mouseMoveEvent(e)

    def mouseReleaseEvent(self, e):
        # Left release: either end of drag or click
        if e.button() == Qt.MouseButton.LeftButton:
            # If dragging -> compute velocity and start inertia
            if self._is_dragging:
                # compute velocity from samples
                if len(self._pos_samples) >= 2:
                    x0, t0 = self._pos_samples[0]
                    x1, t1 = self._pos_samples[-1]
                    dt = t1 - t0
                    if dt > 0:
                        vx = (x1 - x0) / dt   # px/sec
                        self._inertia_vx = vx
                    else:
                        self._inertia_vx = 0.0
                else:
                    self._inertia_vx = 0.0

                self._is_dragging = False
                self._drag_start_x = None
                self._press_x = None
                self.setCursor(Qt.CursorShape.ArrowCursor)
                # start inertia if velocity significant
                if abs(self._inertia_vx) >= INERTIA_MIN_V:
                    if not self._inertia_timer.isActive():
                        self._inertia_timer.start()
                return

            # 非拖动：短按（点击）处理 —— 如果点击位置接近某点，打开详情对话框
            mx = e.position().x()
            for x, (ts, win, fn) in self._positions:
                if abs(mx - x) <= MIN_HIT_DIST:
                    # 在显示详情前先隐藏预览
                    self.preview.hide_preview()
                    # 收集该文件在本轨道（当天）所有记录（包含同名多窗口）
                    related = [(tss, wwn, ffn) for tss, wwn, ffn in self.items if ffn == fn]
                    # 弹出详情对话框，传入文件名与 records 列表
                    dlg = DetailDialog(fn, related, parent=self.window())
                    dlg.exec()
                    break

            # 恢复状态
            self._drag_start_x = None
            self._press_x = None
            self.setCursor(Qt.CursorShape.ArrowCursor)

        super().mouseReleaseEvent(e)

    def _on_inertia_tick(self):
        # Called regularly to apply inertia velocity (px/sec) -> pan offset seconds
        if abs(self._inertia_vx) < INERTIA_MIN_V:
            self._inertia_timer.stop()
            self._inertia_vx = 0.0
            return

        # compute seconds per pixel using current zoom/span
        times = [datetime.strptime(ts, "%Y-%m-%d %H:%M:%S") for ts, _, _ in self.items]
        if not times:
            self._inertia_timer.stop()
            self._inertia_vx = 0.0
            return
        real_min, real_max = min(times), max(times)
        total_span = max((real_max - real_min).total_seconds(), 1.0)
        zoom_span = total_span / self._zoom_factor
        avail_w = max(10, self.width() - self._left_margin - self._right_margin)
        sec_per_px = zoom_span / max(1.0, avail_w)

        # apply movement for this timer tick
        dt = INERTIA_TIMER_MS / 1000.0
        delta_seconds = - self._inertia_vx * sec_per_px * dt
        self._pan_offset_seconds += delta_seconds
        self._prepare_positions_and_ticks()
        self.update()

        # apply friction
        self._inertia_vx *= INERTIA_FRICTION
        # if too small stop
        if abs(self._inertia_vx) < INERTIA_MIN_V:
            self._inertia_timer.stop()
            self._inertia_vx = 0.0

# ----------------- 时间轴视图（包含搜索） -----------------
class TimelineViewer(QDialog):
    def __init__(self, db: DatabaseManager, parent=None):
        super().__init__(parent)
        self.setWindowTitle("时间轴（实体线 + 悬浮预览 + 拖动平移 + 惯性 + 刻度尺）")
        self.resize(1000, 700)
        self.db = db
        self.init_ui()

    def init_ui(self):
        main_v = QVBoxLayout(self)

        # 搜索与提示
        search_layout = QHBoxLayout()
        self.search_edit = QLineEdit()
        self.search_edit.setPlaceholderText("🔍 搜索窗口名或截图名（模糊）")
        self.search_edit.textChanged.connect(self.load_data)
        search_layout.addWidget(self.search_edit)
        hint = QLabel("🖱️ 拖动平移 · 惯性滑动 · 滚轮缩放 · 点击点查看详情")
        hint.setStyleSheet("color:#88cfff;")
        search_layout.addWidget(hint)
        main_v.addLayout(search_layout)

        # 滚动容器
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.container = QWidget()
        self.vlayout = QVBoxLayout(self.container)
        self.vlayout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.scroll.setWidget(self.container)
        main_v.addWidget(self.scroll)

        self.load_data()

    def load_data(self):
        # 清空
        while self.vlayout.count():
            it = self.vlayout.takeAt(0)
            if it.widget():
                it.widget().deleteLater()

        keyword = self.search_edit.text().strip().lower()
        rows = self.db.fetch_all()
        if keyword:
            rows = [r for r in rows if keyword in r[1].lower() or keyword in r[2].lower()]

        if not rows:
            label = QLabel("暂无记录")
            label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.vlayout.addWidget(label)
            return

        # 按日期分组（升序）
        grouped = {}
        for ts, wn, fn in rows:
            d = ts.split(" ")[0]
            grouped.setdefault(d, []).append((ts, wn, fn))

        for d in sorted(grouped.keys()):
            items = sorted(grouped[d], key=lambda x: x[0])
            title = QLabel(f"📅 {d}")
            title.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
            title.setStyleSheet("color:#8fd8ff; margin-top:8px;")
            self.vlayout.addWidget(title)

            track = TimelineTrack(d, items, parent=self)
            # compute positions / ticks
            track._prepare_positions_and_ticks()
            self.vlayout.addWidget(track)

# ----------------- 主窗口 -----------------
class WindowRecorderApp(QMainWindow):
    def __init__(self, parent=None):
        super().__init__(parent)  # 设置父窗口
        self.db = DatabaseManager()
        self.thread = None
        self.init_ui()

    def init_ui(self):
        self.setWindowTitle(APP_TITLE)
        self.resize(520, 600)
        central = QWidget()
        self.setCentralWidget(central)
        v = QVBoxLayout(central)

        title = QLabel(APP_TITLE)
        title.setFont(QFont("Microsoft YaHei", 16, QFont.Weight.Bold))
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.addWidget(title)

        self.status_label = QLabel("状态：未开始")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.addWidget(self.status_label)

        # 日志区域 -> 使用 QListWidget 保证统一行高
        self.log_list = QListWidget()
        self.log_list.setSpacing(2)
        self.log_list.setUniformItemSizes(True)
        v.addWidget(self.log_list, stretch=1)

        # 按钮栏
        h = QHBoxLayout()
        self.start_btn = QPushButton("开始")
        self.stop_btn = QPushButton("停止")
        self.view_btn = QPushButton("时间轴预览")
        h.addWidget(self.start_btn)
        h.addWidget(self.stop_btn)
        h.addWidget(self.view_btn)
        v.addLayout(h)

        self.start_btn.clicked.connect(self.start_record)
        self.stop_btn.clicked.connect(self.stop_record)
        self.view_btn.clicked.connect(self.open_timeline)
        self.stop_btn.setEnabled(False)

    def add_log(self, msg):
        # 统一行高，避免视觉不一致
        item = QListWidgetItem(msg)
        item.setSizeHint(QSize(0, LOG_ITEM_HEIGHT))
        self.log_list.addItem(item)
        self.log_list.scrollToBottom()

    def start_record(self):
        if not self.thread or not self.thread.isRunning():
            self.thread = ScreenshotThread(DEFAULT_INTERVAL, DEFAULT_OUTPUT_DIR, self.db)
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
        viewer = TimelineViewer(self.db, parent=self)
        viewer.exec()
        

# ----------------- 启动入口 -----------------
def create_window(parent=None):
    """创建并返回WindowRecorder窗口实例"""
    logging.info("[WindowRecorder] 创建窗口")
    win = WindowRecorderApp(parent)
    win.show()
    return win

def main():
    """独立运行时的入口点"""
    logging.info("[WindowRecorder] 独立启动")
    app = QApplication(sys.argv)
    app.setFont(QFont("Microsoft YaHei", 10))
    win = create_window()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
=======
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
>>>>>>> fb79ad24413b96a55fb169f828d2aa06e0f4cc88
