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
    QDialogButtonBox, QListWidget, QListWidgetItem, QSystemTrayIcon, QMenu,
    QGraphicsDropShadowEffect
)
from PyQt6.QtGui import QFont, QPixmap, QPainter, QPen, QColor, QDesktopServices, QIcon
from PyQt6.QtCore import Qt, pyqtSignal, QThread, QUrl, QPoint, QTimer, QSize, QRect


CONFIG = {
    "interval": 60,
    "screenshots_dir": "screenshots",
    "db_file": "window_records.db",
    "days_to_keep": 3,
    "thumb_size": [240, 140], # 重新添加缩略图尺寸配置
    "min_hit_dist": 30,
    "tick_target": 6,
    "drag_threshold": 6,
    "inertia_friction": 0.92,
    "inertia_min_v": 10,
    "inertia_timer_ms": 16,
    "log_item_height": 20,
    "log_file": "window_recorder.log",
    "log_level": "INFO"
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
        logging.info(f"[WindowRecorder] 数据库管理器已初始化，路径: {self.path}")

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
        logging.info("[WindowRecorder] 数据库表结构已确认")

    def insert(self, ts, win, fname):
        try:
            conn = sqlite3.connect(self.path)
            c = conn.cursor()
            c.execute("INSERT INTO records (timestamp, window_name, screenshot_name) VALUES (?, ?, ?)",
                      (ts, win, fname))
            conn.commit()
            conn.close()
            logging.debug(f"[WindowRecorder] 成功插入记录: {ts}, {win}, {fname}")
        except Exception as e:
            logging.exception("[WindowRecorder] 插入数据库失败")

    def cleanup_old_records(self, days_to_keep=3, screenshots_dir="screenshots"):
        cutoff_date = datetime.now() - timedelta(days=days_to_keep)
        cutoff_ts = cutoff_date.strftime("%Y-%m-%d %H:%M:%S")
        logging.info(f"[WindowRecorder] 开始清理 {cutoff_ts} 之前的旧记录...")

        conn = sqlite3.connect(self.path)
        c = conn.cursor()
        try:
            c.execute("SELECT DISTINCT screenshot_name FROM records WHERE timestamp < ?", (cutoff_ts,))
            files_to_delete = [row[0] for row in c.fetchall()]
            
            c.execute("DELETE FROM records WHERE timestamp < ?", (cutoff_ts,))
            deleted_rows = c.rowcount
            conn.commit()
            if deleted_rows > 0:
                logging.info(f"[WindowRecorder] 从数据库中删除了 {deleted_rows} 条旧记录。")

            deleted_files_count = 0
            for fname in files_to_delete:
                fpath = os.path.join(screenshots_dir, fname)
                if os.path.exists(fpath):
                    try:
                        os.remove(fpath)
                        deleted_files_count += 1
                    except Exception as e:
                        logging.error(f"[WindowRecorder] 删除截图失败 {fpath}: {e}")
            if deleted_files_count > 0:
                logging.info(f"[WindowRecorder] 删除了 {deleted_files_count} 个旧截图文件。")
        except Exception as e:
            logging.exception("[WindowRecorder] 清理旧记录时出错")
            conn.rollback()
        finally:
            conn.close()

    def fetch_all(self):
        logging.info("[WindowRecorder] 正在从数据库获取所有记录")
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row 
        c = conn.cursor()
        c.execute("SELECT timestamp, window_name, screenshot_name FROM records ORDER BY timestamp ASC")
        rows = c.fetchall()
        conn.close()
        logging.info(f"[WindowRecorder] 成功获取 {len(rows)} 条记录")
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
        logging.info(f"[WindowRecorder] 截图线程已初始化，间隔: {self.interval}s, 输出目录: {self.output_dir}")

    def run(self):
        self.running = True
        logging.info(f"[WindowRecorder] 截图线程开始运行，间隔: {self.interval}s")
        self.log_signal.emit(f"开始截图，每 {self.interval}s")
        while self.running:
            try:
                self.capture_screen()
                for _ in range(self.interval):
                    if not self.running:
                        break
                    time.sleep(1)
            except Exception as e:
                logging.exception("[WindowRecorder] 截图线程异常")
                self.log_signal.emit(f"[错误] {e}")
                for _ in range(self.interval):
                    if not self.running:
                        break
                    time.sleep(1)

    def stop(self):
        self.running = False
        logging.info("[WindowRecorder] 正在停止截图线程...")
        self.wait()
        logging.info("[WindowRecorder] 截图线程已停止")
        self.log_signal.emit("截图线程已停止")

    def timestamp(self):
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def capture_screen(self):
        ts = self.timestamp()
        safe_ts = ts.replace(":", "-")
        fname = os.path.join(self.output_dir, f"screen_{safe_ts}.png")
        logging.info(f"[WindowRecorder] 准备截图: {fname}")

        try:
            img = pyautogui.screenshot()
            img.save(fname)
            logging.info(f"[WindowRecorder] 截图成功保存至: {fname}")
            self.log_signal.emit(f"[✓] 截图: {fname}")
        except Exception as e:
            logging.exception("[WindowRecorder] 保存截图失败")
            self.log_signal.emit(f"[错误] 截图保存失败：{e}")
            return

        try:
            my_hwnd = win32gui.GetForegroundWindow()
            current_pid = os.getpid()
            wins = []
            logging.info("[WindowRecorder] 开始枚举窗口")

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
            logging.info(f"[WindowRecorder] 枚举到 {len(wins)} 个窗口")

            for w in wins:
                self.db.insert(ts, w, os.path.basename(fname))

            self.log_signal.emit(f"[DB] 成功记录 {len(wins)} 个窗口")
            if not wins:
                self.log_signal.emit("[警告] 未检测到可见窗口（可能被全部最小化或权限不足）")

        except Exception as e:
            logging.exception("[WindowRecorder] 枚举窗口失败")
            self.log_signal.emit(f"[错误] 枚举窗口失败：{e}")


class DetailDialog(QDialog):
    def __init__(self, filename, records, parent=None):
        super().__init__(parent)
        self.setWindowTitle("时间点详情")
        self.resize(600, 700)
        layout = QVBoxLayout(self)
        logging.info(f"[WindowRecorder] 打开详情对话框，截图: {filename}, 关联记录数: {len(records)}")

        img_path = os.path.join(CONFIG["screenshots_dir"], filename)
        img_label = QLabel()
        img_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        if os.path.exists(img_path):
            pix = QPixmap(img_path)
            if not pix.isNull():
                img_label.setPixmap(pix.scaled(560, 360, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            else:
                img_label.setText("[无法显示图像]")
                logging.warning(f"[WindowRecorder] 无法加载图像: {img_path}")
        else:
            img_label.setText("[截图丢失]")
            logging.warning(f"[WindowRecorder] 截图文件丢失: {img_path}")

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
                logging.info(f"[WindowRecorder] 正在打开图片: {path}")
                QDesktopServices.openUrl(QUrl.fromLocalFile(os.path.abspath(path)))
            else:
                logging.warning(f"[WindowRecorder] 尝试打开但图片不存在: {path}")

        def copy_info():
            clipboard = QApplication.clipboard()
            text = "\n".join([f"{ts} | {wn}" for ts, wn, _ in records])
            clipboard.setText(text)
            logging.info(f"[WindowRecorder] 已复制 {len(records)} 条窗口信息到剪贴板")

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
        self.setStyleSheet("background: transparent;")

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(15, 15, 15, 15)

        content_frame = QFrame()
        content_frame.setStyleSheet("""
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
        main_layout.addWidget(content_frame)

        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(15)
        shadow.setColor(QColor(0, 0, 0, 160))
        shadow.setOffset(0, 4)
        content_frame.setGraphicsEffect(shadow)

        v = QVBoxLayout(content_frame)
        v.setContentsMargins(6, 6, 6, 6)
        v.setSpacing(6)

        self.title_label = QLabel()
        self.title_label.setWordWrap(True)
        self.title_label.setMaximumWidth(260) # Fixed width for text-only popup

        self.time_label = QLabel()

        v.addWidget(self.title_label)
        v.addWidget(self.time_label)
        self.setVisible(False)
        self._last_file = None
        logging.info("[WindowRecorder] 预览弹出窗口已创建")

    def show_preview(self, img_path, window_name, timestamp, global_pos: QPoint):
        # 移除图片加载和显示逻辑，只显示文本
        display_name = window_name
        if len(display_name) > 40:
            display_name = display_name[:37] + "..."
        self.title_label.setText(f"窗口：{display_name}")
        self.time_label.setText(f"时间：{timestamp}")

        screen_rect = QApplication.primaryScreen().availableGeometry()
        x = global_pos.x() + 16
        y = global_pos.y() + 16

        self.adjustSize() # Adjust size based on text content
        if x + self.width() > screen_rect.right():
            x = global_pos.x() - self.width() - 16
        if y + self.height() > screen_rect.bottom():
            y = global_pos.y() - self.height() - 16

        self.move(x, y)
        self.setVisible(True)
        self.raise_()
        logging.debug(f"[WindowRecorder] 显示预览: {window_name} @ {timestamp}")

    def hide_preview(self):
        self.setVisible(False)
        logging.debug("[WindowRecorder] 隐藏预览")


class TimelineTrack(QFrame):
    def __init__(self, date_str, items, parent=None):
        super().__init__(parent)
        self.date = date_str
        self.items_parsed = []
        for ts_str, wn, fn in items:
            try:
                dt_obj = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
                self.items_parsed.append((dt_obj, wn, fn, ts_str))
            except ValueError:
                logging.warning(f"[WindowRecorder] 无法解析时间戳: {ts_str}")
                continue
        self.items_parsed.sort(key=lambda x: x[0])
        logging.info(f"[WindowRecorder] 创建时间轴轨迹: {date_str}, {len(self.items_parsed)} 个项目")

        self.setMinimumHeight(280)
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
        self._center_time = None
        self._center_item_info = None
        self._center_pixmap = None # 重新添加
        self._center_pixmap_path = None # 重新添加
        self._prepare_positions_and_ticks()

    def leaveEvent(self, event):
        self.preview.hide_preview()
        super().leaveEvent(event)

    def _prepare_positions_and_ticks(self):
        logging.debug("[WindowRecorder] 准备时间轴位置和刻度")
        self._positions = []
        self._ticks = []
        if not self.items_parsed:
            self._center_time = None
            self._center_item_info = None
            return

        times = [dt_obj for dt_obj, _, _, _ in self.items_parsed]
        real_min, real_max = min(times), max(times)

        center = real_min + (real_max - real_min) / 2
        total_span = max((real_max - real_min).total_seconds(), 1.0)
        zoom_span = total_span / self._zoom_factor;

        center = center + timedelta(seconds=self._pan_offset_seconds)
        self._center_time = center
        tmin = center - timedelta(seconds=zoom_span / 2)
        tmax = center + timedelta(seconds=zoom_span / 2)
        span_seconds = max((tmax - tmin).total_seconds(), 1.0)

        closest_item = min(self.items_parsed, key=lambda item: abs((item[0] - self._center_time).total_seconds()))
        self._center_item_info = closest_item
        
        # 重新添加中心图片预览的加载逻辑
        if self._center_item_info:
            fn = self._center_item_info[2]
            if self._center_pixmap_path != fn:
                img_path = os.path.join(CONFIG["screenshots_dir"], fn)
                if os.path.exists(img_path):
                    self._center_pixmap = QPixmap(img_path)
                    self._center_pixmap_path = fn
                else:
                    self._center_pixmap = None
                    self._center_pixmap_path = None
        else:
            self._center_pixmap = None
            self._center_pixmap_path = None

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
        logging.debug(f"[WindowRecorder] 时间轴轨迹大小调整为: {e.size()}")
        self._prepare_positions_and_ticks()
        super().resizeEvent(e)

    def paintEvent(self, e):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # --- Timeline Area ---
        timeline_area_height = 100
        top_y = 28
        line_y = 60

        painter.setPen(QPen(QColor("#4fc1ff"), 2))
        painter.drawLine(self._left_margin, top_y, self.width() - self._right_margin, top_y)
        painter.setPen(QPen(QColor("#88cfff"), 1))
        for x, label in self._ticks:
            painter.drawLine(x, top_y - 6, x, top_y + 6)
            painter.drawText(x - 25, top_y - 18, 50, 14, Qt.AlignmentFlag.AlignCenter, label)

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

        legend_y = timeline_area_height - 15
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

        # --- Separator ---
        painter.setPen(QPen(QColor("#333333")))
        painter.drawLine(20, timeline_area_height, self.width() - 20, timeline_area_height)

        # --- Preview Area ---
        if self._center_item_info:
            dt_obj, wn, fn, ts_str = self._center_item_info
            
            preview_top_y = timeline_area_height + 20
            thumb_h = 140
            thumb_w = int(thumb_h * 16/9)
            
            if self._center_pixmap and not self._center_pixmap.isNull():
                scaled_pix = self._center_pixmap.scaled(
                    thumb_w, thumb_h, 
                    Qt.AspectRatioMode.KeepAspectRatio, 
                    Qt.TransformationMode.SmoothTransformation
                )
                thumb_x = self._left_margin
                painter.setPen(QPen(QColor("#555")))
                painter.drawRect(thumb_x -1, preview_top_y -1, scaled_pix.width() + 2, scaled_pix.height() + 2)
                painter.drawPixmap(thumb_x, preview_top_y, scaled_pix)

                text_x = thumb_x + scaled_pix.width() + 20
                text_rect = QRect(text_x, preview_top_y, self.width() - text_x - self._right_margin, thumb_h)
                
                painter.setPen(QPen(QColor("#ddd")))
                font = painter.font()
                font.setPointSize(11)
                font.setBold(True)
                painter.setFont(font)
                
                ts_rect = QRect(text_rect.x(), text_rect.y(), text_rect.width(), 25)
                painter.drawText(ts_rect, Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop, f"时间: {ts_str}")

                font.setPointSize(10)
                font.setBold(False)
                painter.setFont(font)

                wn_rect = QRect(text_rect.x(), text_rect.y() + 30, text_rect.width(), text_rect.height() - 60)
                painter.drawText(wn_rect, Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop | Qt.TextFlag.TextWordWrap, f"窗口: {wn}")

                painter.setPen(QPen(QColor("#888")))
                fn_rect = QRect(text_rect.x(), text_rect.y() + text_rect.height() - 25, text_rect.width(), 25)
                painter.drawText(fn_rect, Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignBottom, f"文件: {fn}")

        elif self._center_time:
            center_time_str = self._center_time.strftime("%Y-%m-%d %H:%M:%S")
            painter.setPen(QPen(QColor("#999999")))
            preview_rect = self.rect().adjusted(0, timeline_area_height, 0, 0)
            painter.drawText(preview_rect, Qt.AlignmentFlag.AlignCenter, f"时间轴中心: {center_time_str}")

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
            logging.debug(f"[WindowRecorder] 时间轴缩放至: {self._zoom_factor:.2f}x")

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
                logging.debug("[WindowRecorder] 惯性滚动已停止")
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
                logging.debug("[WindowRecorder] 开始拖拽时间轴")
            if self._is_dragging:
                if not self.items_parsed:
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
                logging.debug("[WindowRecorder] 结束拖拽时间轴")
                self._drag_start_x = None
                self._press_x = None
                self.setCursor(Qt.CursorShape.ArrowCursor)
                if abs(self._inertia_vx) >= CONFIG['inertia_min_v']:
                    if not self._inertia_timer.isActive():
                        self._inertia_timer.start()
                        logging.debug(f"[WindowRecorder] 开始惯性滚动，初速度: {self._inertia_vx:.2f}")
                return

            mx = e.position().x()
            for x, (ts, win, fn) in self._positions:
                if abs(mx - x) <= CONFIG['min_hit_dist']:
                    self.preview.hide_preview()
                    related = [(original_ts_str, original_wn, original_fn) 
                               for _, original_wn, original_fn, original_ts_str in self.items_parsed 
                               if original_fn == fn]
                    dlg = DetailDialog(fn, related, parent=self.window())
                    logging.info(f"[WindowRecorder] 在时间轴上点击，打开详情: {fn}")
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
            logging.debug("[WindowRecorder] 惯性滚动结束")
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
            logging.debug("[WindowRecorder] 惯性滚动结束")
            


class TimelineViewer(QDialog):
    def __init__(self, db: DatabaseManager, parent=None):
        super().__init__(parent)
        self.setWindowTitle("时间轴")
        self.resize(1000, 700)
        self.db = db
        self.output_dir = CONFIG['screenshots_dir']
        
        self.grouped_by_day = {}
        self.available_dates = []
        self.current_date_index = -1
        
        self.init_ui()
        logging.info("[WindowRecorder] 时间轴查看器已创建")

    def init_ui(self):
        main_v = QVBoxLayout(self)

        nav_layout = QHBoxLayout()
        self.prev_day_btn = QPushButton("◀ 前一天")
        self.current_day_label = QLabel("...")
        self.current_day_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.current_day_label.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        self.current_day_label.setStyleSheet("color:#8fd8ff;")
        self.next_day_btn = QPushButton("后一天 ▶")
        nav_layout.addWidget(self.prev_day_btn)
        nav_layout.addWidget(self.current_day_label, 1)
        nav_layout.addWidget(self.next_day_btn)
        main_v.addLayout(nav_layout)

        self.prev_day_btn.clicked.connect(self.show_prev_day)
        self.next_day_btn.clicked.connect(self.show_next_day)

        search_layout = QHBoxLayout()
        self.search_edit = QLineEdit()
        self.search_edit.setPlaceholderText("🔍 搜索窗口名（支持模糊搜索）")
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
        logging.info("[WindowRecorder] 时间轴查看器UI已初始化")

    def load_data(self):
        keyword = self.search_edit.text().strip().lower()
        logging.info(f"[WindowRecorder] 加载时间轴数据，搜索关键词: '{keyword}'")
        rows = self.db.fetch_all()
        if keyword:
            rows = [r for r in rows if keyword in r['window_name'].lower()]

        self.grouped_by_day.clear()
        for row in rows:
            ts, wn, fn = row['timestamp'], row['window_name'], row['screenshot_name']
            d = ts.split(" ")[0]
            self.grouped_by_day.setdefault(d, []).append((ts, wn, fn))

        self.available_dates = sorted(self.grouped_by_day.keys(), reverse=True)

        if self.available_dates:
            if not (0 <= self.current_date_index < len(self.available_dates)):
                self.current_date_index = 0
            self.display_current_day()
        else:
            self.clear_view()
            label = QLabel("暂无记录")
            label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.vlayout.addWidget(label)
            self.current_day_label.setText("无记录")
            self.prev_day_btn.setEnabled(False)
            self.next_day_btn.setEnabled(False)
            logging.info("[WindowRecorder] 没有找到匹配的记录")

    def display_current_day(self):
        if not (0 <= self.current_date_index < len(self.available_dates)):
            return

        self.clear_view()
        
        current_date = self.available_dates[self.current_date_index]
        items = sorted(self.grouped_by_day[current_date], key=lambda x: x[0])
        
        self.current_day_label.setText(f"📅 {current_date}")
        
        track = TimelineTrack(current_date, items, parent=self)
        self.vlayout.addWidget(track)

        self.prev_day_btn.setEnabled(self.current_date_index < len(self.available_dates) - 1)
        self.next_day_btn.setEnabled(self.current_date_index > 0)
        logging.info(f"[WindowRecorder] 显示日期: {current_date}")

    def clear_view(self):
        while self.vlayout.count():
            child = self.vlayout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

    def show_prev_day(self):
        if self.current_date_index < len(self.available_dates) - 1:
            self.current_date_index += 1
            self.display_current_day()

    def show_next_day(self):
        if self.current_date_index > 0:
            self.current_date_index -= 1
            self.display_current_day()


class WindowRecorderApp(QMainWindow):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.db = DatabaseManager()
        self.thread = None
        self._is_quitting = False
        self.is_recording = False
        
        self.interval = CONFIG['interval']
        self.output_dir = CONFIG['screenshots_dir']
        
        self.cleanup_old_data()
        self.init_ui()
        self.init_tray_icon()
        logging.info("[WindowRecorder] 主应用窗口已创建")

    def cleanup_old_data(self):
        logging.info("[WindowRecorder] 开始清理旧数据...")
        try:
            self.db.cleanup_old_records(
                days_to_keep=CONFIG['days_to_keep'], 
                screenshots_dir=self.output_dir
            )
            logging.info("[WindowRecorder] 清理完成。")
        except Exception as e:
            logging.exception("[WindowRecorder] 清理数据时出错")

    def init_ui(self):
        self.setWindowTitle('窗口记录')
        self.resize(520, 600)

        pixmap = QPixmap(32, 32)
        pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        painter.setPen(QPen(QColor("#2196F3"), 2))
        painter.setBrush(QColor("#424242"))
        painter.drawRoundedRect(4, 4, 24, 24, 4, 4)

        painter.setPen(QPen(QColor("#BBDEFB"), 1))
        painter.drawLine(16, 4, 16, 28)
        painter.drawLine(4, 16, 28, 16)
        
        painter.end()
        self.setWindowIcon(QIcon(pixmap))

        screen = QApplication.primaryScreen()
        if screen:
            screen_geometry = screen.availableGeometry()
            x = screen_geometry.center().x() - self.width() // 2
            y = screen_geometry.center().y() - self.height() // 2
            self.move(x, y)

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

        background_btn = QPushButton("后台运行")
        background_btn.clicked.connect(self.hide)
        h.addWidget(background_btn)
        
        v.addLayout(h)

        self.start_btn.clicked.connect(self.start_record)
        self.stop_btn.clicked.connect(self.stop_record)
        self.view_btn.clicked.connect(self.open_timeline)
        self.stop_btn.setEnabled(False)
        logging.info("[WindowRecorder] 主应用窗口UI已初始化")

    def init_tray_icon(self):
        self.tray_icon = QSystemTrayIcon(self)
        pixmap = QPixmap(32, 32)
        pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pixmap)
        painter.setPen(QPen(QColor("#4fc1ff"), 4))
        painter.drawRect(4, 4, 24, 24)
        painter.setBrush(QColor("#ff6b6b"))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(QPoint(16, 16), 6, 6)
        painter.end()
        self.tray_icon.setIcon(QIcon(pixmap))
        self.update_tray_tooltip()

        menu = QMenu(self)
        show_action = menu.addAction("显示")
        show_action.triggered.connect(self.show_window)
        
        menu.addSeparator()

        self.tray_start_action = menu.addAction("开始记录")
        self.tray_start_action.triggered.connect(self.start_record)
        self.tray_stop_action = menu.addAction("停止记录")
        self.tray_stop_action.triggered.connect(self.stop_record)
        self.tray_view_action = menu.addAction("时间轴")
        self.tray_view_action.triggered.connect(self.open_timeline)

        self.tray_start_action.setEnabled(True)
        self.tray_stop_action.setEnabled(False)

        menu.addSeparator()

        quit_action = menu.addAction("退出")
        quit_action.triggered.connect(self.quit_app)

        self.tray_icon.setContextMenu(menu)
        self.tray_icon.show()

        self.tray_icon.activated.connect(self.on_tray_icon_activated)

    def update_tray_tooltip(self):
        if self.is_recording:
            self.tray_icon.setToolTip("窗口记录 (正在记录)")
        else:
            self.tray_icon.setToolTip("窗口记录 (未在记录)")

    def show_window(self):
        self.show()
        self.activateWindow()

    def on_tray_icon_activated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            if self.isVisible():
                self.hide()
            else:
                self.show_window()

    def quit_app(self):
        logging.info("[WindowRecorder] 从托盘退出应用...")
        self._is_quitting = True
        self.close()

    def add_log(self, msg):
        item = QListWidgetItem(msg)
        item.setSizeHint(QSize(0, CONFIG['log_item_height']))
        self.log_list.addItem(item)
        self.log_list.scrollToBottom()

    def start_record(self):
        if not self.thread or not self.thread.isRunning():
            logging.info("[WindowRecorder] 开始记录...")
            self.thread = ScreenshotThread(self.interval, self.output_dir, self.db)
            self.thread.log_signal.connect(self.add_log)
            self.thread.start()
            self.status_label.setText("状态：运行中")
            self.start_btn.setEnabled(False)
            self.stop_btn.setEnabled(True)
            self.tray_start_action.setEnabled(False)
            self.tray_stop_action.setEnabled(True)
            self.is_recording = True
            self.update_tray_tooltip()

    def stop_record(self):
        if self.thread and self.thread.isRunning():
            logging.info("[WindowRecorder] 停止记录...")
            self.thread.stop()
            self.status_label.setText("状态：已停止")
            self.start_btn.setEnabled(True)
            self.stop_btn.setEnabled(False)
            self.tray_start_action.setEnabled(True)
            self.tray_stop_action.setEnabled(False)
            self.is_recording = False
            self.update_tray_tooltip()

    def open_timeline(self):
        logging.info("[WindowRecorder] 打开时间轴查看器")
        viewer = TimelineViewer(self.db, parent=self)
        viewer.exec()
    
    def closeEvent(self, event):
        if self._is_quitting:
            logging.info("[WindowRecorder] 关闭主窗口，停止记录...")
            self.stop_record()
            self.tray_icon.hide()
            super().closeEvent(event)
        else:
            event.ignore()
            self.hide()


def start_app(parent=None):
    get_config()
    
    logging.info("[WindowRecorder] 创建窗口")
    
    win = WindowRecorderApp(parent)
    return win

def main():
    get_config()
    
    logging.info("[WindowRecorder] 进程启动")
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    app.setFont(QFont("Microsoft YaHei", 10))
    win = WindowRecorderApp()
    win.show()
    sys.exit(app.exec())