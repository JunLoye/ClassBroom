"""
天气API调用模块
该模块用于获取天气信息和天气预警信息
"""
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
            BASE_URL = "https://devapi.qweather.com/v7/weather/now"
            f.close()
        
        logging.info("Configurations loaded successfully.")
        
    except Exception as e:
        logging.error(f"Error loading configurations: {e}")
        raise

def get_info():
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
        "lang": "zh",
    }

    try:
        response = requests.get(BASE_URL, headers=headers, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('code') != '200':
                logging.error(f"API返回错误: {data.get('code')} - {data.get('message', '未知错误')}")
                return {}
                
            if "now" in data:
                weather_data = data["now"]
                weather_data['location'] = LOCATION_ID
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

def get_weather(location='113.29,22.81'):
    initialize(location)
    return get_info()

def get_weather_warning(location='113.29,22.81'):
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
        logging.error(f"获取天气预警时出现错误: {e}")
        return []