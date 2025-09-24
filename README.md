# ClassBroom

[English](README.md) | [中文说明](README.zh-CN.md)

ClassBroom is a lightweight tool designed for classroom environments to display current weather conditions and alerts.  
Its goal is to help teachers or systems present environmental information (e.g., weather warnings) quickly and visually in a dashboard-style interface.  

---

## Table of Contents

- [Features](#features)  
- [Demo / Screenshots](#demo--screenshots)  
- [Requirements](#requirements)  
- [Installation & Setup](#installation--setup)  
- [Usage](#usage)  
- [Configuration](#configuration)  
- [Contributing](#contributing)  
- [License](#license)  

---

## Features

- Fetch and display current weather (temperature, conditions, etc.)  
- Show weather alerts and warnings  
- Easy to deploy in a classroom setting  
- Minimal dependencies  

---

## Demo / Screenshots

<img width="1268" height="63" alt="image" src="https://github.com/user-attachments/assets/865bdb97-4c0d-49b9-972c-59e890f7d862" />

---

## Requirements

- A device capable of running the application (OS such as Linux, Windows, etc.)  
- Stable internet connection (for fetching weather and alerts)  
- (Depending on the project, Python / Node or other environments may be required)  

---

## Installation & Setup

1. Clone the repository  
    ```bash
    git clone https://github.com/LoyeJun/ClassBroom.git
    cd ClassBroom
    ```
    
2. Configure your API key and other settings (see [Configuration](#configuration))  

3. Start the application / service  

---

## Usage

Once running, ClassBroom will:  

* Periodically call the weather service (`qweather`)  
* Display current temperature and conditions  
* Show active weather alerts  
* Auto-refresh and update at regular intervals  

---

## Configuration

You can create or modify a configuration file (e.g., `config.yaml`, `settings.json`, or environment variables) to customize the following parameters:  

| Key                |描述|
| ------------------ | ------------------------------- |
| `weather_api_key`  | QWeather API Key                |
| `location`         | Coordinates or city name for weather data |
| `refresh_interval` | Data refresh frequency (seconds) |
| `alert_thresholds` | Criteria for displaying alerts (*not yet supported*) |
| Others             | *Coming soon*                   |

---

## Contributing

Contributions are welcome! Suggested workflow:  

1. Fork this repository  
2. Test and submit an `Issue`  
3. Create a new branch (`git checkout -b feature/YourFeature`)  
4. Commit your changes with clear messages  
5. Submit a Pull Request  

Please keep code style consistent, test your changes, and document any new features.  

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.  

---

## Acknowledgements

* QWeather
