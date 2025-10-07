# 读取主文件
with open("c:\\Users\\20808\\Desktop\\python_project\\ClassBroom\\main.py", "r", encoding="utf-8") as f:
    content = f.read()

# 替换WindowRecorder启动方法
old_method = """    def launch_WindowRecorder_app(self):
        try:
            from apps.WindowRecorder.main import main as WindowRecorder

            self.WindowRecorder = WindowRecorder()
            logging.info("[ClassBroom] WindowRecorder 已启动")

        except Exception as e:
            logging.error(f"[ClassBroom] WindowRecorder 启动失败: {e}")"""

new_method = """    def launch_WindowRecorder_app(self):
        try:
            from apps.WindowRecorder.main import WindowRecorderApp

            self.WindowRecorder = WindowRecorderApp()

            # 将窗口居中显示
            screen_geometry = QGuiApplication.primaryScreen().availableGeometry()
            center_x = screen_geometry.center().x() - self.WindowRecorder.width() // 2
            center_y = screen_geometry.center().y() - self.WindowRecorder.height() // 2
            self.WindowRecorder.move(center_x, center_y)

            self.WindowRecorder.show()
            logging.info("[ClassBroom] WindowRecorder 已启动")

        except Exception as e:
            logging.error(f"[ClassBroom] WindowRecorder 启动失败: {e}")"""

# 替换内容
new_content = content.replace(old_method, new_method)

# 写回文件
with open("c:\\Users\\20808\\Desktop\\python_project\\ClassBroom\\main.py", "w", encoding="utf-8") as f:
    f.write(new_content)

print("主文件已成功更新")
