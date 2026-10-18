Neutralino.init();
window.addEventListener('contextmenu', e => e.preventDefault());

// 屏蔽 F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U 等常见调试快捷键
window.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        return false;
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C' || e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
        e.preventDefault();
        return false;
    }
    if (e.ctrlKey && (e.key === 'U' || e.keyCode === 85)) {
        e.preventDefault();
        return false;
    }
}, true);

const APP_CONFIG = {
    windowSize: { width: 1200, height: 85 }, 
    settingsSize: { width: 800, height: 600 }, 
    topOffset: 20,
    excludeDrag: ["btn-refresh", "btn-close", "btn-settings"]
};

const ICONS = {
    weather: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`,
    warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`
};

const DAY_MAP = { 'mon': '周一', 'tue': '周二', 'wed': '周三', 'thu': '周四', 'fri': '周五', 'sat': '周六', 'sun': '周日' };
const Base64Util = {
    encode(str) { return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m, p1) => String.fromCharCode('0x' + p1))); },
    decode(str) { return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')); }
};

const REG_PATH = 'HKCU\\Software\\ClassBroom';
const REG_KEY = 'ConfigData';

let AppData = { weather: {}, courses: {} };
let EditData = {}; 
let CurrentEditDay = 'mon'; 

const Store = {
    async init() {
        if (window.NL_OS === 'Windows') {
            try {
                const res = await Neutralino.os.execCommand(`reg query "${REG_PATH}" /v ${REG_KEY}`);
                if (res.exitCode === 0) {
                    const match = res.stdOut.match(new RegExp(`${REG_KEY}\\s+REG_SZ\\s+(.+)`));
                    if (match && match[1]) {
                        AppData = JSON.parse(Base64Util.decode(match[1].trim()));
                        return;
                    }
                }
            } catch (e) { }
        }
        try {
            const str = await Neutralino.filesystem.readFile('config.json');
            AppData = JSON.parse(str);
            if (window.NL_OS === 'Windows') await this.saveToRegistry(AppData);
        } catch (e) {
            AppData = { weather: { jwtConfig: {} }, courses: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } };
        }
    },
    async saveToRegistry(data) {
        if (window.NL_OS !== 'Windows') return Neutralino.filesystem.writeFile('config.json', JSON.stringify(data, null, 2));
        const b64Str = Base64Util.encode(JSON.stringify(data));
        const res = await Neutralino.os.execCommand(`reg add "${REG_PATH}" /v ${REG_KEY} /t REG_SZ /d "${b64Str}" /f`);
        if (res.exitCode !== 0) throw new Error(res.stdErr);
    },
    getWeatherConfig() { return AppData.weather || {}; },
    getTodayCourses() {
        const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        return (AppData.courses || {})[dayMap[new Date().getDay()]] || [];
    }
};

const Startup = {
    async setEnabled(enabled) {
        if (window.NL_OS === 'Windows') return this.setWindows(enabled);
        if (window.NL_OS === 'Darwin') return this.setMacOS(enabled);
        if (window.NL_OS === 'Linux') return this.setLinux(enabled);
        throw new Error('当前系统不支持开机自启');
    },
    async getExecutablePath() {
        const executableNames = {
            Windows: ['classbroom-win_x64.exe', 'classbroom.exe'],
            Darwin: ['classbroom-mac_universal', 'classbroom-mac_x64', 'classbroom-mac_arm64', 'classbroom'],
            Linux: ['classbroom-linux_x64', 'classbroom-linux_arm64', 'classbroom-linux_armhf', 'classbroom']
        }[window.NL_OS] || [];

        for (const name of executableNames) {
            const path = await Neutralino.filesystem.getJoinedPath(window.NL_PATH, name);
            try {
                if ((await Neutralino.filesystem.getStats(path)).isFile) return path;
            } catch (error) { }
        }
        throw new Error('无法定位应用程序文件，请在安装后的应用中设置开机自启');
    },
    async getHomePath() {
        const home = await Neutralino.os.getEnv('HOME');
        if (!home) throw new Error('无法获取当前用户目录');
        return home;
    },
    async setWindows(enabled) {
        const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
        if (!enabled) {
            const existing = await Neutralino.os.execCommand(`reg query "${runKey}" /v ClassBroom`);
            if (existing.exitCode !== 0) return;
            const removed = await Neutralino.os.execCommand(`reg delete "${runKey}" /v ClassBroom /f`);
            if (removed.exitCode !== 0) throw new Error(removed.stdErr || removed.stdOut || '删除 Windows 启动项失败');
            return;
        }

        const executablePath = await this.getExecutablePath();
        const result = await Neutralino.os.execCommand(`reg add "${runKey}" /v ClassBroom /t REG_SZ /d "\\"${executablePath}\\"" /f`);
        if (result.exitCode !== 0) throw new Error(result.stdErr || result.stdOut || '写入 Windows 启动项失败');
    },
    async setMacOS(enabled) {
        const home = await this.getHomePath();
        const agentDirectory = await Neutralino.filesystem.getJoinedPath(home, 'Library', 'LaunchAgents');
        const agentPath = await Neutralino.filesystem.getJoinedPath(agentDirectory, 'com.example.classbroom.plist');
        if (!enabled) {
            try { await Neutralino.filesystem.remove(agentPath); } catch (error) { }
            return;
        }
        const executablePath = await this.getExecutablePath();
        const escapedPath = executablePath.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>com.example.classbroom</string><key>ProgramArguments</key><array><string>${escapedPath}</string></array><key>RunAtLoad</key><true/></dict></plist>`;
        await Neutralino.filesystem.createDirectory(agentDirectory);
        await Neutralino.filesystem.writeFile(agentPath, plist);
    },
    async setLinux(enabled) {
        const home = await this.getHomePath();
        let configHome = '';
        try { configHome = await Neutralino.os.getEnv('XDG_CONFIG_HOME'); } catch (error) { }
        const autostartDirectory = configHome
            ? await Neutralino.filesystem.getJoinedPath(configHome, 'autostart')
            : await Neutralino.filesystem.getJoinedPath(home, '.config', 'autostart');
        const desktopPath = await Neutralino.filesystem.getJoinedPath(autostartDirectory, 'classbroom.desktop');
        if (!enabled) {
            try { await Neutralino.filesystem.remove(desktopPath); } catch (error) { }
            return;
        }
        const executablePath = await this.getExecutablePath();
        const escapedPath = executablePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
        const desktopEntry = `[Desktop Entry]\nType=Application\nName=ClassBroom\nExec="${escapedPath}"\nX-GNOME-Autostart-enabled=true\n`;
        await Neutralino.filesystem.createDirectory(autostartDirectory);
        await Neutralino.filesystem.writeFile(desktopPath, desktopEntry);
    }
};

const API = {
    base64url(source) {
        let encoded = btoa(String.fromCharCode.apply(null, new Uint8Array(source)));
        return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    async importPrivateKey(pem) {
        const cleanPem = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
        const binaryDerString = atob(cleanPem);
        const binaryDer = new Uint8Array(binaryDerString.length);
        for (let i = 0; i < binaryDerString.length; i++) binaryDer[i] = binaryDerString.charCodeAt(i);
        return await window.crypto.subtle.importKey("pkcs8", binaryDer.buffer, { name: "Ed25519" }, false, ["sign"]);
    },
    async generateJWT(jwtConfig) {
        const header = { alg: "EdDSA", kid: jwtConfig.kid };
        const iat = Math.floor(Date.now() / 1000) - 30;
        const exp = iat + 900;
        const payload = { sub: jwtConfig.sub, iss: jwtConfig.iss, iat: iat, exp: exp };
        const encodedHeader = this.base64url(new TextEncoder().encode(JSON.stringify(header)));
        const encodedPayload = this.base64url(new TextEncoder().encode(JSON.stringify(payload)));
        const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
        const cryptoKey = await this.importPrivateKey(jwtConfig.privateKey);
        const signature = await window.crypto.subtle.sign({ name: "Ed25519" }, cryptoKey, dataToSign);
        return `${encodedHeader}.${encodedPayload}.${this.base64url(signature)}`;
    },
    async fetchWeather() {
        const config = Store.getWeatherConfig();
        if (!config.apiHost || !config.jwtConfig?.privateKey) return { weather: { temp: "--°", desc: "未配置" }, warning: null };
        try {
            const [lonStr, latStr] = config.location.split(',').map(s => s.trim());
            const baseUrl = `https://${config.apiHost}`;
            const jwtToken = await this.generateJWT(config.jwtConfig);
            const headers = { 'Authorization': `Bearer ${jwtToken}` };

            const [weatherRes, alertRes] = await Promise.all([
                fetch(`${baseUrl}/weather/v1/current/${latStr}/${lonStr}`, { headers }),
                fetch(`${baseUrl}/weatheralert/v1/current/${latStr}/${lonStr}`, { headers })
            ]);

            if (!weatherRes.ok) throw new Error("请求失败");
            const wData = await weatherRes.json();
            const temp = wData.temperature?.value !== undefined ? Math.round(wData.temperature.value) + "°" : "--°";
            const condition = wData.condition?.text || "未知";
            const compassMap = { 'n': '北', 'ne': '东北', 'e': '东', 'se': '东南', 's': '南', 'sw': '西南', 'w': '西', 'nw': '西北' };
            const windDir = compassMap[wData.wind?.direction?.compass?.toLowerCase()] ? compassMap[wData.wind.direction.compass.toLowerCase()] + "风" : "";
            const windScale = wData.wind?.scale !== undefined ? wData.wind.scale + "级" : "";
            const desc = condition + (windDir ? ` · ${windDir}${windScale}` : "");

            let warning = null;
            if (alertRes.ok) {
                const aData = await alertRes.json();
                if (!aData.metadata?.zeroResult && aData.alerts?.length > 0) {
                    const latest = aData.alerts[0];
                    warning = { hasWarning: true, event: latest.eventType?.name || "预警", headline: latest.headline || "", severity: latest.severity || "unknown", color: latest.color?.code || "unknown" };
                }
            }
            return { weather: { temp, desc }, warning };
        } catch (error) {
            return { weather: { temp: "ERR", desc: "配置错误" }, warning: null };
        }
    }
};

const UI = {
    el: {
        viewMain: document.getElementById('view-main'),
        viewSettings: document.getElementById('view-settings'),
        timeline: document.getElementById('timeline'),
        weather: document.getElementById('weather'),
        btnSettings: document.getElementById('btn-settings'),
        btnRefresh: document.getElementById('btn-refresh'),
        btnClose: document.getElementById('btn-close'),
        btnSaveSettings: document.getElementById('btn-save-settings'),
        btnCancelSettings: document.getElementById('btn-cancel-settings'),
        inputApiHost: document.getElementById('input-api-host'),
        inputLocation: document.getElementById('input-location'),
        inputKid: document.getElementById('input-kid'),
        inputSub: document.getElementById('input-sub'),
        inputIss: document.getElementById('input-iss'),
        inputPrivateKey: document.getElementById('input-private-key'),
        inputAutoStart: document.getElementById('input-autostart'),
        daySelector: document.getElementById('day-selector'),
        courseList: document.getElementById('course-list'),
        btnAddCourse: document.getElementById('btn-add-course')
    },

    async init() {
        await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
        try {
            await Neutralino.window.setDraggableRegion('view-main', { exclude: APP_CONFIG.excludeDrag });
        } catch (e) { }

        this.el.btnRefresh.addEventListener('click', () => this.handleRefresh());
        this.el.btnClose.addEventListener('click', () => Neutralino.window.hide());
        this.el.btnSettings.addEventListener('click', () => this.openSettings());
        this.el.btnCancelSettings.addEventListener('click', () => this.closeSettings());
        this.el.btnSaveSettings.addEventListener('click', () => this.saveSettings());
        await Neutralino.events.on('windowClose', () => Neutralino.window.hide());
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const targetEl = document.getElementById(`tab-${e.currentTarget.dataset.target}`);
                if (targetEl) {
                    targetEl.classList.add('active');
                    void targetEl.offsetWidth;
                }
            });
        });

        this.renderDaySelector();
        this.el.btnAddCourse.addEventListener('click', () => this.addCourseRow());
    },

    async positionWindow(size, top) {
        await Neutralino.window.setSize(size);
        await Neutralino.window.center();
        if (top !== undefined) {
            const centeredPosition = await Neutralino.window.getPosition();
            await Neutralino.window.move(centeredPosition.x ?? 0, top);
        }
    },

    async showMainWindow() {
        this.el.viewSettings.classList.add('hidden');
        this.el.viewMain.classList.remove('hidden');
        await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
        await Neutralino.window.show();
        await Neutralino.window.focus();
    },

    async initTray() {
        try {
            await Neutralino.events.on('trayMenuItemClicked', async (event) => {
                const menuItemId = typeof event.detail === 'string'
                    ? event.detail
                    : event.detail?.id || event.detail?.menuItemId || event.detail?.itemId;
                switch (menuItemId) {
                    case 'show':
                        await this.showMainWindow();
                        break;
                    case 'hide':
                        await Neutralino.window.hide();
                        break;
                    case 'settings':
                        await Neutralino.window.show();
                        await this.openSettings();
                        break;
                    case 'refresh':
                        await this.handleRefresh();
                        break;
                    case 'autostart':
                        await this.toggleAutoStart();
                        break;
                    case 'exit':
                        await Neutralino.app.exit();
                        break;
                }
            });
            await this.updateTrayMenu();
        } catch (error) {
            console.error('托盘菜单初始化失败:', error);
            try {
                await Neutralino.os.showMessageBox('托盘菜单初始化失败', error.message || String(error));
            } catch (messageBoxError) { }
        }
    },

    async updateTrayMenu() {
        await Neutralino.os.setTray({
            icon: window.NL_OS === 'Windows' ? '/tray.ico' : '/tray.png',
            menuItems: [
                { id: 'show', text: '显示主界面' },
                { id: 'hide', text: '隐藏主界面' },
                { id: 'settings', text: '设置' },
                { id: 'refresh', text: '刷新' },
                { id: 'autostart', text: '开机自启', isChecked: AppData.autoStart === true },
                { id: 'exit', text: '退出' }
            ]
        });
    },

    async toggleAutoStart() {
        const enabled = AppData.autoStart !== true;
        try {
            await Startup.setEnabled(enabled);
            const updatedData = { ...AppData, autoStart: enabled };
            await Store.saveToRegistry(updatedData);
            AppData = updatedData;
            this.el.inputAutoStart.checked = enabled;
            await this.updateTrayMenu();
        } catch (error) {
            console.error('开机自启设置失败:', error);
            await Neutralino.os.showMessageBox('设置失败', error.message);
        }
    },

    async handleRefresh() {
        this.el.btnRefresh.classList.add('rotating');
        await App.init();
        setTimeout(() => this.el.btnRefresh.classList.remove('rotating'), 600);
    },

    async openSettings() {
        EditData = JSON.parse(JSON.stringify(AppData)); 
        if (!EditData.weather) EditData.weather = { jwtConfig: {} };
        if (!EditData.weather.jwtConfig) EditData.weather.jwtConfig = {};
        if (!EditData.courses) EditData.courses = {};

        this.el.inputApiHost.value = EditData.weather.apiHost || '';
        this.el.inputLocation.value = EditData.weather.location || '';
        this.el.inputKid.value = EditData.weather.jwtConfig.kid || '';
        this.el.inputSub.value = EditData.weather.jwtConfig.sub || '';
        this.el.inputIss.value = EditData.weather.jwtConfig.iss || '';
        this.el.inputPrivateKey.value = EditData.weather.jwtConfig.privateKey || '';
        this.el.inputAutoStart.checked = EditData.autoStart === true;

        this.renderCourseList(); 

        this.el.viewMain.classList.add('hidden');
        this.el.viewSettings.classList.remove('hidden');

        await this.positionWindow(APP_CONFIG.settingsSize);
    },

    async closeSettings() {
        this.el.viewSettings.classList.add('hidden');
        this.el.viewMain.classList.remove('hidden');
        
        await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
    },

    async saveSettings() {
        EditData.weather.apiHost = this.el.inputApiHost.value.trim();
        EditData.weather.location = this.el.inputLocation.value.trim();
        EditData.weather.jwtConfig.kid = this.el.inputKid.value.trim();
        EditData.weather.jwtConfig.sub = this.el.inputSub.value.trim();
        EditData.weather.jwtConfig.iss = this.el.inputIss.value.trim();
        EditData.weather.jwtConfig.privateKey = this.el.inputPrivateKey.value.trim();
        EditData.autoStart = this.el.inputAutoStart.checked;

        try {
            await Startup.setEnabled(EditData.autoStart);
            await Store.saveToRegistry(EditData);
            AppData = JSON.parse(JSON.stringify(EditData)); 
            await this.updateTrayMenu();
            await this.closeSettings();
            await App.init(); 
        } catch (e) {
            alert("保存失败，请检查内容！\n" + e.message);
        }
    },

    renderDaySelector() {
        this.el.daySelector.innerHTML = '';
        Object.keys(DAY_MAP).forEach(dayKey => {
            const btn = document.createElement('button');
            btn.className = `day-btn ${dayKey === CurrentEditDay ? 'active' : ''}`;
            btn.textContent = DAY_MAP[dayKey];
            btn.onclick = () => {
                CurrentEditDay = dayKey;
                this.renderDaySelector();
                this.renderCourseList();
            };
            this.el.daySelector.appendChild(btn);
        });
    },

    renderCourseList() {
        this.el.courseList.innerHTML = '';
        if (!EditData.courses) EditData.courses = {};
        if (!EditData.courses[CurrentEditDay]) EditData.courses[CurrentEditDay] = [];

        EditData.courses[CurrentEditDay].forEach((course, index) => {
            const row = document.createElement('div');
            row.className = 'course-item';
            
            const inputStart = document.createElement('input');
            inputStart.type = 'time';
            inputStart.value = course.start || '08:00';
            inputStart.onchange = (e) => { EditData.courses[CurrentEditDay][index].start = e.target.value; };

            const inputEnd = document.createElement('input');
            inputEnd.type = 'time';
            inputEnd.value = course.end || '08:45';
            inputEnd.onchange = (e) => { EditData.courses[CurrentEditDay][index].end = e.target.value; };

            const inputName = document.createElement('input');
            inputName.type = 'text';
            inputName.placeholder = '课程名称';
            inputName.value = course.course || '';
            inputName.oninput = (e) => { EditData.courses[CurrentEditDay][index].course = e.target.value; };

            const btnDelete = document.createElement('button');
            btnDelete.className = 'btn-delete';
            btnDelete.innerHTML = '×';
            btnDelete.onclick = () => {
                EditData.courses[CurrentEditDay].splice(index, 1);
                this.renderCourseList();
            };

            row.appendChild(inputStart);
            row.appendChild(inputEnd);
            row.appendChild(inputName);
            row.appendChild(btnDelete);
            this.el.courseList.appendChild(row);
        });
    },

    addCourseRow() {
        if (!EditData.courses[CurrentEditDay]) EditData.courses[CurrentEditDay] = [];
        EditData.courses[CurrentEditDay].push({ start: '08:00', end: '08:45', course: '' });
        setTimeout(() => { this.el.courseList.scrollTop = this.el.courseList.scrollHeight; }, 10);
        this.renderCourseList();
    },

    renderTimeline(courses) {
        this.el.timeline.innerHTML = '';
        if (!courses.length) { this.el.timeline.innerHTML = `<div style="color:var(--text-muted); font-size:14px; font-weight:600; padding-left:8px;">今日无课</div>`; return; }
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();

        courses.forEach(item => {
            if (!item.start || !item.end) return;
            const [sH, sM] = item.start.split(':').map(Number);
            const [eH, eM] = item.end.split(':').map(Number);
            const startMins = sH * 60 + sM;
            const endMins = eH * 60 + eM;

            let statusClass = 'upcoming';
            let displayName = item.course || '无';
            if (currentMins > endMins) statusClass = 'done';
            else if (currentMins >= startMins && currentMins <= endMins) {
                statusClass = 'now'; displayName = `${item.course || '无'} · 进行中`;
            }

            const el = document.createElement('div');
            el.className = `time-node ${statusClass}`;
            el.innerHTML = `<div class="dot"></div><div class="time">${item.start}</div><div class="name" title="${displayName}">${displayName}</div>`;
            this.el.timeline.appendChild(el);
        });
    },

    renderWeather(weather, warning) {
        const w = weather || { temp: "--°", desc: "无数据" };
        let warnHtml = '';
        if (warning && warning.hasWarning) {
            warnHtml = `<div style="color:var(--accent-red); font-size:12px; font-weight:700; display:flex; align-items:center; gap:4px;" title="${warning.headline}">${ICONS.warn} ${warning.event}</div>`;
        }
        this.el.weather.innerHTML = `
            <div class="weather-main">
                <div class="weather-icon">${ICONS.weather}</div>
                <div class="weather-info">
                    <div class="temp">${w.temp}</div>
                    <div class="desc">${w.desc}</div>
                </div>
            </div>
            ${warnHtml}
        `;
    }
};

const App = {
    trayInitialized: false,
    async init() {
        await Store.init();
        if (!this.trayInitialized) {
            await UI.initTray();
            this.trayInitialized = true;
        }
        UI.renderTimeline(Store.getTodayCourses());
        const weatherData = await API.fetchWeather();
        UI.renderWeather(weatherData.weather, weatherData.warning);
    }
};

window.onload = async () => {
    await UI.init();
    await App.init();
};