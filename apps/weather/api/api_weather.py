import requests
import json
import logging
import re


BASE_URL = "https://api.qweather.com/v7/weather/now"

def get_weather(CONFIG):
    params = {
        "location": CONFIG['location'],
        "key": CONFIG['api_key'],
        "lang": "zh",
    }

    try:
        response = requests.get(BASE_URL, params=params, timeout=10)
        pattern = r"(location=|key=)[^&]+"
        temp_logging = re.sub(pattern, r"\1***", response.url)
        logging.info(f"[Weather] 配置API请求URL: {temp_logging}")
        
        if response.status_code == 200:
            data = response.json()
            temp_logging = data
            temp_logging['fxLink'] = 'https://www.qweather.com/severe-weather/***.html'
            logging.info(f"[Weather] API响应: {temp_logging}")
            
            if data.get('code') != '200':
                logging.error(f"[Weather] API返回错误: {data.get('code')} - {data.get('message', '未知错误')}")
                logging.error(f"[Weather] Full response: {data}")
                return {}
                
            if "now" in data:
                weather_data = data["now"]
                weather_data['location'] = CONFIG['location']
                if 'fxLink' in data:
                    weather_data['fxLink'] = data['fxLink']
                return weather_data
            else:
                logging.error("[Weather] API响应中缺少'now'字段")
                return {}
                
        else:
            logging.error(f"[Weather] Request failed with status code {response.status_code}: {response.text}")
            return {}

    except requests.exceptions.RequestException as e:
        logging.error(f"[Weather] Request exception: {e}")
        return {}
        
    except json.JSONDecodeError as e:
        logging.error(f"[Weather] JSON decode error: {e}")
        return {}


def get_weather_warning(CONFIG):
    try:
        warning_url = "https://api.qweather.com/v7/warning/now"
        params = {
            "location": CONFIG['location'],
            "key": CONFIG["api_key"],
            "lang": "zh"
        }
        response = requests.get(warning_url, params=params, timeout=10)
        
        pattern = r"(location=|key=)[^&]+"
        temp_logging = re.sub(pattern, r"\1***", response.url)
        logging.info(f"[Weather] 预警API请求URL: {temp_logging}")
        
        if response.status_code == 200:
            data = response.json()
            temp_logging = data
            temp_logging['fxLink'] = 'https://www.qweather.com/severe-weather/***.html'
            logging.info(f"[Weather] 预警API响应: {temp_logging}")
            
            if data.get('code') == '200' and "warning" in data and data["warning"]:
                return data
        return {}
    except Exception as e:
        logging.error(f"[Weather] 获取天气预警时出现错误: {e}")
        return {}