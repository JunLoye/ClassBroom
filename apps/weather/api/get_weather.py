import requests
import json
import logging


BASE_URL = "https://devapi.qweather.com/v7/weather/now"

def get_weather(CONFIG):
    params = {
        "location": CONFIG['location'],
        "key": CONFIG['api_key'],
        "lang": "zh",
    }

    try:
        response = requests.get(BASE_URL, params=params, timeout=10)
        logging.info(f"[weather] 配置API请求URL: {response.url}")
        
        if response.status_code == 200:
            data = response.json()
            logging.info(f"[weather] API响应: {data}")
            
            if data.get('code') != '200':
                logging.error(f"[weather] API返回错误: {data.get('code')} - {data.get('message', '未知错误')}")
                logging.error(f"[weather] Full response: {data}")
                return {}
                
            if "now" in data:
                weather_data = data["now"]
                weather_data['location'] = CONFIG['location']
                if 'fxLink' in data:
                    weather_data['fxLink'] = data['fxLink']
                return weather_data
            else:
                logging.error("[weather] API响应中缺少'now'字段")
                return {}
                
        else:
            logging.error(f"[weather] Request failed with status code {response.status_code}: {response.text}")
            return {}

    except requests.exceptions.RequestException as e:
        logging.error(f"[weather] Request exception: {e}")
        return {}
        
    except json.JSONDecodeError as e:
        logging.error(f"[weather] JSON decode error: {e}")
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
        logging.info(f"[weather] 预警API请求URL: {response.url}")
        
        if response.status_code == 200:
            data = response.json()
            logging.info(f"[weather] 预警API响应: {data}")
            
            if data.get('code') == '200' and "warning" in data and data["warning"]:
                return data
        return {}
    except Exception as e:
        logging.error(f"[weather] 获取天气预警时出现错误: {e}")
        return {}