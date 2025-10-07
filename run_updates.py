import subprocess
import sys

# 运行WindowRecorder模块更新
print("正在更新WindowRecorder模块...")
try:
    subprocess.run([sys.executable, "update_window_recorder.py"], check=True)
    print("WindowRecorder模块更新成功")
except subprocess.CalledProcessError as e:
    print(f"WindowRecorder模块更新失败: {e}")

# 运行主文件更新
print("\n正在更新主文件...")
try:
    subprocess.run([sys.executable, "update_main.py"], check=True)
    print("主文件更新成功")
except subprocess.CalledProcessError as e:
    print(f"主文件更新失败: {e}")

print("\n所有更新已完成")
