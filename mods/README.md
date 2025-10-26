> [!CAUTION]
> 本次更新**很可能**损坏之前版本的`config.json`配置文件，请**备份后谨慎更新**
---
## Bug修复：
---
## 优化：
---
> [!TIP]
> 首次运行需要手动配置`cofig.json`，将其中的`api_key`设置为你的`和风天气 API KEY` [→获取网址（免费或付费）](https://console.qweather.com)

# ClassBroom 自定义模块（应用）制作规范

本文件旨在指导开发者如何创建和集成自定义模块（或称“应用”）到 ClassBroom 主程序中。

## 1. 模块目录结构

所有自定义模块都应放置在 `mods/` 目录下。每个模块应该是一个独立的子文件夹，其名称将作为模块的唯一标识符（`app_id`）。

```
ClassBroom/
├── main.py
├── mods/
│   ├── YourModuleName/  <-- 你的自定义模块文件夹
│   │   ├── main.py      <-- 模块的入口文件 (必需)
│   │   ├── __init__.py  <-- (可选)
│   │   └── other_files.py
│   └── AnotherModule/
│       └── main.py
└── ...
```

**重要提示：**
*   模块文件夹名称（`YourModuleName`）将作为 `app_id` 在 `main.py` 的 `CONFIG` 和 `app_map` 中使用。
*   每个模块文件夹内必须包含一个 `main.py` 文件，作为该模块的入口点。

## 2. `main.py` 入口文件规范

`main.py` 文件是你的模块被 ClassBroom 主程序加载和启动的入口。它应该定义一个可供主程序调用的函数或类。

### 选项 A: 定义一个启动函数

如果你的模块是一个简单的功能或不需要持久化的对象，可以定义一个 `start_app` 函数。

**示例 (`mods/YourModuleName/main.py`):**

```python
# filepath: mods/YourModuleName/main.py
from PyQt6.QtWidgets import QMessageBox, QWidget

def start_app(parent: QWidget = None):
    """
    启动你的自定义应用。
    :param parent: 主窗口的引用，如果你的应用需要作为子窗口或与主窗口交互。
    """
    msg_box = QMessageBox(parent)
    msg_box.setText("Hello from YourModuleName!")
    msg_box.setWindowTitle("自定义模块")
    msg_box.exec()
    # 如果你的应用是一个 QWidget 或 QMainWindow，你可以在这里创建并显示它
    # 例如:
    # my_window = MyCustomWindow(parent)
    # my_window.show()
    # return my_window # 如果需要主程序持有实例引用，则返回
```

### 选项 B: 定义一个启动类

如果你的模块需要管理状态、多个窗口或更复杂的逻辑，可以定义一个类。这个类通常会继承自 `PyQt6.QtWidgets.QWidget` 或 `QMainWindow`。

**示例 (`mods/YourModuleName/main.py`):**

```python
# filepath: mods/YourModuleName/main.py
from PyQt6.QtWidgets import QWidget, QLabel, QVBoxLayout, QPushButton
from PyQt6.QtCore import pyqtSignal, Qt

class MyCustomApp(QWidget):
    # 如果你的应用是一个窗口，并且希望主程序在它关闭时清理引用，可以定义一个 'closed' 信号
    closed = pyqtSignal() 

    def __init__(self, parent: QWidget = None):
        super().__init__(parent)
        self.setWindowTitle("我的自定义应用")
        self.setGeometry(100, 100, 300, 200)
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()
        label = QLabel("这是一个自定义应用！")
        label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(label)

        close_button = QPushButton("关闭")
        close_button.clicked.connect(self.close)
        layout.addWidget(close_button)

        self.setLayout(layout)

    def closeEvent(self, event):
        # 在窗口关闭时发出信号，通知主程序清理引用
        self.closed.emit()
        super().closeEvent(event)

    def show_window(self):
        """
        提供一个方法让主程序可以重新显示此窗口。
        """
        self.show()
        self.activateWindow()
        self.raise_()

# 如果主程序通过函数调用来启动，可以提供一个包装函数
def start_app(parent: QWidget = None):
    instance = MyCustomApp(parent)
    instance.show()
    return instance # 必须返回实例，以便主程序可以持有引用和连接信号
```

## 3. 在 `main.py` 中配置你的模块

为了让 ClassBroom 主程序识别并显示你的自定义模块，你需要在主程序的 `main.py` 文件中的 `CONFIG` 和 `app_map` 字典中添加配置。

### 3.1 `CONFIG` 字典

在 `main.py` 的 `CONFIG` 字典中，添加你的模块的基本信息和启用状态。

```python
# filepath: c:\Users\20808\Desktop\python_project\ClassBroom\main.py
CONFIG = {
    "version": "v-3.0.0",
    "apps": {
        # ... 其他应用 ...
        "YourModuleName": { # <-- 你的模块ID，与文件夹名称一致
            "name": "你的模块名称", # 在UI中显示的名称
            "icon": "✨",       # 在UI中显示的图标 (Emoji 或其他文本)
            "enabled": True,    # 是否启用此模块 (True/False)
            "position": 5,      # 在UI中的显示顺序 (数字越小越靠前)
        },
    },
    "columns": 3
}
```

### 3.2 `Main` 类中的 `app_map` 字典

在 `Main` 类的 `__init__` 方法中，修改 `self.app_map` 字典，告诉主程序如何加载和管理你的模块。

```python
# filepath: c:\Users\20808\Desktop\python_project\ClassBroom\main.py
class Main(QMainWindow):
    def __init__(self):
        super().__init__()
        # ...existing code...
        
        self.app_map = {
            # ... 其他应用 ...
            "YourModuleName": { # <-- 你的模块ID，与文件夹名称一致
                "module": "YourModuleName", # <-- **重要：** 模块路径应为文件夹名称，因为 `mods_load` 将 `main.py` 作为此名称的模块加载到 `sys.modules` 中。
                # 如果你的入口是函数:
                "function": "start_app", 
                # 如果你的入口是类:
                # "class": "MyCustomApp", 
                "instance_attr": "your_module_instance", # <-- 主程序持有实例的属性名 (唯一)
                "takes_parent": True, # <-- 你的函数/类构造器是否接受 'parent' 参数 (True/False)
                "name": "你的模块名称", # (可选，会优先使用 CONFIG 中的 name)
                "icon": "✨"       # (可选，会优先使用 CONFIG 中的 icon)
            },
        }
        # ...existing code...
```

**`app_map` 字段说明：**
*   `module`: 模块在 `sys.modules` 中注册的名称。如果你的模块文件夹是 `mods/YourModuleName`，并且入口文件是 `main.py`，则这里应为 `"YourModuleName"`。这是因为 `mods_load` 函数将 `mods/YourModuleName/main.py` 加载为一个名为 `YourModuleName` 的模块，并将其存储在 `sys.modules` 中。
*   `function` 或 `class`: 指定 `main.py` 中用于启动应用的函数名或类名。两者选其一。
*   `instance_attr`: 主程序将用于存储你的模块实例的属性名称（例如 `self.your_module_instance`）。这个名称必须是唯一的。
*   `takes_parent`: 布尔值，指示你的启动函数或类构造器是否接受一个 `parent` 参数（通常是 `QMainWindow` 的实例）。如果你的应用需要与主窗口交互或作为其子窗口，请设置为 `True`。
*   `name`, `icon`: 可选字段，如果 `CONFIG` 中未提供，则使用这里的默认值。

## 4. 调试和测试

*   在开发过程中，密切关注 ClassBroom 的日志输出 (`ClassBroom.log`)，它会记录模块加载和启动过程中的信息和错误。
*   确保你的模块代码没有语法错误或运行时异常，否则可能导致主程序无法启动或模块加载失败。

遵循这些规范，你就可以轻松地为 ClassBroom 扩展功能了！