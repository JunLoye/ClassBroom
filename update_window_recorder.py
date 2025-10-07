
import shutil
import os

# 复制新文件替换旧文件
source = "c:\Users\20808\Desktop\python_project\ClassBroom\apps\WindowRecorder\main_new.py"
destination = "c:\Users\20808\Desktop\python_project\ClassBroom\apps\WindowRecorder\main.py"

try:
    shutil.copy2(source, destination)
    print("WindowRecorder模块已成功更新")
except Exception as e:
    print(f"更新失败: {e}")
