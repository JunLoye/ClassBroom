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
    settingsSize: { width: 1400, height: 800 },
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
let CurrentEditCourseIndex = null;

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
                    const urlKeys = /^(detailUrl|webUrl|url|link|relatedUrl)$/i;
                    const findDetailUrl = (value, seen = new WeakSet()) => {
                        if (!value || typeof value !== 'object' || seen.has(value)) return '';
                        seen.add(value);
                        for (const [key, item] of Object.entries(value)) {
                            if (urlKeys.test(key) && typeof item === 'string') return item;
                        }
                        for (const item of Object.values(value)) {
                            const nestedUrl = findDetailUrl(item, seen);
                            if (nestedUrl) return nestedUrl;
                        }
                        return '';
                    };
                    const detailUrl = latest.detailUrl || latest.webUrl || latest.url || latest.link || latest.relatedUrl
                        || latest.web?.url || latest.links?.detail || latest.source?.url || latest.eventType?.url
                        || findDetailUrl(latest);
                    warning = {
                        hasWarning: true,
                        event: latest.eventType?.name || "预警",
                        headline: latest.headline || "",
                        severity: latest.severity || "unknown",
                        color: latest.color?.code || "unknown",
                        detailUrl
                    };
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
        settingsHeader: document.getElementById('settings-header'),
        settingsActions: document.getElementById('settings-actions'),
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
        dropOverlay: document.getElementById('config-drop-overlay'),
        inputApiHost: document.getElementById('input-api-host'),
        inputLocation: document.getElementById('input-location'),
        inputRealLocation: document.getElementById('input-real-location'),
        inputKid: document.getElementById('input-kid'),
        inputSub: document.getElementById('input-sub'),
        inputIss: document.getElementById('input-iss'),
        inputPrivateKey: document.getElementById('input-private-key'),
        inputAutoStart: document.getElementById('input-autostart'),
        inputTheme: document.getElementById('input-theme'),
        inputWeatherRefreshMinutes: document.getElementById('input-weather-refresh-minutes'),
        customBottomText: document.getElementById('custom-bottom-info'),
        inputCustomBottomText: document.getElementById('input-custom-bottom-text'),
        inputCountdownName: document.getElementById('input-countdown-name'),
        inputCountdownDate: document.getElementById('input-countdown-date'),
        inputBottomFontSize: document.getElementById('input-bottom-font-size'),
        inputBottomColor: document.getElementById('input-bottom-color'),
        inputCustomOne: document.getElementById('input-custom-one'),
        inputCustomTwo: document.getElementById('input-custom-two'),
        inputCustomThree: document.getElementById('input-custom-three'),
        subjectList: document.getElementById('subject-list'),
        inputNewSubject: document.getElementById('input-new-subject'),
        btnAddSubject: document.getElementById('btn-add-subject'),
        aboutVersion: document.getElementById('about-version'),
        daySelector: document.getElementById('day-selector'),
        courseList: document.getElementById('course-list'),

        btnAddCourse: document.getElementById('btn-add-course')
    },

    timeTimer: null,
    async init() {
        await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
        await this.setWindowDragRegion('main');

        this.el.btnRefresh.addEventListener('click', () => this.handleRefresh());
        this.el.btnClose.addEventListener('click', () => this.hideMainWindow('close-button'));
        this.el.btnSettings.addEventListener('click', () => this.openSettings());
        this.el.btnCancelSettings.addEventListener('click', () => this.closeSettings());
        this.el.btnSaveSettings.addEventListener('click', () => this.saveSettings());
        this.el.btnImportConfig.addEventListener('click', () => this.importConfig());
        this.el.btnExportConfig.addEventListener('click', () => this.exportConfig());
        window.addEventListener('dragenter', (event) => this.handleDragEnter(event));
        window.addEventListener('dragover', (event) => this.handleDragOver(event));
        window.addEventListener('dragleave', (event) => this.handleDragLeave(event));
        window.addEventListener('drop', (event) => this.handleDrop(event));
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
        this.el.btnAddSubject.addEventListener('click', () => this.addSubject());
        this.el.inputNewSubject.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); this.addSubject(); }
        });
        this.el.inputCustomBottomText.addEventListener('focus', () => {
            this.customBottomTextSelection = this.el.inputCustomBottomText.selectionStart;
        });
        document.querySelectorAll('.placeholder-token').forEach(button => {
            button.addEventListener('click', () => {
                this.appendPlaceholder(button.dataset.placeholder);
            });
        });
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

    appendPlaceholder(placeholder) {
        if (!placeholder || !this.el.inputCustomBottomText) return;
        const textArea = this.el.inputCustomBottomText;
        textArea.value = `${textArea.value}${placeholder}`;
        textArea.focus({ preventScroll: true });
        textArea.setSelectionRange(textArea.value.length, textArea.value.length);
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
    },

    getCurrentCourse() {
        const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const courses = (AppData.courses || {})[dayMap[new Date().getDay()]] || [];
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        let currentCourse = null;
        let nextCourse = null;
        const orderedCourses = courses.filter(course => course.start && course.end).slice().sort((a, b) => a.start.localeCompare(b.start));

        for (const course of orderedCourses) {
            const [startHour, startMinute] = course.start.split(':').map(Number);
            const [endHour, endMinute] = course.end.split(':').map(Number);
            const startMinutes = startHour * 60 + startMinute;
            const endMinutes = endHour * 60 + endMinute;
            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) currentCourse = course;
            if (!nextCourse && startMinutes > currentMinutes) nextCourse = course;
        }
        return { current: currentCourse, next: nextCourse };
    },

    renderCustomBottomInfo() {
        if (!this.el.customBottomText) return;
        const template = AppData.customBottomText || '';
        if (!template) {
            this.el.customBottomText.textContent = '';
            return;
        }

        const now = new Date();
        const pad = value => String(value).padStart(2, '0');
        const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const courseState = this.getCurrentCourse();
        const temperature = document.querySelector('#weather .temp')?.textContent?.trim() || '--°';
        const weatherDesc = document.querySelector('#weather .desc')?.textContent?.trim() || '';
        const location = AppData.weather?.location || '未设置位置';
        const realLocation = AppData.weather?.realLocation || location;
        const customTexts = AppData.customTexts || {};
        const targetName = AppData.countdownName || '目标';
        const targetDate = AppData.countdownDate || '';
        const getDaysTo = (dateText) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText || '')) return '--';
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const [year, month, day] = dateText.split('-').map(Number);
            const target = new Date(year, month - 1, day);
            return String(Math.round((target - today) / 86400000));
        };
        const values = {
            time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
            date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
            datetime: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
            weekday: weekdayNames[now.getDay()],
            location,
            real_location: realLocation,
            custom1: customTexts.one || '',
            custom2: customTexts.two || '',
            custom3: customTexts.three || '',
            temperature,
            weather: weatherDesc,
            course: courseState.current?.course || '无课程',
            nextCourse: courseState.next?.course || '无后续课程',
            targetName,
            targetDate: targetDate || '未设置',
            daysTo: getDaysTo(targetDate),
            daysToTarget: getDaysTo(targetDate),
            appName: 'ClassBroom',
            version: window.NL_APPVERSION || '--'
        };
        const rendered = template.replace(/\{([a-zA-Z]+)(?:\:([^{}]+))?\}/g, (match, key, argument) => {
            if (key === 'daysTo' && argument) return getDaysTo(argument.trim());
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
        });
        this.el.customBottomText.textContent = rendered;
        this.el.customBottomText.style.fontSize = `${Number(AppData.bottomFontSize) || 10}px`;
        this.el.customBottomText.style.color = AppData.bottomColor || '#64748b';
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
        this.renderCustomBottomInfo();

        const delay = 1000 - now.getMilliseconds() + 5;
        clearTimeout(this.timeTimer);
        this.timeTimer = setTimeout(() => this.updateClock(), delay);
    },

    applyTheme(theme) {
        const supportedThemes = ['monochrome', 'midnight', 'ocean', 'forest', 'high-contrast'];
        if (supportedThemes.includes(theme)) document.documentElement.dataset.theme = theme;
        else document.documentElement.removeAttribute('data-theme');
    },

    async setWindowDragRegion(region) {
        try {
            await Neutralino.window.unsetDraggableRegion('view-main');
            await Neutralino.window.unsetDraggableRegion('settings-header');
            if (region === 'settings' && this.el.settingsHeader) {
                await Neutralino.window.setDraggableRegion('settings-header', {
                    exclude: this.el.settingsActions ? [this.el.settingsActions] : []
                });
            } else {
                await Neutralino.window.setDraggableRegion('view-main', {
                    exclude: APP_CONFIG.excludeDrag
                });
            }
        } catch (error) { }
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
        await this.setWindowDragRegion('main');
        await Neutralino.window.show();
        await Neutralino.window.focus();
    },

    trayBound: false,
    async initTray() {
        if (this.trayBound) {
            await this.updateTrayMenu();
            return;
        }
        this.trayBound = true;
        try {
            const handleTrayAction = async (event) => {
                const rawDetail = event.detail;
                const menuItemId = typeof rawDetail === 'string'
                    ? rawDetail
                    : rawDetail?.id || rawDetail?.menuItemId || rawDetail?.itemId;
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
            };
            await Neutralino.events.on('trayMenuItemClicked', handleTrayAction);
            await this.updateTrayMenu();        } catch (error) {
            void Logger.error('托盘菜单初始化失败', { module: 'tray', action: 'init' }, error);
            try {
                await Neutralino.os.showMessageBox('托盘菜单初始化失败', error.message || String(error));
            } catch (messageBoxError) { }
        }
    },

    async updateTrayMenu() {
        const menuItems = [
            { id: 'show', text: '显示主界面' },
            { id: 'hide', text: '隐藏主界面' },
            { id: 'settings', text: '设置' },
            { id: 'refresh', text: '刷新' },
            { id: 'autostart', text: '开机自启', isChecked: AppData.autoStart === true },
            { id: 'exit', text: '退出' }
        ];
        try {
            await Neutralino.os.setTray({
                icon: window.NL_OS === 'Windows' ? '/tray.ico' : '/tray.png',
                menuItems
            });
        } catch (error) {
            void Logger.warn('托盘主图标设置失败，尝试回退图标', { module: 'tray', action: 'set' }, error);
            try {
                await Neutralino.os.setTray({ icon: '/app.ico', menuItems });
            } catch (fallbackError) {
                void Logger.error('托盘菜单设置失败', { module: 'tray', action: 'set' }, fallbackError);
            }
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

    handleDragEnter(event) {
        if (!event.dataTransfer?.types.includes('Files')) return;
        event.preventDefault();
        if (this.el.dropOverlay) this.el.dropOverlay.classList.add('active');
    },

    handleDragOver(event) {
        if (!event.dataTransfer?.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (this.el.dropOverlay) this.el.dropOverlay.classList.add('active');
    },

    handleDragLeave(event) {
        if (event.relatedTarget) return;
        if (this.el.dropOverlay) this.el.dropOverlay.classList.remove('active');
    },

    async handleDrop(event) {
        event.preventDefault();
        if (this.el.dropOverlay) this.el.dropOverlay.classList.remove('active');
        const files = Array.from(event.dataTransfer?.files || []);
        if (!files.length) return;
        if (files.length !== 1) {
            await Neutralino.os.showMessageBox('导入失败', '一次只能拖入一个 JSON 配置文件');
            return;
        }
        await this.loadDroppedConfig(files[0]);
    },

    async loadDroppedConfig(file) {
        try {
            const fileName = file.name || '';
            if (!fileName.toLowerCase().endsWith('.json')) {
                throw new Error('请拖入 JSON 格式的配置文件');
            }
            const imported = JSON.parse(await file.text());
            this.validateConfig(imported);
            if (!imported.weather.jwtConfig) imported.weather.jwtConfig = {};
            await this.openSettings(imported);
            void Logger.info('配置拖入成功', {
                module: 'config',
                action: 'drag-import',
                context: { fileName }
            });
        } catch (error) {
            void Logger.error('配置拖入失败', { module: 'config', action: 'drag-import' }, error);
            await Neutralino.os.showMessageBox('导入失败', error.message || String(error));
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
        this.el.inputRealLocation.value = EditData.weather.realLocation || '';
        this.el.inputKid.value = EditData.weather.jwtConfig.kid || '';
        this.el.inputSub.value = EditData.weather.jwtConfig.sub || '';
        this.el.inputIss.value = EditData.weather.jwtConfig.iss || '';
        this.el.inputPrivateKey.value = EditData.weather.jwtConfig.privateKey || '';
        this.el.inputAutoStart.checked = EditData.autoStart === true;
        this.el.inputTheme.value = EditData.theme || 'default';
        this.el.inputWeatherRefreshMinutes.value = EditData.weatherRefreshMinutes || 10;
        this.el.inputCustomBottomText.value = EditData.customBottomText || '';
        CurrentEditCourseIndex = null;
        this.el.inputCountdownName.value = EditData.countdownName || '';
        this.el.inputCountdownDate.value = EditData.countdownDate || '';
        this.el.inputBottomFontSize.value = EditData.bottomFontSize || 10;
        this.el.inputBottomColor.value = EditData.bottomColor || '#64748b';
        this.el.inputCustomOne.value = EditData.customTexts?.one || '';
        this.el.inputCustomTwo.value = EditData.customTexts?.two || '';
        this.el.inputCustomThree.value = EditData.customTexts?.three || '';
        this.renderSubjectList();
        if (this.el.aboutVersion) this.el.aboutVersion.textContent = window.NL_APPVERSION || '--';

        this.renderCourseList(); 

        this.el.viewMain.classList.add('hidden');
        this.el.viewSettings.classList.remove('hidden');
        this.bindSettingsDirtyTracking();
        this.settingsSnapshot = this.getSettingsSnapshot();
        if (this.el.btnSaveSettings) this.el.btnSaveSettings.disabled = true;

        await this.positionWindow(APP_CONFIG.settingsSize);
        await this.setWindowDragRegion('settings');
    },

    async closeSettings() {
        this.el.viewSettings.classList.add('hidden');
        this.el.viewMain.classList.remove('hidden');
        
        await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
        await this.setWindowDragRegion('main');
    },

    getSettingsSnapshot() {
        const fields = [
            'inputApiHost', 'inputLocation', 'inputRealLocation', 'inputKid', 'inputSub', 'inputIss',
            'inputPrivateKey', 'inputTheme', 'inputWeatherRefreshMinutes', 'inputCustomBottomText',
            'inputCountdownName', 'inputCountdownDate', 'inputBottomFontSize', 'inputBottomColor',
            'inputCustomOne', 'inputCustomTwo', 'inputCustomThree'
        ];
        const values = fields.map((key) => this.el[key]?.value ?? '');
        values.push(this.el.inputAutoStart?.checked === true);
        return JSON.stringify({ values, editData: EditData });
    },

    markSettingsDirty() {
        const dirty = this.getSettingsSnapshot() !== this.settingsSnapshot;
        if (this.el.btnSaveSettings) this.el.btnSaveSettings.disabled = !dirty;
    },

    bindSettingsDirtyTracking() {
        if (!this.el.viewSettings || this.settingsDirtyBound) return;
        this.el.viewSettings.addEventListener('input', () => this.markSettingsDirty());
        this.el.viewSettings.addEventListener('change', () => this.markSettingsDirty());
        this.settingsDirtyBound = true;
    },

    async saveSettings() {
        EditData.weather.apiHost = this.el.inputApiHost.value.trim();
        EditData.weather.location = this.el.inputLocation.value.trim();
        EditData.weather.realLocation = this.el.inputRealLocation.value.trim();
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
        EditData.customBottomText = this.el.inputCustomBottomText.value.trim();
        EditData.countdownName = this.el.inputCountdownName.value.trim();
        EditData.countdownDate = this.el.inputCountdownDate.value;
        EditData.bottomFontSize = Math.max(8, Math.min(30, Number(this.el.inputBottomFontSize.value) || 10));
        EditData.bottomColor = this.el.inputBottomColor.value || '#64748b';
        EditData.customTexts = {
            one: this.el.inputCustomOne.value.trim(),
            two: this.el.inputCustomTwo.value.trim(),
            three: this.el.inputCustomThree.value.trim()
        };
        if (!Array.isArray(EditData.subjects)) EditData.subjects = [];

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
                CurrentEditCourseIndex = null;
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
        if (CurrentEditCourseIndex !== null && CurrentEditCourseIndex >= EditData.courses[CurrentEditDay].length) CurrentEditCourseIndex = null;

        EditData.courses[CurrentEditDay].forEach((course, index) => {
            const row = document.createElement('div');
            row.className = 'course-item';
            row.classList.toggle('selected', CurrentEditCourseIndex === index);
            row.dataset.courseIndex = String(index);
            row.addEventListener('click', (event) => {
                if (event.target.closest('.btn-delete') || event.target.closest('.course-time-range-track')) return;
                if (CurrentEditCourseIndex === index) {
                    CurrentEditCourseIndex = null;
                    this.renderCourseList();
                    this.markSettingsDirty();
                    return;
                }
                CurrentEditCourseIndex = index;
                this.renderCourseList();
            });

            const timeToMinutes = (value, fallback) => {
                const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
                return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
            };
            const MIN_COURSE_TIME = 360;
            const MAX_COURSE_TIME = 1410;
            const COURSE_TIME_STEP = 5;
            const minutesToTime = (minutes) => {
                const normalized = Math.max(MIN_COURSE_TIME, Math.min(MAX_COURSE_TIME, minutes));
                return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
            };
            const snapMinutes = (minutes) => {
                const snapped = MIN_COURSE_TIME + Math.round((minutes - MIN_COURSE_TIME) / COURSE_TIME_STEP) * COURSE_TIME_STEP;
                return Math.max(MIN_COURSE_TIME, Math.min(MAX_COURSE_TIME, snapped));
            };

            const createTimeRangeEditor = () => {
                const group = document.createElement('div');
                group.className = 'course-time-range';

                const labels = document.createElement('div');
                labels.className = 'course-time-range-labels';
                const startLabel = document.createElement('div');
                startLabel.className = 'course-range-value start';
                const endLabel = document.createElement('div');
                endLabel.className = 'course-range-value end';
                labels.append(startLabel, endLabel);

                const track = document.createElement('div');
                track.className = 'course-time-range-track';
                track.tabIndex = 0;
                track.setAttribute('role', 'group');
                track.setAttribute('aria-label', '课程开始和结束时间');

                const fill = document.createElement('div');
                fill.className = 'course-time-range-fill';
                const startThumb = document.createElement('div');
                startThumb.className = 'course-time-range-thumb start';
                startThumb.tabIndex = 0;
                startThumb.setAttribute('role', 'slider');
                startThumb.setAttribute('aria-label', '课程开始时间');
                const endThumb = document.createElement('div');
                endThumb.className = 'course-time-range-thumb end';
                endThumb.tabIndex = 0;
                endThumb.setAttribute('role', 'slider');
                endThumb.setAttribute('aria-label', '课程结束时间');
                track.append(fill, startThumb, endThumb);

                let startMinutes = Math.max(MIN_COURSE_TIME, Math.min(MAX_COURSE_TIME, snapMinutes(timeToMinutes(course.start, 480))));
                let endMinutes = Math.max(MIN_COURSE_TIME, Math.min(MAX_COURSE_TIME, snapMinutes(timeToMinutes(course.end, 525))));
                if (endMinutes <= startMinutes) endMinutes = Math.min(MAX_COURSE_TIME, startMinutes + COURSE_TIME_STEP);
                if (endMinutes - startMinutes < COURSE_TIME_STEP) endMinutes = Math.min(MAX_COURSE_TIME, startMinutes + COURSE_TIME_STEP);

                const updateRange = (activeThumb = null) => {
                    startMinutes = Math.max(MIN_COURSE_TIME, Math.min(startMinutes, endMinutes - COURSE_TIME_STEP));
                    endMinutes = Math.min(MAX_COURSE_TIME, Math.max(endMinutes, startMinutes + COURSE_TIME_STEP));
                    const startPercent = (startMinutes - MIN_COURSE_TIME) / (MAX_COURSE_TIME - MIN_COURSE_TIME) * 100;
                    const endPercent = (endMinutes - MIN_COURSE_TIME) / (MAX_COURSE_TIME - MIN_COURSE_TIME) * 100;
                    const startTime = minutesToTime(startMinutes);
                    const endTime = minutesToTime(endMinutes);
                    track.style.setProperty('--range-start', `${startPercent}%`);
                    track.style.setProperty('--range-end', `${endPercent}%`);
                    startLabel.innerHTML = `<span>开始时间</span><b>${startTime}</b>`;
                    endLabel.innerHTML = `<span>结束时间</span><b>${endTime}</b>`;
                    startThumb.setAttribute('aria-valuemin', String(MIN_COURSE_TIME));
                    startThumb.setAttribute('aria-valuemax', String(endMinutes - COURSE_TIME_STEP));
                    startThumb.setAttribute('aria-valuenow', String(startMinutes));
                    startThumb.setAttribute('aria-valuetext', startTime);
                    endThumb.setAttribute('aria-valuemin', String(startMinutes + COURSE_TIME_STEP));
                    endThumb.setAttribute('aria-valuemax', String(MAX_COURSE_TIME));
                    endThumb.setAttribute('aria-valuenow', String(endMinutes));
                    endThumb.setAttribute('aria-valuetext', endTime);
                    EditData.courses[CurrentEditDay][index].start = startTime;
                    EditData.courses[CurrentEditDay][index].end = endTime;
                    if (activeThumb) activeThumb.focus({ preventScroll: true });
                };

                const updateThumbFromPointer = (thumb, event) => {
                    const rect = track.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                    const minutes = snapMinutes(MIN_COURSE_TIME + ratio * (MAX_COURSE_TIME - MIN_COURSE_TIME));
                    if (thumb === startThumb) startMinutes = Math.min(minutes, endMinutes - COURSE_TIME_STEP);
                    else endMinutes = Math.max(minutes, startMinutes + COURSE_TIME_STEP);
                    updateRange(thumb);
                };
                let draggedThumb = null;
                track.addEventListener('pointerdown', (event) => {
                    if (event.target === startThumb || event.target === endThumb) return;
                    event.stopPropagation();
                    const rect = track.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                    const clickedMinutes = snapMinutes(MIN_COURSE_TIME + ratio * (MAX_COURSE_TIME - MIN_COURSE_TIME));
                    draggedThumb = Math.abs(clickedMinutes - startMinutes) <= Math.abs(clickedMinutes - endMinutes)
                        ? startThumb
                        : endThumb;
                    track.setPointerCapture(event.pointerId);
                    updateThumbFromPointer(draggedThumb, event);
                });
                track.addEventListener('pointermove', (event) => {
                    if (draggedThumb && track.hasPointerCapture(event.pointerId)) updateThumbFromPointer(draggedThumb, event);
                });
                track.addEventListener('pointerup', (event) => {
                    draggedThumb = null;
                    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
                });
                track.addEventListener('pointercancel', () => { draggedThumb = null; });
                [startThumb, endThumb].forEach((thumb) => {
                    thumb.addEventListener('pointerdown', (event) => {
                        event.stopPropagation();
                        thumb.setPointerCapture(event.pointerId);
                        updateThumbFromPointer(thumb, event);
                    });
                    thumb.addEventListener('pointermove', (event) => {
                        if (thumb.hasPointerCapture(event.pointerId)) updateThumbFromPointer(thumb, event);
                    });
                    thumb.addEventListener('keydown', (event) => {
                        const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -COURSE_TIME_STEP : ['ArrowRight', 'ArrowUp'].includes(event.key) ? COURSE_TIME_STEP : 0;
                        if (!direction) return;
                        event.preventDefault();
                        if (thumb === startThumb) startMinutes += direction;
                        else endMinutes += direction;
                        updateRange(thumb);
                    });
                });

                updateRange();
                group.append(labels, track);
                return group;
            };

            const timeRangeEditor = CurrentEditCourseIndex === index ? createTimeRangeEditor() : null;

            const subjectPanel = document.createElement('div');
            subjectPanel.className = 'course-subject-panel';
            const subjectOptions = document.createElement('div');
            subjectOptions.className = 'course-subject-options';
            const subjects = Array.isArray(EditData.subjects) && EditData.subjects.length
                ? EditData.subjects
                : ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
            subjects.forEach((subject) => {
                const subjectButton = document.createElement('button');
                subjectButton.type = 'button';
                subjectButton.className = 'course-subject-option';
                subjectButton.textContent = subject;
                subjectButton.classList.toggle('active', course.course === subject);
                subjectButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    CurrentEditCourseIndex = index;
                    EditData.courses[CurrentEditDay][index].course = subject;
                    this.renderCourseList();
                });
                subjectOptions.appendChild(subjectButton);
            });

            const customButton = document.createElement('button');
            customButton.type = 'button';
            customButton.className = 'course-subject-option course-custom-button';
            customButton.textContent = '自定义';
            customButton.addEventListener('click', (event) => {
                event.stopPropagation();
                CurrentEditCourseIndex = index;
                subjectOptions.innerHTML = '';
                const customInput = document.createElement('input');
                customInput.type = 'text';
                customInput.className = 'course-custom-input';
                customInput.placeholder = '输入自定义课程名称';
                customInput.value = course.course || '';
                customInput.addEventListener('click', (inputEvent) => inputEvent.stopPropagation());
                const confirmButton = document.createElement('button');
                confirmButton.type = 'button';
                confirmButton.className = 'course-custom-confirm';
                confirmButton.textContent = '确定';
                confirmButton.addEventListener('click', (confirmEvent) => {
                    confirmEvent.stopPropagation();
                    const customName = customInput.value.trim();
                    if (customName) {
                        EditData.courses[CurrentEditDay][index].course = customName;
                        if (!Array.isArray(EditData.subjects)) EditData.subjects = [];
                        if (!EditData.subjects.includes(customName)) EditData.subjects.push(customName);
                    }
                    this.renderCourseList();
                });
                subjectOptions.append(customInput, confirmButton);
                customInput.focus();
                customInput.setSelectionRange(customInput.value.length, customInput.value.length);
            });
            subjectOptions.appendChild(customButton);
            subjectPanel.appendChild(subjectOptions);

            const btnDelete = document.createElement('button');
            btnDelete.className = 'btn-delete';
            btnDelete.innerHTML = '×';
            btnDelete.onclick = () => {
                EditData.courses[CurrentEditDay].splice(index, 1);
                if (CurrentEditCourseIndex === index) CurrentEditCourseIndex = null;
                else if (CurrentEditCourseIndex !== null && CurrentEditCourseIndex > index) CurrentEditCourseIndex -= 1;
                this.renderCourseList();
            };

            const timePanel = document.createElement('div');
            timePanel.className = 'course-time-panel';
            if (timeRangeEditor) timePanel.appendChild(timeRangeEditor);

            let compactTime = null;
            let compactName = null;
            if (CurrentEditCourseIndex !== index) {
                subjectOptions.classList.add('hidden');
                compactName = document.createElement('span');
                compactName.className = 'course-name-summary';
                compactName.textContent = course.course || '未设置课程';
                compactTime = document.createElement('span');
                compactTime.className = 'course-time-summary';
                compactTime.textContent = `${course.start || '--:--'}–${course.end || '--:--'}`;
                subjectPanel.append(compactName, compactTime);
            }

            row.appendChild(subjectPanel);
            if (CurrentEditCourseIndex === index) row.appendChild(timePanel);
            row.appendChild(btnDelete);
            this.el.courseList.appendChild(row);
        });
    },

    renderSubjectList() {
        if (!Array.isArray(EditData.subjects)) {
            EditData.subjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
        }
        this.el.subjectList.innerHTML = '';
        EditData.subjects.forEach((subject, subjectIndex) => {
            const item = document.createElement('span');
            item.className = 'subject-manager-item';
            const name = document.createElement('button');
            name.type = 'button';
            name.className = 'subject-manager-name';
            name.textContent = subject;
            name.addEventListener('click', () => {
                if (CurrentEditCourseIndex !== null && EditData.courses[CurrentEditDay]?.[CurrentEditCourseIndex]) {
                    EditData.courses[CurrentEditDay][CurrentEditCourseIndex].course = subject;
                    this.renderCourseList();
                }
            });
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'subject-manager-remove';
            remove.textContent = '×';
            remove.title = '删除课程名称';
            remove.addEventListener('click', () => {
                EditData.subjects.splice(subjectIndex, 1);
                this.renderSubjectList();
            });
            item.append(name, remove);
            this.el.subjectList.appendChild(item);
        });
    },

    addSubject() {
        const subject = this.el.inputNewSubject.value.trim();
        if (!subject) return;
        if (!Array.isArray(EditData.subjects)) EditData.subjects = [];
        if (!EditData.subjects.includes(subject)) EditData.subjects.push(subject);
        this.el.inputNewSubject.value = '';
        this.renderSubjectList();
    },

    addCourseRow() {
        if (!EditData.courses[CurrentEditDay]) EditData.courses[CurrentEditDay] = [];
        EditData.courses[CurrentEditDay].push({ start: '08:00', end: '08:45', course: '' });
        CurrentEditCourseIndex = EditData.courses[CurrentEditDay].length - 1;
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
    getWarningColor(warning) {
        const colorCode = String(warning?.color || '').trim().toLowerCase();
        const severity = String(warning?.severity || '').trim().toLowerCase();
        const level = `${colorCode} ${severity}`;

        if (/^#[a-f0-9]{6}$/i.test(colorCode)) return colorCode;
        if (level.includes('extreme') || level.includes('red') || level.includes('red level') || level.includes('红')) return '#DC2626';
        if (level.includes('severe') || level.includes('orange') || level.includes('orange level') || level.includes('橙')) return '#EA580C';
        if (level.includes('moderate') || level.includes('yellow') || level.includes('yellow level') || level.includes('黄')) return '#EAB308';
        if (level.includes('minor') || level.includes('blue') || level.includes('blue level') || level.includes('蓝')) return '#0284C7';
        return '#DC2626';
    },
    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },
    async openWarning(warning) {
        const candidateUrl = String(warning?.detailUrl || '').trim();
        let detailUrl = 'https://www.qweather.com/severe-weather-warning';
        try {
            const parsedUrl = new URL(candidateUrl);
            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') detailUrl = parsedUrl.href;
        } catch (error) { }
        await Neutralino.os.open(detailUrl);
    },
    renderWeather(weather, warning) {
        const w = weather || { temp: "--°", desc: "无数据" };
        const hasWarning = Boolean(warning?.hasWarning);
        let warnHtml = '';
        if (hasWarning) {
            const color = this.getWarningColor(warning);
            const headline = this.escapeHtml(warning.headline);
            const event = this.escapeHtml(warning.event);
            warnHtml = `<button type="button" class="weather-warning" style="--warning-color: ${color}" title="${headline}" aria-label="查看${event}详情">${ICONS.warn}<span>${event}</span></button>`;
        }
        const weatherSignature = JSON.stringify({ weather: w, warning });
        const changed = this.weatherSignature !== weatherSignature;
        this.weatherSignature = weatherSignature;
        this.el.weather.classList.toggle('no-warning', !hasWarning);
        const widgetContent = this.el.weather.closest('.widget-content');
        if (widgetContent) widgetContent.classList.toggle('no-warning', !hasWarning);
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
        if (hasWarning) {
            const warningButton = this.el.weather.querySelector('.weather-warning');
            warningButton?.addEventListener('click', () => {
                void this.openWarning(warning).catch((error) => {
                    void Logger.error('天气预警详情打开失败', { module: 'weather', action: 'open-warning' }, error);
                });
            });
        }
        this.renderCustomBottomInfo();
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
        UI.renderCustomBottomInfo();
        this.startRefreshTimers();
        await this.refreshWeather();
        void Logger.info('应用初始化完成', { module: 'lifecycle', action: 'init' });
    },
    refreshCourses() {
        const startedAt = performance.now();
        try {
            const courses = Store.getTodayCourses();
            UI.renderTimeline(courses);
            UI.renderCustomBottomInfo();
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