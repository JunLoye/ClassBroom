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
    windowSize: { width: 1400, height: 92 },
    settingsSize: { width: 1000, height: 700 },
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

const Logger = {
    logPath: null,
    archivePath: null,
    queue: Promise.resolve(),
    sessionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    maxLogBytes: 2 * 1024 * 1024,
    async init() {
        try {
            this.logPath = await Neutralino.filesystem.getJoinedPath(window.NL_DATAPATH, 'classbroom.log');
            this.archivePath = await Neutralino.filesystem.getJoinedPath(window.NL_DATAPATH, 'classbroom.previous.log');
            await this.rotateIfNeeded();
            await this.info('应用启动', {
                module: 'lifecycle',
                os: window.NL_OS,
                platform: navigator.platform,
                appVersion: window.NL_APPVERSION,
                resourcesPath: window.NL_PATH,
                dataPath: window.NL_DATAPATH,
                userAgent: navigator.userAgent
            });
        } catch (error) {
            console.error('日志系统初始化失败:', error);
        }
    },
    async rotateIfNeeded() {
        if (!this.logPath) return;
        try {
            const stats = await Neutralino.filesystem.getStats(this.logPath);
            if (!stats.isFile || stats.size < this.maxLogBytes) return;
            try { await Neutralino.filesystem.remove(this.archivePath); } catch (error) { }
            await Neutralino.filesystem.move(this.logPath, this.archivePath);
        } catch (error) {
            if (!String(error.message || error).includes('does not exist')) {
                console.error('日志轮转失败:', error);
            }
        }
    },
    sanitize(value) {
        if (!value || typeof value !== 'object') return value;
        const sensitiveKeys = /private.?key|password|token|secret|credential/i;
        return JSON.parse(JSON.stringify(value, (key, item) => sensitiveKeys.test(key) ? '[REDACTED]' : item));
    },
    async write(level, message, context = {}, error = null) {
        const timestamp = new Date().toISOString();
        const record = {
            timestamp,
            sessionId: this.sessionId,
            level,
            message: String(message),
            module: context.module || 'app',
            action: context.action || null,
            durationMs: context.durationMs ?? null,
            context: this.sanitize(context.context || {}),
            error: error ? {
                name: error.name || 'Error',
                message: error.message || String(error),
                stack: error.stack || null
            } : null
        };
        const line = `${JSON.stringify(record)}\n`;
        if (level === 'ERROR') console.error(record);
        else if (level === 'WARN') console.warn(record);
        else console.log(record);
        if (!this.logPath) return;
        this.queue = this.queue.catch(() => {}).then(async () => {
            await Neutralino.filesystem.appendFile(this.logPath, line);
        }).catch((writeError) => {
            console.error('日志写入失败:', writeError);
        });
        await this.queue;
    },
    async measure(action, operation, context = {}) {
        const startedAt = performance.now();
        try {
            const result = await operation();
            await this.info(`${action}完成`, { ...context, action, durationMs: Math.round(performance.now() - startedAt) });
            return result;
        } catch (error) {
            await this.error(`${action}失败`, { ...context, action, durationMs: Math.round(performance.now() - startedAt) }, error);
            throw error;
        }
    },
    info(message, context = {}) { return this.write('INFO', message, context); },
    warn(message, context = {}, error = null) { return this.write('WARN', message, context, error); },
    error(message, context = {}, error = null) { return this.write('ERROR', message, context, error); }
};

window.addEventListener('error', (event) => {
    void Logger.error('未捕获的页面错误', { module: 'runtime', context: { filename: event.filename, line: event.lineno, column: event.colno } }, event.error || new Error(event.message));
});
window.addEventListener('unhandledrejection', (event) => {
    void Logger.error('未处理的 Promise 异步异常', { module: 'runtime' }, event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
});

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
        timeDisplay: document.getElementById('time-display'),
        timeClock: document.getElementById('time-clock'),
        timeDate: document.getElementById('time-date'),
        weather: document.getElementById('weather'),
        btnSettings: document.getElementById('btn-settings'),
        btnRefresh: document.getElementById('btn-refresh'),
        refreshHint: document.getElementById('refresh-hint'),
        btnClose: document.getElementById('btn-close'),
        btnSaveSettings: document.getElementById('btn-save-settings'),
        btnCancelSettings: document.getElementById('btn-cancel-settings'),
        btnImportConfig: document.getElementById('btn-import-config'),
        btnExportConfig: document.getElementById('btn-export-config'),
        inputApiHost: document.getElementById('input-api-host'),
        inputLocation: document.getElementById('input-location'),
        inputKid: document.getElementById('input-kid'),
        inputSub: document.getElementById('input-sub'),
        inputIss: document.getElementById('input-iss'),
        inputPrivateKey: document.getElementById('input-private-key'),
        inputAutoStart: document.getElementById('input-autostart'),
        inputTheme: document.getElementById('input-theme'),
        inputWeatherRefreshMinutes: document.getElementById('input-weather-refresh-minutes'),
        daySelector: document.getElementById('day-selector'),
        courseList: document.getElementById('course-list'),
        btnAddCourse: document.getElementById('btn-add-course')
    },

    timeTimer: null,
    async init() {
        await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
        try {
            await Neutralino.window.setDraggableRegion('view-main', { exclude: APP_CONFIG.excludeDrag });
        } catch (e) { }

        this.el.btnRefresh.addEventListener('click', () => this.handleRefresh());
        this.el.btnClose.addEventListener('click', () => this.hideMainWindow('close-button'));
        this.el.btnSettings.addEventListener('click', () => this.openSettings());
        this.el.btnCancelSettings.addEventListener('click', () => this.closeSettings());
        this.el.btnSaveSettings.addEventListener('click', () => this.saveSettings());
        this.el.btnImportConfig.addEventListener('click', () => this.importConfig());
        this.el.btnExportConfig.addEventListener('click', () => this.exportConfig());
        await Neutralino.events.on('windowClose', () => this.hideMainWindow('window-close'));
        
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
        this.startClock();
    },

    startClock() {
        clearTimeout(this.timeTimer);
        this.updateClock();
    },

    stopClock() {
        clearTimeout(this.timeTimer);
        this.timeTimer = null;
    },

    updateClock() {
        const now = new Date();
        const pad = value => String(value).padStart(2, '0');
        const hours = pad(now.getHours());
        const minutes = pad(now.getMinutes());
        const seconds = pad(now.getSeconds());
        const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        this.el.timeClock.textContent = `${hours}:${minutes}:${seconds}`;
        this.el.timeDate.textContent = `${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${weekdayNames[now.getDay()]}`;
        this.el.timeDisplay.title = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${hours}:${minutes}:${seconds}`;

        const delay = 1000 - now.getMilliseconds() + 5;
        clearTimeout(this.timeTimer);
        this.timeTimer = setTimeout(() => this.updateClock(), delay);
    },

    applyTheme(theme) {
        const supportedThemes = ['monochrome', 'midnight', 'ocean', 'forest', 'high-contrast'];
        if (supportedThemes.includes(theme)) document.documentElement.dataset.theme = theme;
        else document.documentElement.removeAttribute('data-theme');
    },

    async positionWindow(size, top) {
        await Neutralino.window.setSize(size);
        await Neutralino.window.center();
        if (top !== undefined) {
            const centeredPosition = await Neutralino.window.getPosition();
            await Neutralino.window.move(centeredPosition.x ?? 0, top);
        }
    },

    hideMainWindow(source = 'unknown') {
        void Logger.info(`隐藏主窗口: ${source}`);
        try {
            void Neutralino.window.hide();
        } catch (error) {
            void Logger.error('隐藏窗口失败', { module: 'window', action: 'hide' }, error);
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
                        this.hideMainWindow('tray-hide');
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
                        await App.shutdown();
                        break;
                }
            });
            await this.updateTrayMenu();
        } catch (error) {
            void Logger.error('托盘菜单初始化失败', { module: 'tray', action: 'init' }, error);
            try {
                await Neutralino.os.showMessageBox('托盘菜单初始化失败', error.message || String(error));
            } catch (messageBoxError) { }
        }
    },

    async updateTrayMenu() {
        const trayOptions = {
            icon: window.NL_OS === 'Windows' ? '/tray.ico' : '/tray.png',
            menuItems: [
                { id: 'show', text: '显示主界面' },
                { id: 'hide', text: '隐藏主界面' },
                { id: 'settings', text: '设置' },
                { id: 'refresh', text: '刷新' },
                { id: 'autostart', text: '开机自启', isChecked: AppData.autoStart === true },
                { id: 'exit', text: '退出' }
            ]
        };
        try {
            await Neutralino.os.setTray(trayOptions);
        } catch (error) {
            await Neutralino.os.setTray({ ...trayOptions, icon: '/app.ico' });
        }
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
            void Logger.error('开机自启设置失败', { module: 'startup', action: 'toggle' }, error);
            await Neutralino.os.showMessageBox('设置失败', error.message);
        }
    },

    async handleRefresh() {
        this.el.btnRefresh.classList.remove('rotating');
        void this.el.btnRefresh.offsetWidth;
        this.el.btnRefresh.classList.add('rotating');
        await App.refreshAll();
        setTimeout(() => this.el.btnRefresh.classList.remove('rotating'), 600);
    },

    validateConfig(config) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            throw new Error('配置文件根节点必须是 JSON 对象');
        }
        if (!config.weather || typeof config.weather !== 'object') {
            throw new Error('配置缺少 weather 对象');
        }
        if (!config.courses || typeof config.courses !== 'object' || Array.isArray(config.courses)) {
            throw new Error('配置缺少 courses 对象');
        }
        for (const day of Object.keys(DAY_MAP)) {
            if (!Array.isArray(config.courses[day])) continue;
            for (const course of config.courses[day]) {
                if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(course.start || '') ||
                    !/^([01]\d|2[0-3]):[0-5]\d$/.test(course.end || '')) {
                    throw new Error(`课程时间格式无效：${course.start || ''}-${course.end || ''}`);
                }
            }
        }
    },

    async importConfig() {
        try {
            const paths = await Neutralino.os.showOpenDialog('导入 ClassBroom 配置', {
                multiSelections: false,
                filters: [{ name: 'JSON 配置', extensions: ['json'] }]
            });
            if (!paths || !paths.length) return;
            const content = await Neutralino.filesystem.readFile(paths[0]);
            const imported = JSON.parse(content);
            this.validateConfig(imported);
            if (!imported.weather.jwtConfig) imported.weather.jwtConfig = {};
            if (!imported.courses) imported.courses = {};
            await this.openSettings(imported);
            void Logger.info('配置导入成功', { module: 'config', action: 'import', context: { filePath: paths[0] } });
        } catch (error) {
            void Logger.error('配置导入失败', { module: 'config', action: 'import' }, error);
            await Neutralino.os.showMessageBox('导入失败', error.message || String(error));
        }
    },

    async exportConfig() {
        try {
            const configToExport = this.el.viewSettings.classList.contains('hidden')
                ? AppData
                : EditData;
            const path = await Neutralino.os.showSaveDialog('导出 ClassBroom 配置', {
                forceOverwrite: true,
                defaultPath: 'classbroom-config.json',
                filters: [{ name: 'JSON 配置', extensions: ['json'] }]
            });
            if (!path) return;
            await Neutralino.filesystem.writeFile(path, JSON.stringify(configToExport, null, 2));
            void Logger.info('配置导出成功', { module: 'config', action: 'export', context: { filePath: path } });
            await Neutralino.os.showMessageBox('导出成功', path);
        } catch (error) {
            void Logger.error('配置导出失败', { module: 'config', action: 'export' }, error);
            await Neutralino.os.showMessageBox('导出失败', error.message || String(error));
        }
    },

    async openSettings(configToEdit = null) {
        EditData = configToEdit
            ? JSON.parse(JSON.stringify(configToEdit))
            : JSON.parse(JSON.stringify(AppData));
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
        this.el.inputTheme.value = EditData.theme || 'default';
        this.el.inputWeatherRefreshMinutes.value = EditData.weatherRefreshMinutes || 10;

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
        const weatherRefreshMinutes = Number(this.el.inputWeatherRefreshMinutes.value);
        if (!Number.isInteger(weatherRefreshMinutes) || weatherRefreshMinutes < 1 || weatherRefreshMinutes > 1440) {
            alert('天气刷新间隔须为 1 到 1440 分钟');
            return;
        }
        EditData.weatherRefreshMinutes = weatherRefreshMinutes;
        EditData.autoStart = this.el.inputAutoStart.checked;
        EditData.theme = this.el.inputTheme.value;

        try {
            await Startup.setEnabled(EditData.autoStart);
            await Logger.measure('设置保存', async () => {
                await Store.saveToRegistry(EditData);
                AppData = JSON.parse(JSON.stringify(EditData));
            }, { module: 'config', action: 'save', context: { theme: EditData.theme, weatherRefreshMinutes: EditData.weatherRefreshMinutes, courseDays: Object.keys(EditData.courses || {}).length } });
            await this.updateTrayMenu();
            await this.closeSettings();
            await App.init(); 
        } catch (error) {
            void Logger.error('设置保存失败', { module: 'config', action: 'save' }, error);
            alert("保存失败，请检查内容！\n" + error.message);
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

    timelineSignature: null,
    renderTimeline(courses) {
        const now = new Date();
        const courseSignature = JSON.stringify(courses || []);
        const courseChanged = this.timelineSignature !== courseSignature;
        if (courseChanged) {
            this.timelineSignature = courseSignature;
            this.el.timeline.innerHTML = '';
        }
        this.el.timeline.classList.remove('has-current-course');

        if (!courses.length) {
            if (this.el.timeline.children.length === 1 && this.el.timeline.firstElementChild.classList.contains('empty')) return;
            const emptyNode = document.createElement('div');
            emptyNode.className = 'time-node empty';
            emptyNode.innerHTML = '<div class="dot"></div><div class="time">--:--</div><div class="name" title="无">无</div>';
            this.el.timeline.appendChild(emptyNode);
            return;
        }

        courses.forEach((item, index) => {
            if (!item.start || !item.end) return;
            const [sH, sM] = item.start.split(':').map(Number);
            const [eH, eM] = item.end.split(':').map(Number);
            const startTime = new Date(now);
            startTime.setHours(sH, sM, 0, 0);
            const displayEndTime = new Date(now);
            displayEndTime.setHours(eH, eM, 0, 0);
            const actualEndTime = new Date(displayEndTime.getTime());

            if (actualEndTime < startTime) {
                actualEndTime.setDate(actualEndTime.getDate() + 1);
                displayEndTime.setDate(displayEndTime.getDate() + 1);
            }

            let statusClass = 'upcoming';
            let displayName = item.course || '无';
            const endingAnimationStart = new Date(actualEndTime.getTime() - 60 * 1000);
            if (now >= actualEndTime) statusClass = 'done';
            else if (now >= endingAnimationStart && now < actualEndTime) statusClass = 'ending';
            else if (now >= startTime && now < actualEndTime) statusClass = 'now';

            if (statusClass === 'now' || statusClass === 'ending') {
                this.el.timeline.classList.add('has-current-course');
            }

            const existingNode = !courseChanged ? this.el.timeline.children[index] : null;
            const el = existingNode || document.createElement('div');
            const displayTime = statusClass === 'now' || statusClass === 'ending'
                ? `${item.start}-${String(actualEndTime.getHours()).padStart(2, '0')}:${String(actualEndTime.getMinutes()).padStart(2, '0')}`
                : item.start;
            const previousStatus = el.dataset.status || '';
            el.className = `time-node ${statusClass}`;
            el.dataset.status = statusClass;
            el.setAttribute('aria-current', statusClass === 'now' || statusClass === 'ending' ? 'true' : 'false');
            if (!existingNode) {
                el.style.animationDelay = `${Math.min(index * 45, 360)}ms`;
                el.innerHTML = `<div class="dot"></div><div class="time">${displayTime}</div><div class="name" title="${displayName}">${displayName}</div>`;
                this.el.timeline.appendChild(el);
            } else {
                el.querySelector('.time').textContent = displayTime;
                const nameEl = el.querySelector('.name');
                nameEl.textContent = displayName;
                nameEl.title = displayName;
                if (previousStatus !== statusClass && ['now', 'ending', 'done'].includes(statusClass)) {
                    el.classList.remove('course-state-entered');
                    void el.offsetWidth;
                    el.classList.add('course-state-entered');
                }
            }
        });
    },

    weatherSignature: null,
    renderWeather(weather, warning) {
        const w = weather || { temp: "--°", desc: "无数据" };
        let warnHtml = '';
        if (warning && warning.hasWarning) {
            warnHtml = `<div class="weather-warning" title="${warning.headline}">${ICONS.warn}<span>${warning.event}</span></div>`;
        }
        const weatherSignature = JSON.stringify({ weather: w, warning });
        const changed = this.weatherSignature !== weatherSignature;
        this.weatherSignature = weatherSignature;
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
        return changed;
    }
};

const App = {
    trayInitialized: false,
    courseRefreshTimer: null,
    weatherRefreshTimer: null,
    weatherRefreshInFlight: null,
    nextWeatherRefreshAt: null,
    async init() {
        await Logger.init();
        await Store.init();
        UI.applyTheme(AppData.theme);
        if (!this.trayInitialized) {
            await UI.initTray();
            this.trayInitialized = true;
        }
        this.refreshCourses();
        this.startRefreshTimers();
        await this.refreshWeather();
        void Logger.info('应用初始化完成', { module: 'lifecycle', action: 'init' });
    },
    refreshCourses() {
        const startedAt = performance.now();
        try {
            const courses = Store.getTodayCourses();
            UI.renderTimeline(courses);
            void Logger.info('课程刷新完成', { module: 'course', action: 'refresh', durationMs: Math.round(performance.now() - startedAt), context: { courseCount: courses.length } });
        } catch (error) {
            void Logger.error('课程刷新失败', { module: 'course', action: 'refresh' }, error);
        }
    },
    startRefreshTimers() {
        clearInterval(this.courseRefreshTimer);
        clearInterval(this.weatherRefreshTimer);
        this.courseRefreshTimer = setInterval(() => this.refreshCourses(), 5000);
        void Logger.info('课程刷新定时器已启动', { module: 'course', action: 'schedule', context: { intervalMs: 5000 } });
        this.scheduleNextWeatherRefresh();
    },
    scheduleNextWeatherRefresh() {
        clearInterval(this.weatherRefreshTimer);
        const configuredMinutes = Number(AppData.weatherRefreshMinutes);
        const weatherRefreshMinutes = Number.isFinite(configuredMinutes) && configuredMinutes >= 1
            ? configuredMinutes
            : 10;
        this.nextWeatherRefreshAt = Date.now() + weatherRefreshMinutes * 60 * 1000;
        this.weatherRefreshTimer = setInterval(() => this.refreshWeather(), weatherRefreshMinutes * 60 * 1000);
    },
    async shutdown() {
        UI.stopClock();
        clearInterval(this.courseRefreshTimer);
        clearInterval(this.weatherRefreshTimer);
        await Logger.info('应用退出', { module: 'lifecycle', action: 'shutdown' });
        await Neutralino.app.exit();
    },
    async refreshWeather() {
        if (this.weatherRefreshInFlight) return this.weatherRefreshInFlight;
        this.weatherRefreshInFlight = Logger.measure('天气刷新', async () => {
            const weatherData = await API.fetchWeather();
            const changed = UI.renderWeather(weatherData.weather, weatherData.warning);
            this.scheduleNextWeatherRefresh();
            if (changed) {
                UI.el.refreshHint.classList.add('active');
                setTimeout(() => UI.el.refreshHint.classList.remove('active'), 650);
            }
            return changed;
        }, { module: 'weather', context: { configuredMinutes: AppData.weatherRefreshMinutes || 10 } });
        try {
            return await this.weatherRefreshInFlight;
        } finally {
            this.weatherRefreshInFlight = null;
        }
    },
    async refreshAll() {
        const courseBefore = UI.timelineSignature;
        this.refreshCourses();
        const courseChanged = courseBefore !== UI.timelineSignature;
        const weatherChanged = await this.refreshWeather();
        return courseChanged || weatherChanged;
    }
};

window.onload = async () => {
    await UI.init();
    await App.init();
};