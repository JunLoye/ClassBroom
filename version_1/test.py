import sys
from unittest.mock import Mock, patch
from PyQt5.QtWidgets import QApplication, QDialog, QVBoxLayout, QPushButton, QLabel
from PyQt5.QtTest import QTest
from PyQt5.QtCore import Qt, QTimer
from main import WeatherWidget

def test_weather_alarm():
    """测试天气预警功能"""
    app = QApplication(sys.argv)

    # 创建天气窗口实例
    weather_widget = WeatherWidget()

    # 模拟不同级别的预警数据
    test_cases = [
        {
            'name': '蓝色预警',
            'data': {
                'data': [{
                    'real': {
                        'temperature': 25,
                        'info': '晴',
                        'humidity': 60,
                        'wind': {'direct': '东南风'}
                    },
                    'alarms': [{
                        'level': '蓝色',
                        'type': '暴雨',
                        'content': '蓝色暴雨预警'
                    }]
                }]
            },
            'expected_color': 'rgba(30, 144, 255, 200)'
        },
        {
            'name': '黄色预警',
            'data': {
                'data': [{
                    'real': {
                        'temperature': 25,
                        'info': '晴',
                        'humidity': 60,
                        'wind': {'direct': '东南风'}
                    },
                    'alarms': [{
                        'level': '黄色',
                        'type': '大雾',
                        'content': '黄色大雾预警'
                    }]
                }]
            },
            'expected_color': 'rgba(255, 255, 0, 200)'
        },
        {
            'name': '橙色预警',
            'data': {
                'data': [{
                    'real': {
                        'temperature': 25,
                        'info': '晴',
                        'humidity': 60,
                        'wind': {'direct': '东南风'}
                    },
                    'alarms': [{
                        'level': '橙色',
                        'type': '雷电',
                        'content': '橙色雷电预警'
                    }]
                }]
            },
            'expected_color': 'rgba(255, 165, 0, 200)'
        },
        {
            'name': '红色预警',
            'data': {
                'data': [{
                    'real': {
                        'temperature': 25,
                        'info': '晴',
                        'humidity': 60,
                        'wind': {'direct': '东南风'}
                    },
                    'alarms': [{
                        'level': '红色',
                        'type': '高温',
                        'content': '红色高温预警'
                    }]
                }]
            },
            'expected_color': 'rgba(255, 69, 0, 200)'
        }
    ]

    # 创建预览对话框
    preview_dialog = QDialog()
    preview_dialog.setWindowTitle('天气预警可视化测试预览')
    preview_dialog.setMinimumWidth(600)
    preview_dialog.setMinimumHeight(400)
    layout = QVBoxLayout()

    # 添加标题标签
    title_label = QLabel('天气预警可视化测试预览')
    title_label.setAlignment(Qt.AlignCenter)
    title_label.setStyleSheet("font-size: 18px; font-weight: bold; margin: 10px;")
    layout.addWidget(title_label)

    # 添加说明标签
    info_label = QLabel('点击下方按钮可查看不同级别预警的显示效果')
    info_label.setAlignment(Qt.AlignCenter)
    info_label.setStyleSheet("margin: 5px;")
    layout.addWidget(info_label)

    # 为每个测试案例创建按钮
    buttons = []
    for test_case in test_cases:
        btn = QPushButton(f"预览 {test_case['name']}")
        btn.setStyleSheet(f"background-color: {test_case['expected_color']}; font-weight: bold;")
        layout.addWidget(btn)
        buttons.append((btn, test_case))

    # 添加完成按钮
    finish_btn = QPushButton('完成测试')
    finish_btn.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold;")
    layout.addWidget(finish_btn)

    preview_dialog.setLayout(layout)

    # 为每个按钮绑定事件
    def show_preview(btn, test_case):
        print(f"显示{test_case['name']}预览...")

        # 使用patch模拟requests.get
        with patch('requests.get') as mock_get:
            mock_get.return_value.json.return_value = test_case['data']

            # 调用查询方法
            weather_widget.query()

            # 等待动画完成
            QTest.qWait(1500)

            # 验证预警动画是否被调用
            assert weather_widget.anim is not None, f"{test_case['name']}动画未启动"

            # 验证窗口样式是否改变为对应的预警颜色
            assert test_case['expected_color'] in weather_widget.styleSheet(),                 f"{test_case['name']}颜色未正确设置"

            print(f"{test_case['name']}预览完成")

            # 显示天气窗口
            weather_widget.show()
            weather_widget.raise_()
            weather_widget.activateWindow()

    # 绑定按钮点击事件
    for btn, test_case in buttons:
        btn.clicked.connect(lambda checked, b=btn, tc=test_case: show_preview(b, tc))

    # 绑定完成按钮事件
    def finish_test():
        print("所有预警功能测试通过")
        preview_dialog.close()
        weather_widget.close()
        app.quit()

    finish_btn.clicked.connect(finish_test)

    # 显示预览对话框
    preview_dialog.exec_()

    print("测试结束")
    app.quit()

if __name__ == '__main__':
    test_weather_alarm()
