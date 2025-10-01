# ClassBroom

[English](README.md) | [中文说明](README.zh-CN.md)

ClassBroom is a lightweight tool designed for classroom environments to display current weather and warning information.  
It helps teachers or systems present environmental data (such as weather alerts) quickly in a clear, dashboard-style interface.

---

## Features

- Real-time weather display (temperature, conditions, humidity, etc.)  
- Weather warning alerts (with color animations for severity levels)  
- System tray icon with quick menu  
- System notifications (with weather warning alerts)  
- Configurable settings panel (location code, update interval, language, units, theme, etc.)  

---

## Screenshots

<img width="1186" height="61" alt="image" src="https://github.com/user-attachments/assets/6862369d-04d7-4aa0-80ea-d434ff0270e3" />

---

## Requirements

- **Windows 10** or later  

---

## Installation & Usage

1. Clone the repository:

   ```bash
   git clone https://github.com/LoyeJun/ClassBroom.git
   cd ClassBroom
    ```

2. Configure `config.json` (must be set manually on the first run, or via the in-app settings panel):

   ```json
   {
     "location_code": "101010100",
     "update_interval": 300,
     "language": "en",
     "temperature_unit": "C",
     "autostart": false,
     "notifications": true,
     "theme": "light"
   }
   ```

---

## Configuration Options

* `location_code`: Location code for weather API
* `update_interval`: Update interval (minutes)
* `language`: UI language (`zh` or `en`)
* `temperature_unit`: Temperature unit (`C` or `F`)
* `autostart`: Enable/disable auto start
* `notifications`: Enable/disable system notifications
* `theme`: Theme (`light` or `dark`)

---

## Contributing

Issues and Pull Requests are welcome to improve this project.

---

## License

This project is licensed under the [MIT License](LICENSE).
