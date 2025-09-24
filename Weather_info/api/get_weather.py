import requests
import json
import time
import base64
import hmac
from hashlib import sha256
import logging


logging.basicConfig(level=logging.INFO)
BASE_URL = "https://devapi.qweather.com/v7/weather/now"


def get_weather(CONFIG):
    timestamp = str(round(time.time() * 1000))
    nonce = "aRandomString"
    signature_input = CONFIG['api_key'] + timestamp + nonce
    secret_key = CONFIG['api_key']
    signature = base64.b64encode(hmac.new(secret_key.encode(), signature_input.encode(), sha256).digest()).decode()

    headers = {
        "X-Client-Id": CONFIG['api_key'],
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Signature": signature,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    params = {
        "location": CONFIG['location'],
        "key": CONFIG['api_key'],
        "lang": "zh",
    }

    try:
        response = requests.get(BASE_URL, headers=headers, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('code') != '200':
                logging.error(f"API返回错误: {data.get('code')} - {data.get('message', '未知错误')}")
                logging.error(f"Full response: {data}")
                return {}
                
            if "now" in data:
                weather_data = data["now"]
                weather_data['location'] = CONFIG['location']
                if 'fxLink' in data:
                    weather_data['name'] = "江门"
                return weather_data
            else:
                logging.error("API响应中缺少'now'字段")
                return {}
                
        else:
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


def get_weather_warning(CONFIG):
    try:
        warning_url = "https://devapi.qweather.com/v7/warning/now"
        params = {
            "location": CONFIG['location'],
            "key": CONFIG["api_key"],
            "lang": "zh"
        }
        response = requests.get(warning_url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('code') == '200' and "warning" in data and data["warning"]:
                return data["warning"]
        return []
    except Exception as e:
        logging.error(f"获取天气预警时出现错误: {e}")
        return []