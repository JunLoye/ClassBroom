Neutralino.init();
window.addEventListener('contextmenu', e => e.preventDefault());

/**
 * 禁用 WebView2 的自动填充与「保存信息？」提示。
 *
 * WebView2 密码管理器通过以下特征判定「可保存的凭据」：
 *   1. 存在 <form> 包裹
 *   2. input 具备 name 属性
 *   3. input 的 type 为 password / email 等
 *   4. autocomplete 未显式声明为 off/new-password
 * 这些特征全部消除后，内核不会再弹出保存气泡。同时周期性校正，
 * 防止浏览器在输入过程中回写属性。
 */
const AutoFillGuard = {
    /** 需要跳过的非文本输入类型 */
    skipTypes: /^(checkbox|radio|button|submit|reset|hidden|color|range|file)$/i,
    apply(element) {
        if (!element || !(element instanceof HTMLElement)) return;
        const tag = element.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
        const type = (element.getAttribute('type') || 'text').toLowerCase();
        if (this.skipTypes.test(type)) return;
        if (element.hasAttribute('name')) element.removeAttribute('name');
        if (tag === 'INPUT' && (type === 'password' || type === 'email')) {
            element.setAttribute('type', 'text');
        }
        const isTextLike = tag === 'TEXTAREA' || /^(text|search|url|tel|)$/i.test(type);
        const wanted = isTextLike ? 'new-password' : 'off';
        if (element.getAttribute('autocomplete') !== wanted) {
            element.setAttribute('autocomplete', wanted);
        }
        if (element.getAttribute('autocorrect') !== 'off') element.setAttribute('autocorrect', 'off');
        if (element.getAttribute('autocapitalize') !== 'off') element.setAttribute('autocapitalize', 'off');
        if (element.getAttribute('spellcheck') !== 'false') element.setAttribute('spellcheck', 'false');
    },
    applyAll(root = document) {
        root.querySelectorAll('input, textarea').forEach((element) => this.apply(element));
    },
    stripForms() {
        document.querySelectorAll('form').forEach((form) => {
            const fragment = document.createDocumentFragment();
            while (form.firstChild) fragment.appendChild(form.firstChild);
            form.replaceWith(fragment);
        });
    },
    init() {
        this.stripForms();
        this.applyAll();
        const observer = new MutationObserver((records) => {
            records.forEach((record) => {
                record.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) return;
                    if (node.matches?.('form')) this.stripForms();
                    if (node.matches?.('input, textarea')) this.apply(node);
                    node.querySelectorAll?.('input, textarea').forEach((element) => this.apply(element));
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('submit', (event) => event.preventDefault(), true);
        document.addEventListener('focusin', (event) => this.apply(event.target), true);
        document.addEventListener('input', (event) => this.apply(event.target), true);
        document.addEventListener('change', (event) => this.apply(event.target), true);
        document.addEventListener('blur', (event) => this.apply(event.target), true);
    }
};

window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || e.keyCode === 116) {
        e.preventDefault();
        void UI.handleRefresh();
        return false;
    }
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
    // 主界面高度：76px（顶部控件与底部文本合并为一行）
    windowSize: { width: 1400, height: 76 },
    settingsSize: { width: 1400, height: 800 },
    // 文本被截断时允许的最大窗口宽度（超出屏幕时会被 Neutralino 自动约束）
    maxWindowWidth: 1920,
    topOffset: 20,
    documentRoot: '/www/',
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
        // 优先从命令行参数定位实际可执行文件路径（NL_ARGS[0] 通常为 exe 完整路径）
        const argv = Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [];
        if (argv.length && typeof argv[0] === 'string' && argv[0]) {
            const arg0 = argv[0].replace(/^"|"$/g, '');
            try {
                if ((await Neutralino.filesystem.getStats(arg0)).isFile) return arg0;
            } catch (error) { }
        }
        const cwd = window.NL_CWD;
        const executableNames = {
            Windows: ['classbroom-win_x64.exe', 'classbroom.exe'],
            Darwin: ['classbroom-mac_universal', 'classbroom-mac_x64', 'classbroom-mac_arm64', 'classbroom'],
            Linux: ['classbroom-linux_x64', 'classbroom-linux_arm64', 'classbroom-linux_armhf', 'classbroom']
        }[window.NL_OS] || [];

        const bases = [cwd, window.NL_PATH].filter(Boolean);
        for (const base of bases) {
            for (const name of executableNames) {
                let path;
                try { path = await Neutralino.filesystem.getJoinedPath(base, name); } catch (error) { continue; }
                try {
                    if ((await Neutralino.filesystem.getStats(path)).isFile) return path;
                } catch (error) { }
            }
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
            if (existing.exitCode === 0) {
                const removed = await Neutralino.os.execCommand(`reg delete "${runKey}" /v ClassBroom /f`);
                if (removed.exitCode !== 0) {
                    void Logger.warn('删除注册表启动项失败', { module: 'startup', action: 'set-windows' }, new Error(removed.stdErr || removed.stdOut));
                }
            }
            try {
                const scriptPath = await this.getWindowsStartupShortcutPath();
                for (const suffix of ['.cmd', '.bat']) {
                    await Neutralino.filesystem.remove(scriptPath.replace(/\.cmd$/i, '') + suffix);
                }
            } catch (error) {
                void Logger.warn('清理启动文件夹脚本跳过', { module: 'startup', action: 'set-windows' }, error);
            }
            return;
        }

        const executablePath = await this.getExecutablePath();

        try {
            await this.writeRegistryRunEntry(executablePath);
            return;
        } catch (error) {
            void Logger.warn('注册表写入开机自启失败，改用启动文件夹', { module: 'startup', action: 'set-windows' }, error);
        }

        const scriptPath = await this.getWindowsStartupShortcutPath();
        await this.writeWindowsStartupScript(scriptPath, executablePath);
    },
    async writeRegistryRunEntry(executablePath) {
        const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
        const result = await Neutralino.os.execCommand(`reg add "${runKey}" /v ClassBroom /t REG_SZ /d "${executablePath}" /f`);
        if (result.exitCode !== 0) {
            throw new Error(result.stdErr || result.stdOut || '写入 Windows 启动项失败');
        }
    },
    async getWindowsStartupFolder() {
        const candidates = [];
        for (const key of ['APPDATA', 'USERPROFILE']) {
            try {
                const value = await Neutralino.os.getEnv(key);
                if (value) candidates.push(value);
            } catch (error) { }
        }
        for (const base of candidates) {
            try {
                return await Neutralino.filesystem.getJoinedPath(base, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
            } catch (error) { }
        }
        if (candidates.length) {
            try {
                return await Neutralino.filesystem.getJoinedPath(candidates[candidates.length - 1], 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
            } catch (error) { }
        }
        throw new Error('无法获取 Windows 启动文件夹路径');
    },
    async getWindowsStartupShortcutPath() {
        const folder = await this.getWindowsStartupFolder();
        return await Neutralino.filesystem.getJoinedPath(folder, 'ClassBroom.cmd');
    },
    async writeWindowsStartupScript(scriptPath, executablePath) {
        const escapedPath = `"${executablePath}"`;
        const content = `@echo off\nstart "" ${escapedPath}\n`;
        const parts = scriptPath.split(/[\\/]/);
        parts.pop();
        try {
            await Neutralino.filesystem.createDirectory(parts.join('\\'));
        } catch (error) { }
        await Neutralino.filesystem.writeFile(scriptPath, content);
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
                    warning = {
                        hasWarning: true,
                        event: latest.eventType?.name || "预警",
                        headline: latest.headline || "",
                        severity: latest.severity || "unknown",
                        color: latest.color?.code || "unknown"
                    };
                }
            }
            return { weather: { temp, desc }, warning };
        } catch (error) {
            return { weather: { temp: "ERR", desc: "配置错误" }, warning: null };
        }
    }
};

/**
 * 应用内自定义弹窗，替代浏览器原生 alert/confirm。
 * 原生弹窗使用系统样式且会阻塞渲染，与透明无边框窗口视觉割裂，
 * 这里统一为跟随主题的弹窗，并支持 Promise 形式的按钮回调。
 */
const Dialog = {
    mask: null,
    resolveCurrent: null,
    ensure() {
        if (this.mask) return this.mask;
        this.mask = document.getElementById('app-dialog');
        return this.mask;
    },
    iconSvg(type) {
        const icons = {
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
            danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/></svg>'
        };
        return icons[type] || icons.info;
    },

    show({ title = '提示', message = '', html = '', type = 'info', wide = false, buttons = [{ text: '知道了', value: true, primary: true }] } = {}) {
        const mask = this.ensure();
        if (!mask) return Promise.resolve(null);
        if (this.resolveCurrent) {
            this.resolveCurrent(null);
            this.resolveCurrent = null;
        }
        const titleEl = document.getElementById('app-dialog-title');
        const bodyEl = document.getElementById('app-dialog-body');
        const iconEl = document.getElementById('app-dialog-icon');
        const footerEl = document.getElementById('app-dialog-footer');
        const boxEl = mask.querySelector('.app-dialog');
        if (boxEl) boxEl.classList.toggle('is-wide', Boolean(wide));
        if (titleEl) titleEl.textContent = title;
        if (bodyEl) {
            // html 由内部构建（已做转义），message 走纯文本
            if (html) bodyEl.innerHTML = html;
            else bodyEl.textContent = message;
        }
        if (iconEl) {
            iconEl.innerHTML = this.iconSvg(type);
            iconEl.className = `app-dialog-icon${type === 'warning' ? ' warning' : type === 'danger' ? ' danger' : ''}`;
        }
        if (footerEl) {
            footerEl.innerHTML = '';
            buttons.forEach((button) => {
                const el = document.createElement('button');
                el.type = 'button';
                el.className = `btn ${button.primary ? 'btn-primary' : 'btn-secondary'}`;
                el.textContent = button.text;
                el.addEventListener('click', () => this.close(button.value));
                footerEl.appendChild(el);
            });
        }
        mask.classList.add('active');
        mask.setAttribute('aria-hidden', 'false');
        // 窗口高度不足时（如主界面 92px）切换紧凑模式，保证标题与按钮不重叠
        mask.classList.toggle('is-compact', window.innerHeight < 260);
        // 预览类弹窗可能较高，滚动到顶部避免上次滚动位置残留
        if (bodyEl) bodyEl.scrollTop = 0;
        const primary = footerEl?.querySelector('.btn-primary') || footerEl?.querySelector('.btn');
        primary?.focus({ preventScroll: true });
        return new Promise((resolve) => {
            this.resolveCurrent = resolve;
        });
    },
    close(value = null) {
        const mask = this.ensure();
        if (mask) {
            mask.classList.remove('active');
            mask.setAttribute('aria-hidden', 'true');
        }
        if (this.resolveCurrent) {
            this.resolveCurrent(value);
            this.resolveCurrent = null;
        }
    },
    bindKeys() {
        document.addEventListener('keydown', (event) => {
            if (!this.mask?.classList.contains('active')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                this.close(null);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                const primary = document.querySelector('#app-dialog-footer .btn-primary');
                primary?.click();
            }
        }, true);
    },
    alert(message, title = '提示', type = 'info') {
        return this.show({ title, message, type });
    },
    confirm(message, { title = '请确认', confirmText = '确定', cancelText = '取消', type = 'warning' } = {}) {
        return this.show({
            title,
            message,
            type,
            buttons: [
                { text: cancelText, value: false },
                { text: confirmText, value: true, primary: true }
            ]
        }).then((value) => value === true);
    }
};

/**
 * 自定义下拉选择器：完全用 HTML/CSS/JS 实现，不使用原生 <select>。
 * 原生 select 在透明无边框窗口下会弹出系统级下拉列表，样式无法控制且会溢出窗口。
 * 用法：容器上声明 data-input（关联的 hidden input id）与 data-placeholder。
 */
const CustomSelect = {
    registry: new Map(),
    initAll() {
        document.querySelectorAll('.custom-select[data-input]').forEach((el) => this.init(el));
    },
    init(root) {
        if (!root || root.dataset.customSelectBound === '1') return null;
        root.dataset.customSelectBound = '1';
        const inputId = root.dataset.input;
        const hidden = inputId ? document.getElementById(inputId) : null;
        const placeholder = root.dataset.placeholder || '请选择';

        root.innerHTML = '';
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-select-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        const label = document.createElement('span');
        label.className = 'custom-select-label';
        const arrow = document.createElement('i');
        arrow.className = 'custom-select-arrow';
        trigger.append(label, arrow);

        const panel = document.createElement('div');
        panel.className = 'custom-select-panel';
        panel.setAttribute('role', 'listbox');
        root.append(trigger, panel);

        const instance = {
            root, trigger, label, panel, hidden, placeholder,
            options: [],
            setOptions(options) {
                this.options = Array.isArray(options) ? options.slice() : [];
                this.render();
            },
            render() {
                panel.innerHTML = '';
                const current = this.getValue();
                this.options.forEach((option) => {
                    const item = document.createElement('div');
                    item.className = 'custom-select-option';
                    item.setAttribute('role', 'option');
                    item.dataset.value = option.value;
                    item.textContent = option.label;
                    const selected = option.value === current;
                    if (selected) {
                        item.classList.add('selected');
                        item.setAttribute('aria-selected', 'true');
                    }
                    item.addEventListener('click', (event) => {
                        event.stopPropagation();
                        this.setValue(option.value, true);
                        this.close();
                        trigger.focus({ preventScroll: true });
                    });
                    panel.appendChild(item);
                });
                this.syncLabel();
            },
            getValue() {
                return hidden ? hidden.value : '';
            },
            setValue(value, emit = false) {
                if (hidden) hidden.value = value;
                this.syncLabel();
                panel.querySelectorAll('.custom-select-option').forEach((item) => {
                    const selected = item.dataset.value === value;
                    item.classList.toggle('selected', selected);
                    item.setAttribute('aria-selected', selected ? 'true' : 'false');
                });
                if (emit) {
                    // 与原生 select 保持一致：变更后派发 change，触发脏检查
                    hidden?.dispatchEvent(new Event('change', { bubbles: true }));
                }
            },
            syncLabel() {
                const current = this.getValue();
                const matched = this.options.find((option) => option.value === current);
                label.textContent = matched ? matched.label : placeholder;
                label.classList.toggle('placeholder', !matched);
            },
            open() {
                CustomSelect.closeAll(instance);
                root.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                this.position();
            },
            /**
             * 面板使用 fixed 定位，坐标由脚本按视口计算：
             * 1) 不再受父级 overflow 与层叠上下文裁剪，避免被下方元素遮挡；
             * 2) 上下空间不足时自动翻转/限高，保证选项完整可见。
             */
            position() {
                if (!root.classList.contains('open')) return;
                const rect = root.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                const gap = 4;
                const edge = 6;
                const contentHeight = panel.scrollHeight || (this.options.length || 1) * 34 + 8;
                const maxAvailable = Math.max(96, viewportHeight - edge * 2);
                const panelHeight = Math.min(264, contentHeight, maxAvailable);
                const spaceBelow = viewportHeight - rect.bottom - gap - edge;
                const spaceAbove = rect.top - gap - edge;
                const dropUp = spaceBelow < panelHeight && spaceAbove > spaceBelow;
                const height = Math.min(panelHeight, dropUp ? spaceAbove : spaceBelow, maxAvailable);
                root.classList.toggle('drop-up', dropUp);
                panel.style.width = `${Math.round(rect.width)}px`;
                panel.style.maxHeight = `${Math.max(72, Math.round(height))}px`;
                panel.style.top = dropUp
                    ? `${Math.max(edge, Math.round(rect.top - gap - height))}px`
                    : `${Math.round(rect.bottom + gap)}px`;
                const left = Math.min(Math.max(edge, Math.round(rect.left)), viewportWidth - Math.round(rect.width) - edge);
                panel.style.left = `${Math.max(edge, left)}px`;
            },
            close() {
                root.classList.remove('open', 'drop-up');
                trigger.setAttribute('aria-expanded', 'false');
            },
            toggle() {
                if (root.classList.contains('open')) this.close();
                else this.open();
            }
        };

        trigger.addEventListener('click', (event) => {
            event.stopPropagation();
            instance.toggle();
        });
        trigger.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                instance.toggle();
            } else if (event.key === 'Escape') {
                instance.close();
            }
        });
        panel.addEventListener('click', (event) => event.stopPropagation());

        this.registry.set(root.id || inputId, instance);
        instance.syncLabel();
        return instance;
    },
    get(key) {
        return this.registry.get(key);
    },
    setOptions(key, options) {
        const instance = this.registry.get(key);
        if (instance) instance.setOptions(options);
    },
    setValue(key, value, emit = false) {
        const instance = this.registry.get(key);
        if (instance) instance.setValue(value, emit);
    },
    closeAll(except = null) {
        this.registry.forEach((instance) => {
            if (instance !== except) instance.close();
        });
    },
    /** 跟踪当前展开的面板：滚动/缩放时重新计算位置或直接收起 */
    repositionOpen() {
        this.registry.forEach((instance) => {
            if (instance.root.classList.contains('open')) instance.position();
        });
    },
    bindGlobal() {
        document.addEventListener('click', () => this.closeAll());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this.closeAll();
        });
        // 面板为 fixed 定位，需跟随页面滚动与窗口尺寸变化
        window.addEventListener('resize', () => this.repositionOpen());
        document.addEventListener('scroll', (event) => {
            if (event.target instanceof Node && event.target.nodeType === 1 && event.target.closest?.('.custom-select-panel')) return;
            this.closeAll();
        }, true);
    }
};

const UI = {
    el: {
        viewMain: document.getElementById('view-main'),
        viewSettings: document.getElementById('view-settings'),
        settingsHeader: document.getElementById('settings-header'),
        settingsDragHandle: document.getElementById('settings-drag-handle'),
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
        inputCourseFont: document.getElementById('input-course-font'),
        inputCourseFontSize: document.getElementById('input-course-font-size'),
        inputFontFamily: document.getElementById('input-font-family'),
        inputFontSizeScale: document.getElementById('input-font-size-scale'),
        fontSizeScaleLabel: document.getElementById('font-size-scale-label'),
        courseFontSizeLabel: document.getElementById('course-font-size-label'),
        bottomFontSizeLabel: document.getElementById('bottom-font-size-label'),
        fontPreview: document.getElementById('font-preview'),
        fontPreviewCourse: document.getElementById('font-preview-course'),
        fontPreviewCourseMeta: document.getElementById('font-preview-course-meta'),
        fontPreviewUi: document.getElementById('font-preview-ui'),
        fontPreviewUiMeta: document.getElementById('font-preview-ui-meta'),
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

        Dialog.bindKeys();
        this.initCustomSelects();
        CustomSelect.bindGlobal();
        this.bindDragHandle();
        this.bindMainDrag();

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
        // 记录光标位置：点击占位符按钮时 textarea 会失焦，需要保留最后位置用于插入
        const rememberCaret = () => {
            this.customBottomTextSelection = this.el.inputCustomBottomText.selectionStart;
        };
        this.el.inputCustomBottomText.addEventListener('focus', rememberCaret);
        this.el.inputCustomBottomText.addEventListener('click', rememberCaret);
        this.el.inputCustomBottomText.addEventListener('keyup', rememberCaret);
        this.el.inputCustomBottomText.addEventListener('blur', rememberCaret);
        document.querySelectorAll('.placeholder-token').forEach(button => {
            // mousedown 时阻止默认行为，避免 textarea 失焦丢失选区
            button.addEventListener('mousedown', (event) => event.preventDefault());
            button.addEventListener('click', () => {
                this.appendPlaceholder(button.dataset.placeholder);
            });
        });
        // 字号缩放滑块：拖动时实时更新标签、全局缩放与预览
        if (this.el.inputFontSizeScale) {
            this.el.inputFontSizeScale.addEventListener('input', () => {
                this.syncFontSizeScaleLabel();
                const preview = Math.max(80, Math.min(150, Number(this.el.inputFontSizeScale.value) || 100)) / 100;
                document.documentElement.style.setProperty('--fs-scale', String(preview));
                this.updateFontPreview();
            });
        }
        // 课程字号 / 底部字号滑块：拖动时同步像素标签
        [this.el.inputCourseFontSize, this.el.inputBottomFontSize].forEach((input) => {
            if (!input) return;
            input.addEventListener('input', () => {
                this.syncRangeLabels();
                this.updateFontPreview();
            });
        });
        // 字体下拉变化时即时刷新预览（与全局/课程字体联动）
        [this.el.inputFontFamily, this.el.inputCourseFont].forEach((input) => {
            if (!input) return;
            input.addEventListener('change', () => this.updateFontPreview());
        });
        this.startClock();
    },

    /** 主题选项，供自定义下拉与顶部操作区共用 */
    THEME_OPTIONS: [
        { value: 'default', label: '默认' },
        { value: 'ocean', label: '海洋蓝' },
        { value: 'forest', label: '森林绿' },
        { value: 'midnight', label: '午夜深色' },
        { value: 'high-contrast', label: '高对比度' },
        { value: 'monochrome', label: '纯黑白' }
    ],

    /** 字体选项，供全局字体与课程字体共用 */
    FONT_OPTIONS: [
        { value: '', label: '跟随系统' },
        { value: "'Microsoft YaHei', 'PingFang SC', sans-serif", label: '微软雅黑' },
        { value: "'SimSun', 'Songti SC', serif", label: '宋体' },
        { value: "'SimHei', 'Heiti SC', sans-serif", label: '黑体' },
        { value: "'KaiTi', 'Kaiti SC', serif", label: '楷体' },
        { value: "'FangSong', 'STFangsong', serif", label: '仿宋' },
        { value: "'Segoe UI', system-ui, sans-serif", label: 'Segoe UI' },
        { value: "'Consolas', 'Courier New', monospace", label: 'Consolas' }
    ],

    /** 初始化所有自定义下拉并注入选项 */
    initCustomSelects() {
        CustomSelect.initAll();
        // 顶部与主界面各有一个主题下拉，保持同步
        ['select-theme', 'select-theme-main'].forEach((id) => {
            if (!document.getElementById(id)) return;
            CustomSelect.init(document.getElementById(id));
            CustomSelect.setOptions(id, this.THEME_OPTIONS);
        });
        if (document.getElementById('select-font-family')) {
            CustomSelect.setOptions('select-font-family', this.FONT_OPTIONS);
        }
        if (document.getElementById('select-course-font')) {
            CustomSelect.setOptions('select-course-font', this.FONT_OPTIONS.map((item, index) => (
                index === 0 ? { value: '', label: '跟随全局' } : item
            )));
        }
        // 主题变化时同步两个下拉的显示，并立即预览
        this.el.inputTheme?.addEventListener('change', () => {
            const value = this.el.inputTheme.value;
            ['select-theme', 'select-theme-main'].forEach((id) => CustomSelect.setValue(id, value));
        });
    },

    startClock() {
        clearTimeout(this.timeTimer);
        this.updateClock();
    },    stopClock() {
        clearTimeout(this.timeTimer);
        this.timeTimer = null;
    },

    appendPlaceholder(placeholder) {
        if (!placeholder || !this.el.inputCustomBottomText) return;
        const textArea = this.el.inputCustomBottomText;
        const value = textArea.value;
        // 优先使用记录的光标位置；点击按钮时 textarea 会失焦，selectionStart 仍保留最后位置
        let start = Number.isInteger(textArea.selectionStart) ? textArea.selectionStart : value.length;
        let end = Number.isInteger(textArea.selectionEnd) ? textArea.selectionEnd : start;
        if (start > value.length) start = value.length;
        if (end > value.length) end = value.length;
        if (end < start) end = start;
        const insertText = placeholder;
        textArea.value = value.slice(0, start) + insertText + value.slice(end);
        const caret = start + insertText.length;
        textArea.focus({ preventScroll: true });
        textArea.setSelectionRange(caret, caret);
        this.customBottomTextSelection = caret;
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
        // 底部信息可能超长被截断，渲染后检测并扩展窗口
        this.scheduleFitWindow();
    },

    /** 布局自适应防抖：合并短时间内的多次渲染触发 */
    fitWidthTimer: null,
    /** 当前已应用的主界面宽度，用于避免重复调整 */
    appliedMainWidth: null,
    scheduleFitWindow(delay = 120) {
        clearTimeout(this.fitWidthTimer);
        this.fitWidthTimer = setTimeout(() => {
            void this.fitWindowToContent();
        }, delay);
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

    /**
     * 应用全局字体与课程字体。
     * - 全局字体写入 --font-sans，影响界面所有文本
     * - 课程字体/字号独立覆盖，未设置时跟随全局
     */
    applyFontStyles() {
        const style = document.documentElement.style;
        const family = String(AppData.fontFamily || '').trim();
        // 全局字体：为空时回落到 CSS 中定义的默认字体栈
        if (family) style.setProperty('--font-sans', family);
        else style.removeProperty('--font-sans');

        // 全局字号缩放：写入倍数，界面字号通过 calc(Npx * var(--fs-scale)) 跟随
        const scale = Math.max(80, Math.min(150, Number(AppData.fontSizeScale) || 100)) / 100;
        style.setProperty('--fs-scale', String(scale));

        // 课程字体：未单独指定时跟随全局
        const courseSize = Math.max(12, Math.min(32, Number(AppData.courseFontSize) || 15));
        const courseFont = String(AppData.courseFont || '').trim();
        style.setProperty('--course-name-size', `${courseSize}px`);
        if (courseFont) style.setProperty('--course-name-font', courseFont);
        else style.removeProperty('--course-name-font');

        // 字体或字号变化后内容宽度会改变，重新检测主界面是否需要加宽
        this.appliedMainWidth = null;
        this.scheduleFitWindow(260);
    },

    /** 同步字号缩放滑块的百分比标签 */
    syncFontSizeScaleLabel() {
        const input = this.el.inputFontSizeScale;
        if (!input || !this.el.fontSizeScaleLabel) return;
        const value = Math.max(80, Math.min(150, Number(input.value) || 100));
        this.el.fontSizeScaleLabel.textContent = `${value}%`;
    },

    /** 同步课程字号、底部字号滑块的像素标签 */
    syncRangeLabels() {
        if (this.el.inputCourseFontSize && this.el.courseFontSizeLabel) {
            const value = Math.max(12, Math.min(32, Number(this.el.inputCourseFontSize.value) || 15));
            this.el.courseFontSizeLabel.textContent = `${value} px`;
        }
        if (this.el.inputBottomFontSize && this.el.bottomFontSizeLabel) {
            const value = Math.max(8, Math.min(30, Number(this.el.inputBottomFontSize.value) || 10));
            this.el.bottomFontSizeLabel.textContent = `${value} px`;
        }
    },

    /**
     * 字体实时预览：直接按当前滑块的数值渲染，不必等到保存。
     * 课程名用课程字体 + 课程字号 × 全局缩放；界面文本仅跟随全局缩放。
     */
    updateFontPreview() {
        const ui = this.el.fontPreviewUi;
        const course = this.el.fontPreviewCourse;
        if (!ui || !course) return;
        const scale = Math.max(80, Math.min(150, Number(this.el.inputFontSizeScale?.value) || 100)) / 100;
        const courseSize = Math.max(12, Math.min(32, Number(this.el.inputCourseFontSize?.value) || 15));
        const globalFamily = String(this.el.inputFontFamily?.value || '').trim();
        const courseFamily = String(this.el.inputCourseFont?.value || '').trim();

        course.style.fontSize = `${courseSize * scale}px`;
        // 课程字体为空时跟随全局字体，两者都为空则回落到界面默认字体
        course.style.fontFamily = courseFamily || globalFamily || '';
        if (this.el.fontPreviewCourseMeta) {
            this.el.fontPreviewCourseMeta.textContent = `${courseSize} px · ${Math.round(scale * 100)}%`;
        }

        ui.style.fontSize = `${12 * scale}px`;
        ui.style.fontFamily = globalFamily;
        if (this.el.fontPreviewUiMeta) this.el.fontPreviewUiMeta.textContent = `${Math.round(scale * 100)}%`;
    },

    /**
     * 注册可拖拽区域。
     * 注意：必须先把对应元素显示出来（去掉 hidden）再注册，否则元素尺寸为 0，
     * 拖拽区域会失效（启动时主界面处于显示状态，但切换视图后需重新注册）。
     */
    async setWindowDragRegion(region) {
        try {
            await Neutralino.window.unsetDraggableRegion('view-main');
            await Neutralino.window.unsetDraggableRegion('settings-header');
            if (region === 'settings' && this.el.settingsHeader) {
                const interactive = Array.from(this.el.settingsHeader.querySelectorAll(
                    '.tab-btn, .settings-tabs, .settings-actions, .custom-select, .startup-toggle, input, label, a, button'
                ));
                await Neutralino.window.setDraggableRegion('settings-header', {
                    exclude: interactive
                });
            } else {
                // 排除交互控件，其余区域（含课表节点、天气、时间）均可拖动
                const exclude = Array.from(document.querySelectorAll('#view-main button, #view-main .icon-btn, #view-main .weather-warning'))
                    .filter((node) => node.id !== 'view-main');
                await Neutralino.window.setDraggableRegion('view-main', {
                    exclude: [...APP_CONFIG.excludeDrag, ...exclude]
                });
            }
        } catch (error) { }
    },

    /**
     * 主界面拖拽兜底：部分环境（高 DPI / WebView2 版本差异）下
     * setDraggableRegion 的拖动区域不生效，改由拖动 + beginDrag 手动接管。
     * 需移动超过阈值才触发，避免普通点击被误判为拖动窗口。
     */
    bindMainDrag() {
        const main = this.el.viewMain;
        if (!main || main.dataset.dragBound === '1') return;
        main.dataset.dragBound = '1';
        main.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            if (event.target.closest('button, input, textarea, select, a, label, .custom-select')) return;
            const startX = event.screenX;
            const startY = event.screenY;
            const onMove = async (moveEvent) => {
                const dx = Math.abs(moveEvent.screenX - startX);
                const dy = Math.abs(moveEvent.screenY - startY);
                if (dx < 4 && dy < 4) return;
                cleanup();
                try {
                    await Neutralino.window.beginDrag(startX, startY);
                } catch (error) {
                    void Logger.warn('窗口拖动失败', { module: 'window', action: 'begin-drag-main' }, error);
                }
            };
            const cleanup = () => {
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('mouseup', cleanup, true);
            };
            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('mouseup', cleanup, true);
        });
    },

    /**
     * 拖动手柄兜底：部分环境下 setDraggableRegion 对绝对定位/高 DPI 失效，
     * 在按下手柄时直接调用 beginDrag，由原生接管拖拽。
     */
    bindDragHandle() {
        const handle = this.el.settingsDragHandle;
        if (!handle || handle.dataset.bound === '1') return;
        handle.dataset.bound = '1';
        handle.addEventListener('mousedown', async (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            try {
                await Neutralino.window.beginDrag(event.screenX, event.screenY);
            } catch (error) {
                void Logger.warn('窗口拖动失败', { module: 'window', action: 'begin-drag' }, error);
            }
        });
    },

    async positionWindow(size, top) {
        await Neutralino.window.setSize(size);
        await Neutralino.window.center();
        if (top !== undefined) {
            const centeredPosition = await Neutralino.window.getPosition();
            await Neutralino.window.move(centeredPosition.x ?? 0, top);
        }
    },

    /**
     * 检测主界面中被横向截断的文本，按需自动加宽窗口。
     * 课程名称、天气描述、预警标签、底部信息在空间不足时会被省略号截断。
     * 由于这些元素默认 overflow:hidden 且受 flex 收缩，scrollWidth 无法反映真实需求，
     * 因此先切到 measuring-width 模式放开截断，测量内容自然宽度后再还原。
     */
    async fitWindowToContent() {
        // 仅在主界面可见时检测（设置界面为固定宽度，无需适配）
        if (this.el.viewSettings && !this.el.viewSettings.classList.contains('hidden')) return;
        const baseWidth = APP_CONFIG.windowSize.width;
        const maxWidth = APP_CONFIG.maxWindowWidth || 1920;

        let extra = 0;
        document.body.classList.add('measuring-width');
        try {
            // 1) 时间轴：比较所有节点的自然宽度总和与容器可用宽度
            const timeline = this.el.timeline;
            if (timeline) {
                const available = timeline.clientWidth;
                let contentWidth = 0;
                timeline.querySelectorAll('.time-node').forEach((node) => {
                    // 取 name/time 中较宽者作为该节点的自然需求宽度
                    const nameWidth = node.querySelector('.name')?.scrollWidth || 0;
                    const timeWidth = node.querySelector('.time')?.scrollWidth || 0;
                    contentWidth += Math.max(nameWidth, timeWidth, 40);
                });
                if (contentWidth > available) extra = Math.max(extra, contentWidth - available);
            }
            // 2) 天气描述与预警标签：比较自然宽度与当前分配宽度
            const weatherDesc = document.querySelector('.weather-info .desc');
            if (weatherDesc) {
                const need = weatherDesc.scrollWidth;
                const have = weatherDesc.getBoundingClientRect().width;
                if (need > have) extra = Math.max(extra, need - have);
            }
            const warnSpan = document.querySelector('.weather-warning span');
            if (warnSpan) {
                const need = warnSpan.scrollWidth;
                const have = warnSpan.getBoundingClientRect().width;
                if (need > have) extra = Math.max(extra, need - have);
            }
            // 3) 底部自定义信息（绝对定位，按滚动宽度与可视宽度差计算）
            const bottomInfo = this.el.customBottomText;
            if (bottomInfo && bottomInfo.textContent) {
                const overflow = bottomInfo.scrollWidth - bottomInfo.clientWidth;
                if (overflow > 0) extra = Math.max(extra, overflow);
            }
        } finally {
            document.body.classList.remove('measuring-width');
        }

        // 再多留 10px 缓冲，避免因字体渲染差异反复触发
        const targetWidth = Math.min(maxWidth, Math.max(baseWidth, baseWidth + Math.ceil(extra) + 10));
        const appliedWidth = this.appliedMainWidth || baseWidth;
        if (targetWidth === appliedWidth) return;
        this.appliedMainWidth = targetWidth;
        try {
            if (extra > 0) {
                // 需要加宽时用动画过渡，视觉更自然
                await this.animateWindowSize({ width: targetWidth, height: APP_CONFIG.windowSize.height }, APP_CONFIG.topOffset);
                void Logger.info('主界面宽度自适应', {
                    module: 'window',
                    action: 'fit-width',
                    context: { baseWidth, targetWidth, overflow: Math.ceil(extra) }
                });
            } else {
                // 内容已能容纳，恢复默认宽度
                await this.positionWindow({ width: targetWidth, height: APP_CONFIG.windowSize.height }, APP_CONFIG.topOffset);
            }
        } catch (error) {
            void Logger.warn('主界面宽度自适应失败', { module: 'window', action: 'fit-width' }, error);
        }
    },

    /**
     * 在两个窗口尺寸之间做渐进过渡，避免主界面与设置界面切换时瞬间跳变。
     * 按固定帧数插值宽度/高度，完成后精确定位到目标尺寸。
     */
    async animateWindowSize(targetSize, top, steps = 12, frameMs = 12) {
        try {
            const current = await Neutralino.window.getSize();
            const fromWidth = Number(current.width) || targetSize.width;
            const fromHeight = Number(current.height) || targetSize.height;
            const toWidth = Number(targetSize.width);
            const toHeight = Number(targetSize.height);
            if (fromWidth === toWidth && fromHeight === toHeight) {
                if (top !== undefined) await this.positionWindow(targetSize, top);
                return;
            }
            for (let i = 1; i <= steps; i += 1) {
                // easeOutCubic，前段变化快、后段收尾平滑
                const t = i / steps;
                const ease = 1 - Math.pow(1 - t, 3);
                const width = Math.round(fromWidth + (toWidth - fromWidth) * ease);
                const height = Math.round(fromHeight + (toHeight - fromHeight) * ease);
                await Neutralino.window.setSize({ width, height });
                await new Promise((resolve) => setTimeout(resolve, frameMs));
            }
        } catch (error) {
            // 过渡失败时直接落到目标尺寸，保证功能可用
        }
        await this.positionWindow(targetSize, top);
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
        this.appliedMainWidth = APP_CONFIG.windowSize.width;
        await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
        await this.setWindowDragRegion('main');
        await Neutralino.window.show();
        await Neutralino.window.focus();
        this.scheduleFitWindow(200);
    },

    trayBound: false,
    trayUpdateTimer: null,
    async initTray() {
        if (this.trayBound) {
            this.scheduleTrayUpdate();
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
            await this.updateTrayMenu();
        } catch (error) {
            void Logger.error('托盘菜单初始化失败', { module: 'tray', action: 'init' }, error);
            try {
                await Dialog.alert(error.message || String(error), '托盘菜单初始化失败', 'danger');
            } catch (messageBoxError) { }
        }
    },

    scheduleTrayUpdate(delay = 150) {
        clearTimeout(this.trayUpdateTimer);
        this.trayUpdateTimer = setTimeout(() => {
            this.updateTrayMenu();
        }, delay);
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
        const iconCandidates = window.NL_OS === 'Windows'
            ? ['tray.ico', 'app.ico']
            : ['tray.png', 'tray.ico', 'app.ico'];
        const errors = [];
        for (const iconName of iconCandidates) {
            try {
                const iconPath = await this.getTrayIconPath(iconName);
                await Neutralino.os.setTray({ icon: iconPath });
                await Neutralino.os.setTray({ icon: iconPath, menuItems });
                return;
            } catch (error) {
                errors.push(`${iconName}: ${error?.message || error}`);
            }
        }
        void Logger.error('托盘创建失败', { module: 'tray', action: 'set', context: { attempted: errors } }, new Error(errors.join(' | ')));
    },

    async getTrayIconPath(fileName) {
        const errors = [];
        const candidates = this.getTrayIconCandidates(fileName);
        for (const candidate of candidates) {
            try {
                const stats = await Neutralino.filesystem.getStats(candidate);
                if (!stats.isFile) continue;
                return await Neutralino.filesystem.getAbsolutePath(candidate);
            } catch (error) {
                errors.push(`${candidate} => ${error?.message || error}`);
            }
        }
        const resourcePaths = [
            fileName,
            `${(APP_CONFIG.documentRoot || '/www/').replace(/^\/+|\/+$/g, '')}/${fileName}`
        ];
        for (const resourcePath of resourcePaths) {
            try {
                const content = await Neutralino.filesystem.readBinaryFile(resourcePath).catch(() => Neutralino.filesystem.readFile(resourcePath));
                if (!content) continue;
                const tempPath = await Neutralino.filesystem.getJoinedPath(window.NL_DATAPATH, fileName);
                if (typeof content === 'string') await Neutralino.filesystem.writeFile(tempPath, content);
                else await Neutralino.filesystem.writeBinaryFile(tempPath, content);
                return await Neutralino.filesystem.getAbsolutePath(tempPath);
            } catch (error) {
                errors.push(`${resourcePath} => ${error?.message || error}`);
            }
        }
        void Logger.warn('托盘图标路径解析失败', { module: 'tray', action: 'resolve', context: { candidates, errors } });
        throw new Error(errors.join(' | ') || `未找到托盘图标: ${fileName}`);
    },

    getTrayIconCandidates(fileName) {
        const documentRoot = (APP_CONFIG.documentRoot || '/www/').replace(/^\/+|\/+$/g, '');
        const cwd = typeof window.NL_CWD === 'string' ? window.NL_CWD : '';
        const path = typeof window.NL_PATH === 'string' ? window.NL_PATH : '';
        // 打包后资源在 resources.neu 内，Neutralino 的 fs API 以 NL_PATH 为基准；
        // 开发态（--load-dir-res / 服务模式）则需经 documentRoot 定位到 www 目录。
        // 这里按优先级覆盖两种布局，逐个探测。
        const bases = [
            documentRoot,
            path ? `${path}/${documentRoot}` : '',
            cwd ? `${cwd}/${documentRoot}` : '',
            path,
            cwd
        ].filter((base) => typeof base === 'string' && base.length > 0);
        const candidates = [];
        for (const base of bases) {
            const separator = base.includes('\\') ? '\\' : '/';
            const normalized = base.replace(/[\\/]+$/, '') || '.';
            const candidate = `${normalized}${separator}${fileName}`;
            if (!candidates.includes(candidate)) candidates.push(candidate);
        }
        return candidates;
    },

    async toggleAutoStart() {
        const enabled = AppData.autoStart !== true;
        try {
            await Startup.setEnabled(enabled);
            const updatedData = { ...AppData, autoStart: enabled };
            await Store.saveToRegistry(updatedData);
            AppData = updatedData;
            this.el.inputAutoStart.checked = enabled;
            this.scheduleTrayUpdate();
        } catch (error) {
            void Logger.error('开机自启设置失败', { module: 'startup', action: 'toggle' }, error);
            await this.showDialogWithRoom(() => Dialog.alert(error.message || String(error), '设置失败', 'danger'));
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
        // 天气字段允许缺省，但类型必须正确，否则会污染运行时配置
        if (!config.weather.jwtConfig || typeof config.weather.jwtConfig !== 'object') {
            config.weather.jwtConfig = {};
        }
        const stringFields = ['apiHost', 'location', 'realLocation'];
        for (const field of stringFields) {
            const value = config.weather[field];
            if (value !== undefined && value !== null && typeof value !== 'string') {
                throw new Error(`天气配置 ${field} 必须是字符串`);
            }
        }
        const jwtFields = ['kid', 'sub', 'iss', 'privateKey'];
        for (const field of jwtFields) {
            const value = config.weather.jwtConfig[field];
            if (value !== undefined && value !== null && typeof value !== 'string') {
                throw new Error(`JWT 配置 ${field} 必须是字符串`);
            }
        }
        // 刷新间隔兼容旧版放在 weather 内的写法，统一提升到顶层
        const nestedMinutes = Number(config.weather.weatherRefreshMinutes);
        if (Number.isInteger(nestedMinutes) && nestedMinutes >= 1) {
            if (config.weatherRefreshMinutes === undefined) config.weatherRefreshMinutes = nestedMinutes;
            delete config.weather.weatherRefreshMinutes;
        }
        // 全局字体：必须为字符串，空值表示跟随系统
        if (config.fontFamily !== undefined && config.fontFamily !== null && typeof config.fontFamily !== 'string') {
            throw new Error('全局字体必须是字符串');
        }
        // 全局字号缩放：限定 80–150
        if (config.fontSizeScale !== undefined && config.fontSizeScale !== null) {
            const scale = Number(config.fontSizeScale);
            if (!Number.isFinite(scale)) throw new Error('全局字号缩放必须是数字');
            config.fontSizeScale = Math.max(80, Math.min(150, Math.round(scale)));
        }
        // 课程字体与字号：字体需为字符串，字号限定 12–32
        if (config.courseFont !== undefined && config.courseFont !== null && typeof config.courseFont !== 'string') {
            throw new Error('课程字体必须是字符串');
        }
        if (config.courseFontSize !== undefined && config.courseFontSize !== null) {
            const size = Number(config.courseFontSize);
            if (!Number.isFinite(size)) throw new Error('课程字号必须是数字');
            config.courseFontSize = Math.max(12, Math.min(32, Math.round(size)));
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

    /** 脱敏显示：仅保留首尾字符，避免预览时暴露完整私钥 */
    maskSecret(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        // PEM 私钥统一显示为固定占位，避免露出 "----" 之类的头部片段
        if (/-----BEGIN/.test(text)) return '•••••••• (PEM 私钥已隐藏)';
        if (text.length <= 8) return '••••••';
        return `${text.slice(0, 4)}••••${text.slice(-4)}`;
    },

    /** 构建导入配置的预览 HTML（所有动态内容均已转义） */
    buildConfigPreview(config, source, sectionsOnly = false) {
        const esc = (value) => this.escapeHtml(value);
        const currentVersion = String(window.NL_APPVERSION || '').trim();
        const fileVersion = String(config?.version || '').trim();
        const versionMatch = Boolean(fileVersion) && fileVersion === currentVersion;
        const weather = config?.weather || {};
        const jwt = weather.jwtConfig || {};
        const courses = config?.courses || {};

        // 统计课程数量与已配置的天数
        let totalCourses = 0;
        let activeDays = 0;
        const dayKeys = Object.keys(DAY_MAP);
        dayKeys.forEach((day) => {
            const list = Array.isArray(courses[day]) ? courses[day] : [];
            if (list.length) activeDays += 1;
            totalCourses += list.length;
        });

        /**
         * 生成预览条目。
         * @param {string} label 字段名
         * @param {*} value 字段值
         * @param {{secret?: boolean, critical?: boolean}} options
         *   secret: 脱敏显示；critical: 关键字段（红标突出，覆盖已有配置时尤其重要）
         */
        const item = (label, value, options = {}) => {
            const { secret = false, critical = false } = options;
            const text = secret ? this.maskSecret(value) : String(value ?? '').trim();
            const display = text ? esc(text) : '未设置';
            const classes = [];
            if (!text) classes.push('empty');
            if (critical) classes.push('critical');
            const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
            const title = text && !secret ? ` title="${esc(text)}"` : '';
            const mark = critical ? '<i class="import-preview-critical-mark" aria-hidden="true">●</i>' : '';
            return `<div class="import-preview-item${critical ? ' is-critical' : ''}"><span>${mark}${esc(label)}</span><b${cls}${title}>${display}</b></div>`;
        };

        const versionBadge = versionMatch
            ? '<span class="import-preview-badge">版本一致</span>'
            : `<span class="import-preview-badge warning">${fileVersion ? '版本不一致' : '无版本信息'}</span>`;

        const meta = [
            `<span>来源：<b>${esc(source || '未知')}</b></span>`,
            `<span>文件版本：<b>${esc(fileVersion ? `v${fileVersion}` : '无')}</b></span>`,
            `<span>当前版本：<b>v${esc(currentVersion || '未知')}</b></span>`,
            versionBadge
        ].join('');

        const weatherGrid = [
            item('API Host', weather.apiHost, { critical: true }),
            item('经纬度', weather.location, { critical: true }),
            item('地区名称', weather.realLocation),
            item('刷新间隔', weather.weatherRefreshMinutes ? `${weather.weatherRefreshMinutes} 分钟` : ''),
            item('JWT KID', jwt.kid, { secret: true }),
            item('JWT SUB', jwt.sub, { secret: true }),
            item('JWT ISS', jwt.iss, { secret: true }),
            item('私钥', jwt.privateKey, { secret: true, critical: true })
        ].join('');

        const daysHtml = dayKeys.map((day) => {
            const count = Array.isArray(courses[day]) ? courses[day].length : 0;
            const cls = count ? 'import-preview-day has-course' : 'import-preview-day';
            return `<span class="${cls}">${esc(DAY_MAP[day])} · ${count} 节</span>`;
        }).join('');

        // 列出今日所配课程明细供快速核对
        const todayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
        const todayCourses = (Array.isArray(courses[todayKey]) ? courses[todayKey] : [])
            .filter((c) => c && c.start && c.end)
            .slice()
            .sort((a, b) => String(a.start).localeCompare(String(b.start)));
        const courseListHtml = todayCourses.length
            ? todayCourses.map((course) => `
                <div class="import-preview-course">
                    <time>${esc(course.start)}–${esc(course.end)}</time>
                    <em>${esc(course.course || '未命名课程')}</em>
                </div>`).join('')
            : '<span class="import-preview-note">今日暂无课程安排</span>';

        const displayGrid = [
            item('主题', config?.theme, { critical: true }),
            item('全局字体', config?.fontFamily ? String(config.fontFamily).split(',')[0].replace(/'/g, '') : ''),
            item('整体字号', config?.fontSizeScale ? `${config.fontSizeScale}%` : ''),
            item('课程字体', config?.courseFont ? String(config.courseFont).split(',')[0].replace(/'/g, '') : ''),
            item('课程字号', config?.courseFontSize ? `${config.courseFontSize} px` : ''),
            item('底部字号', config?.bottomFontSize ? `${config.bottomFontSize} px` : ''),
            item('底部颜色', config?.bottomColor),
            item('倒计时名称', config?.countdownName),
            item('目标日期', config?.countdownDate),
            item('文本 1', config?.customTexts?.one),
            item('文本 2', config?.customTexts?.two),
            item('文本 3', config?.customTexts?.three)
        ].join('');

        const subjects = Array.isArray(config?.subjects) ? config.subjects : [];
        const subjectText = subjects.length ? subjects.slice(0, 12).join('、') + (subjects.length > 12 ? ` 等 ${subjects.length} 项` : '') : '';

        const sections = `
                <div class="import-preview-section">
                    <div class="import-preview-title">天气配置<span>${esc(weather.apiHost ? '已配置' : '未配置')}</span></div>
                    <div class="import-preview-grid">${weatherGrid}</div>
                </div>
                <div class="import-preview-section">
                    <div class="import-preview-title">课程表<span>共 ${totalCourses} 节 · ${activeDays} 天</span></div>
                    <div class="import-preview-days">${daysHtml}</div>
                </div>
                <div class="import-preview-section">
                    <div class="import-preview-title">今日课程（${esc(DAY_MAP[todayKey])}）<span>${todayCourses.length} 节</span></div>
                    <div class="import-preview-list">${courseListHtml}</div>
                </div>
                <div class="import-preview-section">
                    <div class="import-preview-title">显示设置<span>${esc(subjectText ? `课程名称 ${subjects.length} 项` : '')}</span></div>
                    <div class="import-preview-grid">${displayGrid}</div>
                    ${subjectText ? `<div class="import-preview-list"><span class="import-preview-note">课程名称：${esc(subjectText)}</span></div>` : ''}
                </div>`;
        // 导出预览只需分区内容，不重复展示来源/版本等元信息
        if (sectionsOnly) return sections;

        return `
            <div class="import-preview">
                <div class="import-preview-meta">${meta}</div>
                <div class="import-preview-legend">
                    <i class="import-preview-critical-mark" aria-hidden="true">●</i>标记项为关键配置，导入后将覆盖当前设置
                </div>${sections}
            </div>`;
    },

    /**
     * 展示导入预览并询问是否继续。
     * 版本一致与不一致使用不同的标题、图标与提示文案，避免用户忽略风险。
     */
    async confirmImportPreview(config, source) {
        const currentVersion = String(window.NL_APPVERSION || '').trim();
        const fileVersion = String(config?.version || '').trim();
        const versionMatch = Boolean(fileVersion) && fileVersion === currentVersion;
        const noteHtml = versionMatch
            ? `<div class="import-preview-note">配置版本与当前应用一致，点击「导入并保存」将立即生效。</div>`
            : `<div class="import-preview-warn">
                   <strong>⚠ 版本不一致，请谨慎导入</strong>
                   <span>文件版本：${this.escapeHtml(fileVersion ? `v${fileVersion}` : '无版本信息')} · 当前版本：v${this.escapeHtml(currentVersion || '未知')}</span>
                   <span>部分设置可能无法正确读取或丢失，导入后建议逐项核对。</span>
               </div>`;
        const html = this.buildConfigPreview(config, source) + `<div class="import-preview">${noteHtml}</div>`;
        void Logger.info('展示导入预览', {
            module: 'config',
            action: 'preview',
            context: { source, fileVersion: fileVersion || null, currentVersion, versionMatch }
        });
        const confirmed = await Dialog.show({
            title: versionMatch ? '导入前预览' : '导入前预览 · 版本不一致',
            html,
            wide: true,
            type: versionMatch ? 'info' : 'warning',
            buttons: [
                { text: '取消', value: false },
                { text: versionMatch ? '导入并保存' : '仍然导入', value: true, primary: true }
            ]
        });
        return confirmed === true;
    },

    /**
     * 导入配置：预览确认后直接写入持久化并返回主页。
     * 版本不一致时先给出独立的风险提示，确认后再导入。
     */
    async applyImportedConfig(imported, source) {
        this.validateConfig(imported);
        const currentVersion = String(window.NL_APPVERSION || '').trim();
        const fileVersion = String(imported?.version || '').trim();
        const versionMatch = Boolean(fileVersion) && fileVersion === currentVersion;

        const wasSettingsHidden = this.el.viewSettings.classList.contains('hidden');
        if (wasSettingsHidden) {
            await this.positionWindow(APP_CONFIG.settingsSize);
        }

        let proceed = false;
        try {
            // 版本不一致时先单独提示，与正常导入区分开
            if (!versionMatch) {
                await Dialog.alert(
                    [
                        '该配置文件由其他版本的 ClassBroom 导出。',
                        '',
                        `文件版本：${fileVersion ? `v${fileVersion}` : '无版本信息'}`,
                        `当前版本：v${currentVersion || '未知'}`,
                        '',
                        '导入后部分设置可能无法正确读取或丢失，建议导入后逐项核对。'
                    ].join('\n'),
                    '版本不一致',
                    'warning'
                );
            }
            proceed = await this.confirmImportPreview(imported, source);
        } finally {
            if (!proceed && wasSettingsHidden) {
                await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
            }
        }
        if (!proceed) {
            void Logger.info('用户取消导入', { module: 'config', action: 'import-cancel', context: { source } });
            return false;
        }

        if (!imported.weather.jwtConfig) imported.weather.jwtConfig = {};
        if (!imported.courses) imported.courses = {};
        if (!Array.isArray(imported.subjects)) imported.subjects = [];
        // version 仅用于导入校验，不进入应用数据
        delete imported.version;

        // 导入即保存，无需再回设置页手动点保存
        EditData = imported;
        try {
            const autoStartError = await this.persistSettings({ trigger: 'import', source, versionMatch });
            void Logger.info('导入配置已保存', { module: 'config', action: 'import-save', context: { source, versionMatch } });
            // 此时窗口已缩回主界面高度，弹窗需临时放大才能正常显示，避免被压扁
            await this.showDialogWithRoom(() => {
                if (autoStartError) {
                    return Dialog.alert(
                        `配置已导入并保存，但开机自启设置失败。\n${autoStartError.message || autoStartError}`,
                        '开机自启设置失败',
                        'warning'
                    );
                }
                return Dialog.alert(
                    versionMatch
                        ? '配置已导入并保存，界面已按新设置刷新。'
                        : '配置已导入并保存。由于版本不一致，请检查课表与天气设置是否正确。',
                    versionMatch ? '导入成功' : '导入成功 · 版本不一致',
                    versionMatch ? 'info' : 'warning'
                );
            });
        } catch (error) {
            void Logger.error('导入配置保存失败', { module: 'config', action: 'import-save' }, error);
            // 保存失败时保持设置页并复原窗口尺寸，错误交由调用方统一提示
            if (wasSettingsHidden) {
                await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
            }
            throw error;
        }
        return true;
    },

    async showDialogWithRoom(showFn) {
        const inSettings = !this.el.viewSettings.classList.contains('hidden');
        if (inSettings) return showFn();
        await this.positionWindow(APP_CONFIG.settingsSize);
        try {
            return await showFn();
        } finally {
            await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
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
            await this.showDialogWithRoom(() => Dialog.alert('一次只能拖入一个 JSON 配置文件', '导入失败', 'warning'));
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
            const applied = await this.applyImportedConfig(imported, fileName);
            if (!applied) return;
            void Logger.info('配置拖入成功', {
                module: 'config',
                action: 'drag-import',
                context: { fileName }
            });
        } catch (error) {
            void Logger.error('配置拖入失败', { module: 'config', action: 'drag-import' }, error);
            await this.showDialogWithRoom(() => Dialog.alert(error.message || String(error), '导入失败', 'danger'));
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
            const applied = await this.applyImportedConfig(imported, paths[0]);
            if (!applied) return;
            void Logger.info('配置导入成功', { module: 'config', action: 'import', context: { filePath: paths[0] } });
        } catch (error) {
            void Logger.error('配置导入失败', { module: 'config', action: 'import' }, error);
            await this.showDialogWithRoom(() => Dialog.alert(error.message || String(error), '导入失败', 'danger'));
        }
    },

    /**
     * 按固定顺序整理导出数据，让导出的 JSON 结构可读、字段含义清晰。
     * 未知字段统一追加在末尾，保证向后兼容不丢配置。
     */
    buildExportPayload(source) {
        const clone = JSON.parse(JSON.stringify(source || {}));
        const weather = clone.weather || {};
        const jwt = weather.jwtConfig || {};
        const customTexts = clone.customTexts || {};
        // 按导出顺序组装：元信息 → 外观 → 课程表 → 天气 → 自定义文本
        const payload = {
            version: window.NL_APPVERSION || '',
            exportedAt: new Date().toISOString(),
            theme: clone.theme || 'default',
            fontFamily: clone.fontFamily || '',
            fontSizeScale: Math.max(80, Math.min(150, Number(clone.fontSizeScale) || 100)),
            courseFont: clone.courseFont || '',
            courseFontSize: Math.max(12, Math.min(32, Number(clone.courseFontSize) || 15)),
            customBottomText: clone.customBottomText || '',
            bottomFontSize: Math.max(8, Math.min(30, Number(clone.bottomFontSize) || 10)),
            bottomColor: clone.bottomColor || '#64748b',
            countdownName: clone.countdownName || '',
            countdownDate: clone.countdownDate || '',
            customTexts: {
                one: customTexts.one || '',
                two: customTexts.two || '',
                three: customTexts.three || ''
            },
            weatherRefreshMinutes: Number(clone.weatherRefreshMinutes) || 10,
            autoStart: clone.autoStart === true,
            subjects: Array.isArray(clone.subjects) ? clone.subjects : [],
            courses: clone.courses || {},
            weather: {
                apiHost: weather.apiHost || '',
                location: weather.location || '',
                realLocation: weather.realLocation || '',
                jwtConfig: {
                    kid: jwt.kid || '',
                    sub: jwt.sub || '',
                    iss: jwt.iss || '',
                    privateKey: jwt.privateKey || ''
                }
            }
        };
        // 附录：保留模板/版本等未知字段，避免导出时丢失
        const known = new Set(['version', 'exportedAt', 'theme', 'fontFamily', 'fontSizeScale', 'courseFont',
            'courseFontSize', 'customBottomText', 'bottomFontSize', 'bottomColor', 'countdownName', 'countdownDate',
            'customTexts', 'weatherRefreshMinutes', 'autoStart', 'subjects', 'courses', 'weather']);
        Object.keys(clone).forEach((key) => {
            if (!known.has(key)) payload[key] = clone[key];
        });
        return payload;
    },

    /** 导出预览：用与导入一致的分区卡片展示将要写入的配置（敏感字段脱敏） */
    buildExportPreview(payload, path) {
        const sections = this.buildConfigPreview(payload, path, true);
        return `<div class="import-preview">
            <div class="import-preview-legend">导出文件已按「外观 → 课程表 → 天气」的顺序整理，可直接分享或备份</div>
            ${sections}
            <div class="import-preview-path">保存位置：${this.escapeHtml(path)}</div>
        </div>`;
    },

    async exportConfig() {
        try {
            const inSettings = !this.el.viewSettings.classList.contains('hidden');
            const payload = this.buildExportPayload(inSettings ? EditData : AppData);
            const path = await Neutralino.os.showSaveDialog('导出 ClassBroom 配置', {
                forceOverwrite: true,
                defaultPath: 'classbroom-config.json',
                filters: [{ name: 'JSON 配置', extensions: ['json'] }]
            });
            if (!path) return;
            let exists = false;
            try {
                const stats = await Neutralino.filesystem.getStats(path);
                exists = Boolean(stats?.isFile);
            } catch (error) {
                exists = false;
            }
            if (exists) {
                if (!inSettings) await this.positionWindow(APP_CONFIG.settingsSize);
                let confirmed = false;
                try {
                    confirmed = await Dialog.confirm(`文件已存在，是否覆盖？\n${path}`, {
                        title: '覆盖已有文件',
                        confirmText: '覆盖',
                        cancelText: '取消',
                        type: 'warning'
                    });
                } finally {
                    if (!confirmed && !inSettings) await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
                }
                if (!confirmed) return;
            }
            // 导出前预览，避免把未确认的配置写进文件（设置页中的修改可能是未保存的草稿）
            const confirmed = await Dialog.show({
                title: '导出前预览',
                html: this.buildExportPreview(payload, path),
                wide: true,
                type: 'info',
                buttons: [
                    { text: '取消', value: false },
                    { text: '写入文件', value: true, primary: true }
                ]
            });
            if (confirmed !== true) return;
            await Neutralino.filesystem.writeFile(path, JSON.stringify(payload, null, 2));
            void Logger.info('配置导出成功', { module: 'config', action: 'export', context: { filePath: path, version: payload.version } });
            if (!inSettings) await this.positionWindow(APP_CONFIG.settingsSize);
            await Dialog.alert(path, '导出成功');
            if (!inSettings) await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
        } catch (error) {
            void Logger.error('配置导出失败', { module: 'config', action: 'export' }, error);
            await Dialog.alert(error.message || String(error), '导出失败', 'danger');
        }
    },

    async openSettings(configToEdit = null) {
        EditData = configToEdit
            ? JSON.parse(JSON.stringify(configToEdit))
            : JSON.parse(JSON.stringify(AppData));
        if (!EditData.weather) EditData.weather = { jwtConfig: {} };
        if (!EditData.weather.jwtConfig) EditData.weather.jwtConfig = {};
        if (!EditData.courses) EditData.courses = {};

        // 天气字段必须完整回填，否则保存时会用空值覆盖已有配置
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
        this.el.inputCourseFont.value = EditData.courseFont || '';
        this.el.inputCourseFontSize.value = EditData.courseFontSize || 15;
        this.el.inputFontFamily.value = EditData.fontFamily || '';
        this.el.inputFontSizeScale.value = EditData.fontSizeScale || 100;
        this.syncFontSizeScaleLabel();
        this.syncRangeLabels();
        this.updateFontPreview();
        // 同步自定义下拉的显示值（原生 select 已替换为自定义组件）
        CustomSelect.setValue('select-theme', this.el.inputTheme.value);
        CustomSelect.setValue('select-theme-main', this.el.inputTheme.value);
        CustomSelect.setValue('select-font-family', this.el.inputFontFamily.value);
        CustomSelect.setValue('select-course-font', this.el.inputCourseFont.value);
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
        this.el.btnSaveSettings.disabled = true;

        await this.animateWindowSize(APP_CONFIG.settingsSize);
        await this.setWindowDragRegion('settings');
    },

    async closeSettings() {
        this.el.viewSettings.classList.add('hidden');
        this.el.viewMain.classList.remove('hidden');

        // 重置宽度记录，回到主界面后重新按内容自适应
        this.appliedMainWidth = APP_CONFIG.windowSize.width;
        await this.animateWindowSize(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
        await this.setWindowDragRegion('main');
        this.scheduleFitWindow(200);
    },

    getSettingsSnapshot() {
        const fields = [
            'inputApiHost', 'inputLocation', 'inputRealLocation', 'inputKid', 'inputSub', 'inputIss',
            'inputPrivateKey', 'inputTheme', 'inputWeatherRefreshMinutes', 'inputCustomBottomText',
            'inputCountdownName', 'inputCountdownDate', 'inputBottomFontSize', 'inputBottomColor',
            'inputCourseFont', 'inputCourseFontSize', 'inputFontFamily', 'inputFontSizeScale',
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

    async persistSettings(context = {}) {
        let autoStartError = null;
        try {
            await Startup.setEnabled(EditData.autoStart);
        } catch (error) {
            autoStartError = error;
            void Logger.error('开机自启设置失败', { module: 'startup', action: 'save' }, error);
        }
        await Logger.measure('设置保存', async () => {
            await Store.saveToRegistry(EditData);
            AppData = JSON.parse(JSON.stringify(EditData));
        }, {
            module: 'config',
            action: 'save',
            context: {
                theme: EditData.theme,
                weatherRefreshMinutes: EditData.weatherRefreshMinutes,
                courseDays: Object.keys(EditData.courses || {}).length,
                ...context
            }
        });
        this.scheduleTrayUpdate();
        await this.closeSettings();
        await App.init();
        return autoStartError;
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
            await Dialog.alert('天气刷新间隔须为 1 到 1440 分钟', '参数无效', 'warning');
            return;
        }
        EditData.weatherRefreshMinutes = weatherRefreshMinutes;
        EditData.autoStart = this.el.inputAutoStart.checked;
        EditData.theme = this.el.inputTheme.value;
        EditData.customBottomText = this.el.inputCustomBottomText.value.trim();
        EditData.countdownName = this.el.inputCountdownName.value.trim();
        EditData.countdownDate = this.el.inputCountdownDate.value;
        EditData.bottomFontSize = Math.max(8, Math.min(30, Number(this.el.inputBottomFontSize.value) || 10));
        // 课程名称字体与字号：字体为空时跟随全局 sans-serif，字号限定 12–32
        EditData.courseFont = this.el.inputCourseFont.value || '';
        EditData.courseFontSize = Math.max(12, Math.min(32, Number(this.el.inputCourseFontSize.value) || 15));
        // 全局字体：字体为空时保留系统默认
        EditData.fontFamily = this.el.inputFontFamily.value || '';
        EditData.fontSizeScale = Math.max(80, Math.min(150, Number(this.el.inputFontSizeScale.value) || 100));
        EditData.bottomColor = this.el.inputBottomColor.value || '#64748b';
        EditData.customTexts = {
            one: this.el.inputCustomOne.value.trim(),
            two: this.el.inputCustomTwo.value.trim(),
            three: this.el.inputCustomThree.value.trim()
        };
        if (!Array.isArray(EditData.subjects)) EditData.subjects = [];

        try {
            const autoStartError = await this.persistSettings({ trigger: 'save-button' });
            if (autoStartError) {
                await Dialog.alert(`其余配置已保存。\n${autoStartError.message || autoStartError}`, '开机自启设置失败', 'warning');
            }
        } catch (error) {
            void Logger.error('设置保存失败', { module: 'config', action: 'save' }, error);
            await Dialog.alert(`保存失败，请检查内容！\n${error.message}`, '保存失败', 'danger');
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

                // 触屏操作时明确当前作用于哪个时间点，步进按钮与轨道点击都按它执行
                let activeTarget = 'start';
                let stepperLabelEl = null;
                const setActiveTarget = (target) => {
                    activeTarget = target;
                    startLabel.classList.toggle('active', target === 'start');
                    endLabel.classList.toggle('active', target === 'end');
                    if (stepperLabelEl) stepperLabelEl.textContent = target === 'start' ? '调节开始' : '调节结束';
                };

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
                    this.markSettingsDirty();
                };

                /** 按步长加减某一端时间，触屏下比拖拽更精确 */
                const stepTime = (target, step) => {
                    if (target === 'start') startMinutes += step;
                    else endMinutes += step;
                    setActiveTarget(target);
                    updateRange(target === 'start' ? startThumb : endThumb);
                };

                const updateThumbFromPointer = (thumb, event) => {
                    const rect = track.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                    const minutes = snapMinutes(MIN_COURSE_TIME + ratio * (MAX_COURSE_TIME - MIN_COURSE_TIME));
                    if (thumb === startThumb) startMinutes = Math.min(minutes, endMinutes - COURSE_TIME_STEP);
                    else endMinutes = Math.max(minutes, startMinutes + COURSE_TIME_STEP);
                    setActiveTarget(thumb === startThumb ? 'start' : 'end');
                    updateRange(thumb);
                };
                let draggedThumb = null;
                let dragStartX = 0;
                let dragMoved = false;
                const DRAG_THRESHOLD = 6;
                track.addEventListener('pointerdown', (event) => {
                    if (event.target === startThumb || event.target === endThumb) return;
                    event.stopPropagation();
                    draggedThumb = null;
                    dragStartX = event.clientX;
                    dragMoved = false;
                    track.setPointerCapture(event.pointerId);
                });
                track.addEventListener('pointermove', (event) => {
                    if (!track.hasPointerCapture(event.pointerId)) return;
                    if (!dragMoved && Math.abs(event.clientX - dragStartX) < DRAG_THRESHOLD) return;
                    if (!dragMoved) {
                        // 超过阈值才认定为拖动，避免触屏轻点轨道时时间被瞬间跳到远处
                        dragMoved = true;
                        const rect = track.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (dragStartX - rect.left) / rect.width));
                        const startPosMinutes = snapMinutes(MIN_COURSE_TIME + ratio * (MAX_COURSE_TIME - MIN_COURSE_TIME));
                        draggedThumb = Math.abs(startPosMinutes - startMinutes) <= Math.abs(startPosMinutes - endMinutes)
                            ? startThumb
                            : endThumb;
                    }
                    updateThumbFromPointer(draggedThumb, event);
                });
                track.addEventListener('pointerup', (event) => {
                    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
                    if (!dragMoved) {
                        const rect = track.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                        const clickMinutes = snapMinutes(MIN_COURSE_TIME + ratio * (MAX_COURSE_TIME - MIN_COURSE_TIME));
                        setActiveTarget(Math.abs(clickMinutes - startMinutes) <= Math.abs(clickMinutes - endMinutes) ? 'start' : 'end');
                    }
                    draggedThumb = null;
                    dragMoved = false;
                });
                track.addEventListener('pointercancel', () => { draggedThumb = null; dragMoved = false; });
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

                const actions = document.createElement('div');
                actions.className = 'course-time-actions';

                const steppers = document.createElement('div');
                steppers.className = 'course-time-steppers';
                const stepConfigs = [
                    { text: '-5', step: -COURSE_TIME_STEP, label: '向前 5 分钟' },
                    { text: '-10', step: -COURSE_TIME_STEP * 2, label: '向前 10 分钟' },
                    { text: '+5', step: COURSE_TIME_STEP, label: '向后 5 分钟' },
                    { text: '+10', step: COURSE_TIME_STEP * 2, label: '向后 10 分钟' }
                ];
                stepConfigs.forEach(({ text, step, label }) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'course-time-stepper';
                    button.textContent = text;
                    button.title = `${label}（作用于当前选中的时间点）`;
                    button.setAttribute('aria-label', label);
                    button.addEventListener('click', (event) => {
                        event.stopPropagation();
                        stepTime(activeTarget, step);
                    });
                    steppers.appendChild(button);
                });

                const stepperLabel = document.createElement('span');
                stepperLabel.className = 'course-time-step-label';
                steppers.appendChild(stepperLabel);
                stepperLabelEl = stepperLabel;

                const presets = document.createElement('div');
                presets.className = 'course-time-presets';
                const presetDurations = [40, 45, 50];
                presetDurations.forEach((duration) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'course-time-preset';
                    button.textContent = `${duration}分钟`;
                    button.title = `将结束时间设为开始时间 + ${duration} 分钟`;
                    button.addEventListener('click', (event) => {
                        event.stopPropagation();
                        endMinutes = startMinutes + duration;
                        setActiveTarget('end');
                        updateRange(endThumb);
                    });
                    presets.appendChild(button);
                });

                actions.append(steppers, presets);
                group.appendChild(actions);

                startLabel.addEventListener('click', (event) => {
                    event.stopPropagation();
                    setActiveTarget('start');
                });
                endLabel.addEventListener('click', (event) => {
                    event.stopPropagation();
                    setActiveTarget('end');
                });

                setActiveTarget('start');
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
                    this.markSettingsDirty();
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
                AutoFillGuard.apply(customInput);
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
                    this.markSettingsDirty();
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
                this.markSettingsDirty();
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
                    this.markSettingsDirty();
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
                this.markSettingsDirty();
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
        this.markSettingsDirty();
    },

    addCourseRow() {
        if (!EditData.courses[CurrentEditDay]) EditData.courses[CurrentEditDay] = [];
        EditData.courses[CurrentEditDay].push({ start: '08:00', end: '08:45', course: '' });
        CurrentEditCourseIndex = EditData.courses[CurrentEditDay].length - 1;
        setTimeout(() => { this.el.courseList.scrollTop = this.el.courseList.scrollHeight; }, 10);
        this.renderCourseList();
        this.markSettingsDirty();
    },

    timelineSignature: null,
    renderTimeline(courses) {        const now = new Date();
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
        // 课程名称/时刻可能被挤压截断，渲染后统一检测布局
        this.scheduleFitWindow();
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
    renderWeather(weather, warning) {
        const w = weather || { temp: "--°", desc: "无数据" };
        const hasWarning = Boolean(warning?.hasWarning);
        let warnHtml = '';
        if (hasWarning) {
            const color = this.getWarningColor(warning);
            const headline = this.escapeHtml(warning.headline);
            const event = this.escapeHtml(warning.event);
            // 预警仅作状态展示，不再提供跳转
            warnHtml = `<div class="weather-warning" style="--warning-color: ${color}" title="${headline}" role="status">${ICONS.warn}<span>${event}</span></div>`;
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
                    <div class="desc" title="${this.escapeHtml(w.desc)}">${this.escapeHtml(w.desc)}</div>
                </div>
            </div>
            ${warnHtml}
        `;
        this.renderCustomBottomInfo();
        // 课程名称可能因课程数量多而被挤压截断，渲染后检测布局
        this.scheduleFitWindow();
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
        UI.applyFontStyles();
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
    AutoFillGuard.init();
    await UI.init();
    await App.init();
};