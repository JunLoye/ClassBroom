import json
import logging
from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QFormLayout, QLineEdit,
    QCheckBox, QPushButton, QComboBox, QLabel, QSpinBox, QColorDialog,
    QDialog, QScrollArea, QDoubleSpinBox, QHBoxLayout
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor

# 假设 get_path 函数在主模块中定义或可访问
from main import get_path, CONFIG

APP_CONFIG_PATH = get_path('config.json')

class SettingsWindow(QDialog):
    def __init__(self, main_window, parent=None):
        super().__init__(parent)
        self.main_window = main_window
        self.setWindowTitle("全局设置")
        self.setMinimumWidth(400)
        self.init_ui()
        self.load_settings()

    def init_ui(self):
        main_layout = QVBoxLayout(self)
        
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        main_layout.addWidget(scroll_area)
        
        container = QWidget()
        scroll_area.setWidget(container)
        
        layout = QFormLayout(container)
        layout.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.AllNonFixedFieldsGrow)

        # 应用设置
        self.app_settings_layout = QVBoxLayout()
        layout.addRow(self.app_settings_layout)

        # 保存按钮
        save_button = QPushButton("保存")
        save_button.clicked.connect(self.save_settings)
        main_layout.addWidget(save_button)

    def load_settings(self):
        # 清空旧的应用设置
        for i in reversed(range(self.app_settings_layout.count())):
            item = self.app_settings_layout.itemAt(i)
            if item is not None:
                widget = item.widget()
                if widget is not None:
                    widget.setParent(None)

        user_apps_config = CONFIG.get("apps", {})
        # 加载各应用的设置
        for app_id, app_info in self.main_window.app_map.items():
            if app_id == "Settings": continue # 跳过设置应用本身

            user_config = user_apps_config.get(app_id, {})

            app_group = QWidget()
            app_layout = QFormLayout(app_group)
            app_layout.setContentsMargins(0, 10, 0, 10)
            
            app_label = QLabel(f"<b>--- {app_info.get('name', app_id)} ---</b>")
            self.app_settings_layout.addWidget(app_label)

            # 通用设置
            enabled_check = QCheckBox()
            enabled_check.setChecked(user_config.get("enabled", False))
            app_layout.addRow("启用:", enabled_check)
            setattr(self, f"{app_id}_enabled", enabled_check)

            # 特定应用设置
            if app_id == "Weather":
                location_edit = QLineEdit(user_config.get("location", ""))
                app_layout.addRow("城市ID:", location_edit)
                setattr(self, f"{app_id}_location", location_edit)
                
                apikey_edit = QLineEdit(user_config.get("api_key", ""))
                app_layout.addRow("API Key:", apikey_edit)
                setattr(self, f"{app_id}_api_key", apikey_edit)

            elif app_id == "Countdown":
                title_edit = QLineEdit(user_config.get("title", ""))
                app_layout.addRow("标题:", title_edit)
                setattr(self, f"{app_id}_title", title_edit)

                date_edit = QLineEdit(user_config.get("target_date", ""))
                app_layout.addRow("目标日期:", date_edit)
                setattr(self, f"{app_id}_target_date", date_edit)

            elif app_id == "WindowRecorder":
                interval_spin = QSpinBox()
                interval_spin.setRange(1, 3600)
                interval_spin.setValue(user_config.get("interval", 60))
                app_layout.addRow("记录间隔(秒):", interval_spin)
                setattr(self, f"{app_id}_interval", interval_spin)

                screenshots_dir_edit = QLineEdit(user_config.get("screenshots_dir", "screenshots"))
                app_layout.addRow("截图目录:", screenshots_dir_edit)
                setattr(self, f"{app_id}_screenshots_dir", screenshots_dir_edit)

                db_file_edit = QLineEdit(user_config.get("db_file", "window_records.db"))
                app_layout.addRow("数据库文件:", db_file_edit)
                setattr(self, f"{app_id}_db_file", db_file_edit)

                thumb_size_w_spin = QSpinBox()
                thumb_size_w_spin.setRange(100, 1000)
                thumb_size_w_spin.setValue(user_config.get("thumb_size", [240, 140])[0])
                thumb_size_h_spin = QSpinBox()
                thumb_size_h_spin.setRange(100, 1000)
                thumb_size_h_spin.setValue(user_config.get("thumb_size", [240, 140])[1])
                thumb_size_layout = QHBoxLayout()
                thumb_size_layout.addWidget(thumb_size_w_spin)
                thumb_size_layout.addWidget(QLabel("x"))
                thumb_size_layout.addWidget(thumb_size_h_spin)
                app_layout.addRow("缩略图尺寸:", thumb_size_layout)
                setattr(self, f"{app_id}_thumb_size_w", thumb_size_w_spin)
                setattr(self, f"{app_id}_thumb_size_h", thumb_size_h_spin)

                log_item_height_spin = QSpinBox()
                log_item_height_spin.setRange(10, 50)
                log_item_height_spin.setValue(user_config.get("log_item_height", 20))
                app_layout.addRow("日志项高度:", log_item_height_spin)
                setattr(self, f"{app_id}_log_item_height", log_item_height_spin)


            self.app_settings_layout.addWidget(app_group)

    def save_settings(self):
        try:
            # 更新全局设置
            if "apps" not in CONFIG:
                CONFIG["apps"] = {}

            # 更新各应用设置
            for app_id in self.main_window.app_map.keys():
                if app_id == "Settings":
                    continue

                if app_id not in CONFIG["apps"]:
                    CONFIG["apps"][app_id] = {}

                if hasattr(self, f"{app_id}_enabled"):
                    CONFIG["apps"][app_id]["enabled"] = getattr(self, f"{app_id}_enabled").isChecked()
                if hasattr(self, f"{app_id}_position"):
                    CONFIG["apps"][app_id]["position"] = getattr(self, f"{app_id}_position").value()
                
                # 特定应用
                if app_id == "Weather":
                    CONFIG["apps"][app_id]["location"] = getattr(self, f"{app_id}_location").text()
                    CONFIG["apps"][app_id]["api_key"] = getattr(self, f"{app_id}_api_key").text()
                elif app_id == "Countdown":
                    CONFIG["apps"][app_id]["title"] = getattr(self, f"{app_id}_title").text()
                    CONFIG["apps"][app_id]["target_date"] = getattr(self, f"{app_id}_target_date").text()
                
                elif app_id == "WindowRecorder":
                    CONFIG["apps"][app_id]["interval"] = getattr(self, f"{app_id}_interval").value()
                    CONFIG["apps"][app_id]["screenshots_dir"] = getattr(self, f"{app_id}_screenshots_dir").text()
                    CONFIG["apps"][app_id]["db_file"] = getattr(self, f"{app_id}_db_file").text()
                    thumb_w = getattr(self, f"{app_id}_thumb_size_w").value()
                    thumb_h = getattr(self, f"{app_id}_thumb_size_h").value()
                    CONFIG["apps"][app_id]["thumb_size"] = [thumb_w, thumb_h]
                    CONFIG["apps"][app_id]["log_item_height"] = getattr(self, f"{app_id}_log_item_height").value()


            # 写入文件
            with open(APP_CONFIG_PATH, 'w', encoding='utf-8') as f:
                json.dump(CONFIG, f, indent=4, ensure_ascii=False)
            
            logging.info("[Settings] 配置已保存")
            
            # 刷新主窗口
            self.main_window.load_apps()
            self.main_window.update_theme_style()
            
            self.accept() # 关闭对话框

        except Exception as e:
            logging.error(f"[Settings] 保存配置失败: {e}")

def start_app(parent=None):
    """启动设置窗口的函数"""
    if not hasattr(QApplication, 'instance') or QApplication.instance() is None:
        logging.error("[Settings] QApplication 实例不存在。")
        return None
        
    main_window = None
    # 优先检查传入的 parent 是否就是主窗口实例
    if parent and parent.__class__.__name__ == 'EdgeTrayWindow':
        main_window = parent
    else:
        # 备用方案：遍历顶层窗口查找主窗口实例
        for widget in QApplication.topLevelWidgets():
            if widget.__class__.__name__ == 'EdgeTrayWindow':
                main_window = widget
                break
    
    if main_window:
        settings_window = SettingsWindow(main_window, parent)
        settings_window.exec()
        return settings_window
    else:
        logging.error("[Settings] 找不到主窗口实例。")
        return None
