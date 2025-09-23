import requests
import json
import time
import base64
import hmac
from hashlib import sha256
import logging

def initialize(location):
    global API_KEY, LOCATION_ID, BASE_URL
    logging.basicConfig(level=logging.INFO)
    
    try:
        with open("config.json", "r") as f:
            config = json.load(f)
            API_KEY = config["API_KEY"]
            LOCATION_ID = location
            # 使用实时天气API，而不是预警API
            BASE_URL = "https://devapi.qweather.com/v7/weather/now"
            f.close()
        
        logging.info("Configurations loaded successfully.")
        
    except Exception as e:
        logging.error(f"Error loading configurations: {e}")
        raise

def get_info():
    # 生成必要的认证参数
    timestamp = str(round(time.time() * 1000))
    nonce = "aRandomString"
    signature_input = API_KEY + timestamp + nonce
    secret_key = API_KEY
    signature = base64.b64encode(hmac.new(secret_key.encode(), signature_input.encode(), sha256).digest()).decode()

    headers = {
        "X-Client-Id": API_KEY,
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Signature": signature,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    params = {
        "location": LOCATION_ID,
        "key": API_KEY,
        "lang": "zh"  # 添加语言参数，确保返回中文
    }

    try:
        response = requests.get(BASE_URL, headers=headers, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print("天气数据请求成功！")
            
            # 检查API返回状态码
            if data.get('code') != '200':
                logging.error(f"API返回错误: {data.get('code')} - {data.get('message', '未知错误')}")
                return {}
                
            # 返回实时天气数据
            if "now" in data:
                weather_data = data["now"]
                # 添加位置信息（从响应中获取或使用默认值）
                weather_data['location'] = LOCATION_ID
                if 'fxLink' in data:
                    # 从链接中提取位置名称（简化处理）
                    weather_data['name'] = "江门"
                return weather_data
            else:
                logging.error("API响应中缺少'now'字段")
                return {}
                
        else:
            print(f"请求失败，状态码: {response.status_code}")
            print(f"错误信息: {response.text}")
            logging.error(f"Request failed with status code {response.status_code}: {response.text}")
            return {}

    except requests.exceptions.RequestException as e:
        print(f"请求过程中出现错误: {e}")
        logging.error(f"Request exception: {e}")
        return {}
        
    except json.JSONDecodeError as e:
        print(f"解析JSON数据时出现错误: {e}")
        logging.error(f"JSON decode error: {e}")
        return {}

def get_weather(location='113.65,22.77'):  # 使用更准确的江门经纬度
    initialize(location)
    return get_info()

# 新增：获取灾害预警信息的函数
def get_weather_warning(location='113.65,22.77'):
    """获取灾害预警信息"""
    global API_KEY, LOCATION_ID
    try:
        with open("config.json", "r") as f:
            config = json.load(f)
            API_KEY = config["API_KEY"]
            LOCATION_ID = location
            f.close()
        
        warning_url = "https://devapi.qweather.com/v7/warning/now"
        
        params = {
            "location": LOCATION_ID,
            "key": API_KEY,
            "lang": "zh"
        }
        
        response = requests.get(warning_url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('code') == '200' and "warning" in data and data["warning"]:
                return data["warning"]
        return []
        
    except Exception as e:
        logging.error(f"获取预警信息错误: {e}")
        return []