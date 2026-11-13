Neutralino.init();
window.addEventListener('contextmenu', e => e.preventDefault());

const AutoFillGuard = {
    skipTypes: /^(checkbox|radio|button|submit|reset|hidden|color|range|file)$/i,
    apply(element) {
        if (!element || !(element instanceof HTMLElement)) return;
        const tag = element.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
        const type = (element.getAttribute('type') || 'text').toLowerCase();
        if (this.skipTypes.test(type)) return;
        if (element.hasAttribute('name')) element.removeAttribute('name');
        if (tag === 'INPUT' && (type === 'password' || type === 'email')) {
            if (type !== 'password' || !element.hasAttribute('data-secret')) element.setAttribute('type', 'text');
        }
        const isTextLike = tag === 'TEXTAREA' || /^(text|search|url|tel|)$/i.test(type);
        const wanted = element.hasAttribute('list') ? 'off' : isTextLike ? 'new-password' : 'off';
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
    windowSize: { width: 1400, height: 76 },
    settingsSize: { width: 1400, height: 800 },
    maxWindowWidth: 1920,
    topOffset: 20,
    documentRoot: '/www/',
    excludeDrag: ["btn-refresh", "btn-close", "btn-settings"],
    releasesApi: 'https://api.github.com/repos/JunLoye/ClassBroom/releases/latest',
    releasesPage: 'https://github.com/JunLoye/ClassBroom/releases/latest',
    weatherProviders: {
        qweather: { label: '和风天气', url: 'https://console.qweather.com/' },
        openMeteo: { label: 'Open-Meteo', url: 'https://open-meteo.com/en/docs' },
        weatherApi: { label: 'WeatherAPI.com', url: 'https://www.weatherapi.com/my/' },
        openWeatherMap: { label: 'OpenWeatherMap', url: 'https://home.openweathermap.org/api_keys' }
    },
    updateCheckIntervalMs: 24 * 60 * 60 * 1000
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

const FORMAT_VERSION = 2;
const SENSITIVE_WEATHER_FIELDS = ['apiHost', 'location', 'apiKey'];
const SENSITIVE_JWT_FIELDS = ['privateKey'];

let AppData = { weather: {}, courses: {} };
let EditData = {}; 
let CurrentEditDay = 'mon';
let CurrentEditCourseIndex = null;
let CurrentEditWeek = 1;
let CurrentEditMode = 'regular';
let CurrentOverrideDate = '';

const SecretVault = {
    WRAP_KEY_NAME: 'cb.vault.wrap',
    BACKEND_NAMES: { Windows: ['classbroom-crypto.exe'] },
    masterKey: null,
    backendPath: null,
    secrets: new Map(),

    toBase64(buffer) {
        let binary = '';
        for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
        return btoa(binary);
    },

    fromBase64(text) {
        const binary = atob(text);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes;
    },

    async getKey() {
        if (this.masterKey) return this.masterKey;
        this.masterKey = await this.unwrapSessionKey() || await this.createSessionKey();
        return this.masterKey;
    },

    async createSessionKey() {
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const wrapKey = crypto.getRandomValues(new Uint8Array(32));
        const kek = await crypto.subtle.importKey('raw', wrapKey, 'AES-GCM', false, ['wrapKey', 'unwrapKey']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.wrapKey('raw', key, kek, { name: 'AES-GCM', iv });
        const payload = { dt: this.toBase64(wrapKey), iv: this.toBase64(iv), dk: this.toBase64(wrapped) };
        const payloadCipher = await this.aesEncrypt(wrapKey, JSON.stringify(payload), crypto.getRandomValues(new Uint8Array(12)));
        const stored = await this.callBackend('encrypt', JSON.stringify(payloadCipher));
        if (stored) {
            try { sessionStorage.setItem(this.WRAP_KEY_NAME, JSON.stringify({ dpapi: stored })); } catch (error) { }
        }
        return key;
    },

    async unwrapSessionKey() {
        let record;
        try {
            const stored = sessionStorage.getItem(this.WRAP_KEY_NAME);
            if (!stored) return null;
            record = JSON.parse(stored);
        } catch (error) {
            return null;
        }
        try {
            if (typeof record.dpapi !== 'string' || !record.dpapi) return null;
            const inner = await this.callBackend('decrypt', record.dpapi);
            if (!inner) return null;
            const payload = JSON.parse(inner);
            const kek = await crypto.subtle.importKey('raw', this.fromBase64(payload.dt), 'AES-GCM', false, ['unwrapKey']);
            return await crypto.subtle.unwrapKey('raw', this.fromBase64(payload.dk), kek, { name: 'AES-GCM', iv: this.fromBase64(payload.iv) }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        } catch (error) {
            try { sessionStorage.removeItem(this.WRAP_KEY_NAME); } catch (ignored) { }
            return null;
        }
    },

    async aesEncrypt(key, plain, iv) {
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
        return { alg: 'AES-GCM', iv: this.toBase64(iv), data: this.toBase64(cipher) };
    },

    resolveBackendPath() {
        if (this.backendPath) return this.backendPath;
        const candidates = [];
        const cwd = typeof window.NL_CWD === 'string' ? window.NL_CWD : '';
        const resources = typeof window.NL_PATH === 'string' ? window.NL_PATH : '';
        const documentRoot = String(APP_CONFIG?.documentRoot || '/www/').replace(/^\/+|\/+$/g, '');
        const names = this.BACKEND_NAMES[window.NL_OS] || [];
        const bases = [resources, cwd].filter(Boolean);
        for (const base of bases) {
            for (const name of names) {
                const separator = base.includes('\\') ? '\\' : '/';
                candidates.push(`${base.replace(/[\\/]+$/, '')}${separator}${name}`);
            }
        }
        for (const base of bases) {
            for (const name of names) {
                const separator = base.includes('\\') ? '\\' : '/';
                candidates.push(`${base.replace(/[\\/]+$/, '')}${separator}backend${separator}${name}`);
                candidates.push(`${base.replace(/[\\/]+$/, '')}${separator}${documentRoot}${separator}backend${separator}${name}`);
            }
        }
        this.backendPath = candidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0) || null;
        return this.backendPath;
    },

    async callBackend(mode, payload) {
        const path = this.resolveBackendPath();
        if (!path) return null;
        try {
            const exists = await Neutralino.filesystem.getStats(path);
            if (!exists?.isFile) return null;
        } catch (error) {
            return null;
        }
        try {
            const command = `"${path.replace(/"/g, '""')}" ${mode}`;
            const result = await Neutralino.os.execCommand(command, { stdIn: String(payload) });
            if (result.exitCode !== 0) return null;
            const parsed = JSON.parse(String(result.stdOut || '').trim() || '{}');
            return typeof parsed.data === 'string' ? parsed.data : null;
        } catch (error) {
            return null;
        }
    },

    async sealRecord(plain) {
        const protectedPlain = await this.callBackend('encrypt', plain);
        if (typeof protectedPlain === 'string' && protectedPlain.length) {
            return { alg: 'DPAPI', dpapi: protectedPlain };
        }
        const key = await this.getKey();
        const record = await this.aesEncrypt(key, plain, crypto.getRandomValues(new Uint8Array(12)));
        const wrapped = await this.callBackend('encrypt', JSON.stringify(record));
        if (typeof wrapped === 'string' && wrapped.length) record.dpapi = wrapped;
        return record;
    },

    async openRecord(record) {
        if (record?.alg === 'DPAPI' && typeof record.dpapi === 'string' && record.dpapi.length) {
            return await this.callBackend('decrypt', record.dpapi);
        }
        if (!record || typeof record.data !== 'string') return null;
        let source = record;
        if (typeof record.dpapi === 'string' && record.dpapi.length) {
            const inner = await this.callBackend('decrypt', record.dpapi);
            if (inner) {
                try { source = JSON.parse(inner); } catch (error) { source = record; }
            }
        }
        const key = await this.getKey();
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: this.fromBase64(source.iv) },
            key,
            this.fromBase64(source.data)
        );
        return new TextDecoder().decode(plain);
    },

    async encryptText(text) {
        if (typeof text !== 'string' || !text) return null;
        try {
            return await this.sealRecord(text);
        } catch (error) {
            void Logger.warn('敏感字段加密失败', { module: 'vault', action: 'encrypt' }, error);
            return null;
        }
    },

    async decryptText(record) {
        if (!record || typeof record !== 'object') return '';
        try {
            return await this.openRecord(record) || '';
        } catch (error) {
            void Logger.warn('敏感字段解密失败', { module: 'vault', action: 'decrypt' }, error);
            return '';
        }
    },

    remember(kind, value) {
        if (typeof value !== 'string' || !value) {
            this.secrets.delete(kind);
            return;
        }
        this.secrets.set(kind, value);
    },

    recall(kind) {
        return this.secrets.get(kind) || '';
    },

    clearSecrets() {
        this.secrets.clear();
    },

    reset() {
        this.masterKey = null;
        this.secrets.clear();
        try { sessionStorage.removeItem(this.WRAP_KEY_NAME); } catch (error) { }
    },

    async sealConfig(config) {
        if (!config || typeof config !== 'object') return config;
        const clone = JSON.parse(JSON.stringify(config));
        clone.v = FORMAT_VERSION;
        const weather = clone.weather && typeof clone.weather === 'object' ? clone.weather : (clone.weather = {});
        const jwt = weather.jwtConfig && typeof weather.jwtConfig === 'object' ? weather.jwtConfig : (weather.jwtConfig = {});

        const sealField = async (target, field, kind) => {
            const value = target[field];
            if (typeof value === 'string' && value) {
                this.remember(kind, value);
            } else if (value && typeof value === 'object') {
                const plain = await this.decryptText(value);
                if (plain) this.remember(kind, plain);
            }
            const plain = this.recall(kind);
            if (!plain) return;
            const sealed = await this.encryptText(plain);
            if (sealed) target[field] = sealed;
        };

        for (const field of SENSITIVE_WEATHER_FIELDS) await sealField(weather, field, `weather:${field}`);
        for (const field of SENSITIVE_JWT_FIELDS) await sealField(jwt, field, `jwt:${field}`);
        for (const [provider, providerConfig] of Object.entries(weather.providers || {})) {
            if (!providerConfig || typeof providerConfig !== 'object') continue;
            await sealField(providerConfig, 'apiHost', `weather:${provider}:apiHost`);
            await sealField(providerConfig, 'apiKey', `weather:${provider}:apiKey`);
            if (!providerConfig.jwtConfig || typeof providerConfig.jwtConfig !== 'object') providerConfig.jwtConfig = {};
            await sealField(providerConfig.jwtConfig, 'privateKey', `jwt:${provider}:privateKey`);
        }
        return clone;
    },

    async unsealConfig(config) {
        if (!config || typeof config !== 'object') return config;
        const clone = JSON.parse(JSON.stringify(config));
        delete clone.v;
        const weather = clone.weather && typeof clone.weather === 'object' ? clone.weather : (clone.weather = {});
        const jwt = weather.jwtConfig && typeof weather.jwtConfig === 'object' ? weather.jwtConfig : (weather.jwtConfig = {});

        const restore = async (target, field, kind, redact = false) => {
            const value = target[field];
            if (value && typeof value === 'object') {
                const plain = await this.decryptText(value);
                if (plain) {
                    target[field] = redact ? '' : plain;
                    this.remember(kind, plain);
                    return;
                }
            }
            const plain = this.recall(kind);
            target[field] = redact ? '' : plain;
        };

        for (const field of SENSITIVE_WEATHER_FIELDS) await restore(weather, field, `weather:${field}`);
        for (const field of SENSITIVE_JWT_FIELDS) await restore(jwt, field, `jwt:${field}`);
        for (const [provider, providerConfig] of Object.entries(weather.providers || {})) {
            if (!providerConfig || typeof providerConfig !== 'object') continue;
            await restore(providerConfig, 'apiHost', `weather:${provider}:apiHost`, true);
            await restore(providerConfig, 'apiKey', `weather:${provider}:apiKey`, true);
            if (!providerConfig.jwtConfig || typeof providerConfig.jwtConfig !== 'object') providerConfig.jwtConfig = {};
            await restore(providerConfig.jwtConfig, 'privateKey', `jwt:${provider}:privateKey`, true);
        }
        return clone;
    }
};


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
        const sensitiveKeys = /private.?key|api.?key|password|token|secret|credential|apihost|location|^sub$|^iss$|^kid$/i;
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
    async getConfigPath() {
        try {
            return await Neutralino.filesystem.getJoinedPath(window.NL_DATAPATH, 'config.json');
        } catch (error) {
            return 'config.json';
        }
    },
    async init() {
        const configPath = await this.getConfigPath();
        try {
            const str = await Neutralino.filesystem.readFile(configPath);
            AppData = await SecretVault.unsealConfig(JSON.parse(str));
            return;
        } catch (error) { }

        if (window.NL_OS === 'Windows') {
            try {
                const res = await Neutralino.os.execCommand(`reg query "${REG_PATH}" /v ${REG_KEY}`);
                if (res.exitCode === 0) {
                    const match = res.stdOut.match(new RegExp(`${REG_KEY}\\s+REG_SZ\\s+(.+)`));
                    if (match && match[1]) {
                        const raw = JSON.parse(Base64Util.decode(match[1].trim()));
                        AppData = await SecretVault.unsealConfig(raw);
                        try {
                            const sealed = await SecretVault.sealConfig(AppData);
                            await Neutralino.filesystem.writeFile(configPath, JSON.stringify(sealed, null, 2));
                        } catch (error) {
                            void Logger.warn('迁移注册表配置到文件失败', { module: 'config', action: 'migrate' }, error);
                        }
                        return;
                    }
                }
            } catch (e) { }
        }
        try {
            const str = await Neutralino.filesystem.readFile('config.json');
            const raw = JSON.parse(str);
            AppData = await SecretVault.unsealConfig(raw);
            await this.saveToRegistry(AppData);
        } catch (e) {
            AppData = { weather: { jwtConfig: {} }, courses: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } };
        }
    },
    async saveToRegistry(data) {
        const sealed = await SecretVault.sealConfig(data);
        const serialized = JSON.stringify(sealed, null, 2);
        const configPath = await this.getConfigPath();
        await Neutralino.filesystem.writeFile(configPath, serialized);
        if (window.NL_OS !== 'Windows') {
            return;
        }
        const b64Str = Base64Util.encode(serialized);
        if (b64Str.length > 15000) return;
        try {
            const res = await Neutralino.os.execCommand(`reg add "${REG_PATH}" /v ${REG_KEY} /t REG_SZ /d "${b64Str}" /f`);
            if (res.exitCode !== 0) void Logger.warn('注册表兼容镜像写入失败，配置文件已保存', { module: 'config', action: 'registry-mirror' });
        } catch (error) {
            void Logger.warn('注册表兼容镜像写入失败，配置文件已保存', { module: 'config', action: 'registry-mirror' }, error);
        }
    },
    getWeatherConfig() { return AppData.weather || {}; },
    getTodayCourses() {
        return Schedule.resolveCourses(new Date(), AppData).courses;
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
    async generateJWT(jwtConfig, privateKey = SecretVault.recall('jwt:privateKey')) {
        const header = { alg: "EdDSA", kid: jwtConfig.kid };
        const iat = Math.floor(Date.now() / 1000) - 30;
        const exp = iat + 900;
        const payload = { sub: jwtConfig.sub, iss: jwtConfig.iss, iat: iat, exp: exp };
        const encodedHeader = this.base64url(new TextEncoder().encode(JSON.stringify(header)));
        const encodedPayload = this.base64url(new TextEncoder().encode(JSON.stringify(payload)));
        const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
        if (!privateKey) throw new Error('私钥不可用');
        const cryptoKey = await this.importPrivateKey(privateKey);
        const signature = await window.crypto.subtle.sign({ name: "Ed25519" }, cryptoKey, dataToSign);
        return `${encodedHeader}.${encodedPayload}.${this.base64url(signature)}`;
    },
    getCoordinates(config) {
        const [longitude, latitude] = String(config.location || '').split(',').map((value) => Number(value.trim()));
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            throw new Error('经纬度无效');
        }
        return { latitude, longitude };
    },
    compassFromDegrees(degrees) {
        if (degrees === null || degrees === undefined || degrees === '' || !Number.isFinite(Number(degrees))) return '';
        return ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round((Number(degrees) % 360) / 45) % 8];
    },
    async fetchJson(url, options = {}) {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`天气服务请求失败（${response.status}）`);
        return response.json();
    },
    async searchLocations(query) {
        const params = new URLSearchParams({ name: query, count: '20', language: 'zh', format: 'json' });
        const data = await this.fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
        return Array.isArray(data.results) ? data.results : [];
    },
    async locateByIp() {
        const params = new URLSearchParams({ fields: 'success,message,city,region,country,latitude,longitude' });
        const data = await this.fetchJson(`https://ipwho.is/?${params}`);
        if (data.success === false) throw new Error(data.message || 'IP 定位不可用');
        return data;
    },
    async fetchQWeather(config) {
        if (!config.apiHost || !SecretVault.recall('jwt:privateKey')) return this.notConfigured();
        const { latitude, longitude } = this.getCoordinates(config);
        const baseUrl = `https://${config.apiHost}`;
        const token = await this.generateJWT(config.jwtConfig || {}, SecretVault.recall('jwt:qweather:privateKey') || SecretVault.recall('jwt:privateKey'));
        const headers = { Authorization: `Bearer ${token}` };
        const [weather, alerts] = await Promise.all([
            this.fetchJson(`${baseUrl}/weather/v1/current/${latitude}/${longitude}`, { headers }),
            fetch(`${baseUrl}/weatheralert/v1/current/${latitude}/${longitude}`, { headers })
        ]);
        const condition = weather.condition?.text || '未知';
        const windDirection = weather.wind?.direction?.compass?.toLowerCase();
        const compass = { n: '北', ne: '东北', e: '东', se: '东南', s: '南', sw: '西南', w: '西', nw: '西北' }[windDirection];
        const wind = weather.wind?.scale !== undefined ? `${weather.wind.scale}级` : '';
        let warning = null;
        if (alerts.ok) {
            const data = await alerts.json();
            const latest = data.alerts?.[0];
            if (!data.metadata?.zeroResult && latest) {
                warning = { hasWarning: true, event: latest.eventType?.name || '预警', headline: latest.headline || '', severity: latest.severity || 'unknown', color: latest.color?.code || 'unknown' };
            }
        }
        const temperature = weather.temperature?.value;
        const temp = temperature !== undefined && temperature !== null && Number.isFinite(Number(temperature)) ? `${Math.round(Number(temperature))}°` : '--°';
        return { weather: { temp, desc: `${condition}${compass ? ` · ${compass}风${wind}` : ''}` }, warning };
    },
    async fetchOpenMeteo(config) {
        const { latitude, longitude } = this.getCoordinates(config);
        const params = new URLSearchParams({
            latitude: String(latitude), longitude: String(longitude),
            current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',
            wind_speed_unit: 'kmh', timezone: 'auto'
        });
        const data = await this.fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
        const current = data.current || {};
        const conditions = { 0: '晴', 1: '大致晴朗', 2: '局部多云', 3: '阴', 45: '雾', 48: '冻雾', 51: '小毛毛雨', 53: '毛毛雨', 55: '强毛毛雨', 61: '小雨', 63: '中雨', 65: '大雨', 71: '小雪', 73: '中雪', 75: '大雪', 80: '阵雨', 81: '强阵雨', 82: '暴雨', 95: '雷雨', 96: '雷雨伴冰雹', 99: '强雷雨伴冰雹' };
        const compass = this.compassFromDegrees(current.wind_direction_10m);
        const speed = current.wind_speed_10m !== null && current.wind_speed_10m !== undefined && Number.isFinite(Number(current.wind_speed_10m)) ? `${Math.round(current.wind_speed_10m)}公里/时` : '';
        const desc = `${conditions[current.weather_code] || '未知天气'}${compass ? ` · ${compass}风${speed}` : ''}`;
        const temperature = current.temperature_2m;
        const temp = temperature !== undefined && temperature !== null && Number.isFinite(Number(temperature)) ? `${Math.round(Number(temperature))}°` : '--°';
        return { weather: { temp, desc }, warning: null };
    },
    async fetchWeatherApi(config) {
        const apiKey = SecretVault.recall('weather:weatherApi:apiKey') || SecretVault.recall('weather:apiKey');
        if (!apiKey) return this.notConfigured();
        const { latitude, longitude } = this.getCoordinates(config);
        const params = new URLSearchParams({ key: apiKey, q: `${latitude},${longitude}`, days: '1', alerts: 'yes' });
        const data = await this.fetchJson(`https://api.weatherapi.com/v1/forecast.json?${params}`);
        const current = data.current || {};
        const wind = current.wind_kph !== null && current.wind_kph !== undefined && Number.isFinite(Number(current.wind_kph)) ? `${Math.round(current.wind_kph)}公里/时` : '';
        const desc = `${current.condition?.text || '未知'}${current.wind_dir ? ` · ${current.wind_dir}风${wind}` : ''}`;
        const alert = data.alerts?.alert?.[0];
        const warning = alert ? { hasWarning: true, event: alert.event || alert.headline || '预警', headline: alert.headline || alert.desc || '', severity: alert.severity || 'unknown', color: 'unknown' } : null;
        return { weather: { temp: Number.isFinite(Number(current.temp_c)) ? `${Math.round(current.temp_c)}°` : '--°', desc }, warning };
    },
    async fetchOpenWeatherMap(config) {
        const apiKey = SecretVault.recall('weather:openWeatherMap:apiKey') || SecretVault.recall('weather:apiKey');
        if (!apiKey) return this.notConfigured();
        const { latitude, longitude } = this.getCoordinates(config);
        const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude), appid: apiKey, units: 'metric', lang: 'zh_cn' });
        const data = await this.fetchJson(`https://api.openweathermap.org/data/2.5/weather?${params}`);
        const current = data.main || {};
        const compass = this.compassFromDegrees(data.wind?.deg);
        const speed = data.wind?.speed !== null && data.wind?.speed !== undefined && Number.isFinite(Number(data.wind.speed)) ? `${Math.round(data.wind.speed)}米/秒` : '';
        const desc = `${data.weather?.[0]?.description || '未知'}${compass ? ` · ${compass}风${speed}` : ''}`;
        return { weather: { temp: Number.isFinite(Number(current.temp)) ? `${Math.round(current.temp)}°` : '--°', desc }, warning: null };
    },
    notConfigured() {
        return { weather: { temp: '--°', desc: '未配置' }, warning: null };
    },
    async fetchWeather() {
        const config = Store.getWeatherConfig();
        if (!config.location) return this.notConfigured();
        try {
            const provider = config.provider || 'qweather';
            if (provider === 'openMeteo') return await this.fetchOpenMeteo(config);
            if (provider === 'weatherApi') return await this.fetchWeatherApi(config);
            if (provider === 'openWeatherMap') return await this.fetchOpenWeatherMap(config);
            return await this.fetchQWeather(config);
        } catch (error) {
            void Logger.warn('天气服务请求失败', { module: 'weather', action: 'fetch', context: { provider: Store.getWeatherConfig().provider || 'qweather' } }, error);
            return { weather: { temp: 'ERR', desc: '天气获取失败' }, warning: null };
        }
    }
};

const Dialog = {
    mask: null,
    resolveCurrent: null,
    dismissible: true,
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

    show({ title = '提示', message = '', html = '', type = 'info', wide = false, buttons = [{ text: '知道了', value: true, primary: true }], dismissible = true } = {}) {
        const mask = this.ensure();
        if (!mask) return Promise.resolve(null);
        this.dismissible = dismissible !== false;
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
        mask.classList.toggle('is-compact', window.innerHeight < 260);
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
        this.dismissible = true;
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
                if (this.dismissible === false) return;
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

const Onboarding = {
    
    dialogWindowSize: { width: APP_CONFIG.windowSize.width, height: 620 },
    active: false,

    async start({ returnTab = null } = {}) {
        const fromSettings = typeof returnTab === 'string' && returnTab.length > 0;
        const previousSize = await UI.getCurrentSize().catch(() => null);
        this.active = true;
        document.body.classList.add('onboarding-active');
        document.body.classList.add('dialog-enlarged');
        try {
            await UI.animateWindowSize(this.dialogWindowSize, APP_CONFIG.topOffset);
            UI.appliedMainWidth = APP_CONFIG.windowSize.width;

            const action = await this.showGuide();
            AppData.onboardingCompleted = true;
            AppData.onboardingCompletedAt = new Date().toISOString();
            if (action === 'weather') {
                await UI.openSettings(null, { tab: 'weather', guide: true });
            } else if (fromSettings) {
                await UI.openSettings(null, { tab: returnTab });
            } else {
                await UI.showMainWindow();
            }
            try {
                await Store.saveToRegistry(AppData);
            } catch (error) {
                void Logger.warn('保存引导完成状态失败', { module: 'onboarding', action: 'save' }, error);
            }
            void Logger.info('完成首次使用引导', { module: 'onboarding', action: 'complete', context: { action, fromSettings } });
        } finally {
            this.active = false;
            document.body.classList.remove('onboarding-active');
            document.body.classList.remove('dialog-enlarged');
            if (!AppData.onboardingCompleted) {
                await this.restoreWindow(previousSize, fromSettings, returnTab);
            }
        }
    },

    async restoreWindow(previousSize, fromSettings, returnTab) {
        const size = previousSize && previousSize.width && previousSize.height
            ? { width: previousSize.width, height: previousSize.height }
            : APP_CONFIG.windowSize;
        try {
            if (fromSettings) {
                UI.el.viewMain.classList.add('hidden');
                UI.el.viewSettings.classList.remove('hidden');
                await UI.animateWindowSize(size);
                await UI.setWindowDragRegion('settings');
            } else {
                UI.el.viewSettings.classList.add('hidden');
                UI.el.viewMain.classList.remove('hidden');
                UI.appliedMainWidth = size.width;
                await UI.positionWindow(size, APP_CONFIG.topOffset);
                await UI.setWindowDragRegion('main');
            }
        } catch (error) {
            void Logger.warn('引导中断后恢复窗口失败', { module: 'onboarding', action: 'restore' }, error);
        }
    },

    showGuide() {
        const html = `
            <div class="onboarding">
                <div class="onboarding-steps">
                    <div class="onboarding-step">
                        <div class="onboarding-step-index">1</div>
                        <div class="onboarding-step-body">
                            <b>它是什么</b>
                            <span>常驻桌面的课程与天气挂件。拖动任意空白处可移动窗口，右上角依次是刷新、设置与关闭。</span>
                        </div>
                    </div>
                    <div class="onboarding-step">
                        <div class="onboarding-step-index">2</div>
                        <div class="onboarding-step-body">
                            <b>配置天气</b>
                            <span>可选和风天气、Open-Meteo、WeatherAPI.com 或 OpenWeatherMap；Open-Meteo 无需密钥。</span>
                        </div>
                    </div>
                    <div class="onboarding-step">
                        <div class="onboarding-step-index">3</div>
                        <div class="onboarding-step-body">
                            <b>导入课表</b>
                            <span>在设置的「课表」页按星期添加课程，或在「主界面」调整主题、字体与字号。</span>
                        </div>
                    </div>
                </div>
                <div class="onboarding-weather">
                    <div class="onboarding-weather-title">${ICONS.weather}天气服务商</div>
                    <ul class="onboarding-weather-list">
                        <li>在设置的天气页选择服务商，填写经纬度（经度,纬度）。</li>
                        <li>需要密钥的服务商会显示凭据栏；和风天气使用 JWT 凭据。</li>
                        <li>控制台支持在窗口内查看；若站点禁止嵌入，可改用系统浏览器。</li>
                    </ul>
                    <div class="onboarding-hint">${ICONS.warn}天气可稍后配置；未配置时不影响课表与时钟。</div>
                </div>
                <label class="onboarding-confirm"><input type="checkbox" id="onboarding-confirm">我已了解天气服务商和密钥要求各不相同</label>
            </div>
        `;

        return new Promise((resolve) => {
            const buttons = [
                { text: '稍后再配置', value: 'later' },
                { text: '选择天气服务商', value: 'weather', primary: true }
            ];
            const panel = Dialog.show({
                title: '欢迎使用 ClassBroom',
                html,
                type: 'info',
                wide: true,
                buttons,
                dismissible: false
            });
            const confirm = document.getElementById('onboarding-confirm');
            const primary = document.querySelector('#app-dialog-footer .btn-primary');
            if (confirm && primary) {
                primary.disabled = true;
                confirm.addEventListener('change', () => {
                    primary.disabled = !confirm.checked;
                    if (confirm.checked) primary.focus({ preventScroll: true });
                });
            }
            panel.then((value) => resolve(typeof value === 'string' ? value : 'later'));
        });
    }
};

const Updater = {
    parseVersion(value) {
        const text = String(value || '').trim().replace(/^v/i, '');
        const match = text.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
        if (!match) return null;
        return [match[1], match[2], match[3]].map((part) => Number(part || 0));
    },

    compareVersions(latest, current) {
        const a = this.parseVersion(latest);
        const b = this.parseVersion(current);
        if (!a || !b) return 0;
        for (let i = 0; i < 3; i += 1) {
            if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
        }
        return 0;
    },

    /**
     * 拉取最新发布信息。
     * 先用 GitHub API 获取版本号与发布说明；接口失败（如限流）时回退到网页地址解析重定向版本号。
     */
    async fetchLatest() {
        try {
            const response = await fetch(APP_CONFIG.releasesApi, {
                headers: { Accept: 'application/vnd.github+json' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return {
                version: String(data.tag_name || data.name || '').trim(),
                name: String(data.name || '').trim(),
                notes: String(data.body || '').trim(),
                url: String(data.html_url || APP_CONFIG.releasesPage),
                publishedAt: data.published_at || null
            };
        } catch (error) {
            void Logger.warn('GitHub API 获取版本失败，回退网页解析', { module: 'update', action: 'fetch-api' }, error);
            // 回退：releases/latest 会 302 到具体 tag 页面
            const response = await fetch(APP_CONFIG.releasesPage, { redirect: 'follow' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const finalUrl = response.url || '';
            const tagMatch = finalUrl.match(/\/tag\/([^/?#]+)/);
            if (!tagMatch) throw new Error('无法解析最新版本号');
            return {
                version: decodeURIComponent(tagMatch[1]),
                name: '',
                notes: '',
                url: finalUrl,
                publishedAt: null
            };
        }
    },

    /** 输出检查结果并向调用方返回是否为新版本 */
    async check({ silent = false } = {}) {
        const current = String(window.NL_APPVERSION || '').trim();
        AppData.lastUpdateCheckAt = new Date().toISOString();
        try {
            const latest = await this.fetchLatest();
            const delta = this.compareVersions(latest.version, current);
            AppData.latestKnownVersion = latest.version;
            const hasUpdate = delta > 0;
            void Logger.info('版本检查完成', {
                module: 'update',
                action: 'check',
                context: { current, latest: latest.version, hasUpdate }
            });
            if (hasUpdate && !silent) await this.promptUpdate(latest, current);
            return hasUpdate;
        } catch (error) {
            void Logger.warn('版本检查失败', { module: 'update', action: 'check' }, error);
            if (!silent) await Dialog.alert(`无法获取最新版本信息。\n${error.message || error}`, '检查更新失败', 'warning');
            return false;
        } finally {
            try {
                await Store.saveToRegistry(AppData);
            } catch (error) {
                void Logger.warn('保存检查时间失败', { module: 'update', action: 'persist' }, error);
            }
            if (typeof UI !== 'undefined') UI.renderAboutUpdateState();
        }
    },

    /** 展示新版本信息并引导前往发布页 */
    async promptUpdate(latest, current) {
        const notes = latest.notes
            ? `<pre class="update-notes">${this.escapeHtml(latest.notes.slice(0, 1200))}</pre>`
            : '<div class="update-meta-line">该版本未提供更新说明。</div>';
        const html = `
            <div class="update-dialog">
                <div class="update-meta-line">当前版本 <b>v${this.escapeHtml(current || '未知')}</b> → 最新版本 <b>v${this.escapeHtml(latest.version)}</b></div>
                ${notes}
            </div>`;
        const go = await Dialog.show({
            title: '发现新版本',
            html,
            wide: true,
            type: 'info',
            buttons: [
                { text: '稍后提醒', value: false },
                { text: '前往下载', value: true, primary: true }
            ]
        });
        if (go === true) await this.openReleasePage(latest.url);
    },

    async openReleasePage(url) {
        try {
            await Neutralino.os.open(url || APP_CONFIG.releasesPage);
        } catch (error) {
            void Logger.error('打开发布页失败', { module: 'update', action: 'open' }, error);
            await Dialog.alert('无法打开浏览器，请手动访问：\n' + (url || APP_CONFIG.releasesPage), '打开失败', 'warning');
        }
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /** 启动后静默检查：未到间隔时间则跳过 */
    scheduleStartupCheck(delay = 6000) {
        const last = Date.parse(AppData.lastUpdateCheckAt || '') || 0;
        if (Date.now() - last < APP_CONFIG.updateCheckIntervalMs) return;
        setTimeout(() => { void this.check({ silent: true }); }, delay);
    }
};

const CustomSelect = {
    registry: new Map(),
    initAll() {
        document.querySelectorAll('.custom-select[data-input]').forEach((el) => this.init(el));
        document.querySelectorAll('select[id]').forEach((select) => {
            if (select.dataset.customSelectSource === '1') return;
            const root = document.createElement('div');
            root.id = `custom-select-${select.id}`;
            root.className = 'custom-select native-custom-select';
            root.dataset.input = select.id;
            const label = select.labels?.[0];
            const labelText = label
                ? Array.from(label.childNodes).filter((node) => node !== select).map((node) => node.textContent.trim()).join(' ').trim()
                : '';
            if (labelText) root.dataset.placeholder = labelText;
            select.classList.add('native-select-source');
            select.dataset.customSelectSource = '1';
            select.tabIndex = -1;
            select.setAttribute('aria-hidden', 'true');
            select.insertAdjacentElement('afterend', root);
            const instance = this.init(root);
            if (instance) {
                instance.nativeSelect = true;
                instance.refreshNativeOptions();
                instance.trigger.id = `custom-trigger-${select.id}`;
                instance.trigger.setAttribute('aria-label', select.getAttribute('aria-label') || labelText || '选择选项');
                select.labels?.forEach((item) => { item.htmlFor = instance.trigger.id; });
            }
        });
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
        trigger.setAttribute('role', 'combobox');
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        const label = document.createElement('span');
        label.className = 'custom-select-label';
        const arrow = document.createElement('i');
        arrow.className = 'custom-select-arrow';
        trigger.append(label, arrow);

        const panel = document.createElement('div');
        panel.className = 'custom-select-panel';
        panel.id = `${root.id || inputId}-options`;
        trigger.setAttribute('aria-controls', panel.id);
        panel.setAttribute('role', 'listbox');
        root.append(trigger, panel);

        const instance = {
            root, trigger, label, panel, hidden, placeholder,
            nativeSelect: false,
            focusedIndex: -1,
            options: [],
            setOptions(options) {
                this.options = Array.isArray(options) ? options.slice() : [];
                this.render();
            },
            render() {
                if (this.nativeSelect && hidden) {
                    this.options = Array.from(hidden.options).map((option) => ({
                        value: option.value,
                        label: option.textContent.trim(),
                        disabled: option.disabled
                    }));
                }
                panel.innerHTML = '';
                const current = this.getValue();
                this.options.forEach((option, index) => {
                    const item = document.createElement('div');
                    item.className = 'custom-select-option';
                    item.id = `${panel.id}-option-${index}`;
                    item.dataset.optionIndex = String(index);
                    item.setAttribute('role', 'option');
                    item.dataset.value = option.value;
                    item.textContent = option.label;
                    item.setAttribute('aria-disabled', option.disabled ? 'true' : 'false');
                    if (option.disabled) item.classList.add('disabled');
                    const selected = option.value === current;
                    if (selected) {
                        item.classList.add('selected');
                    }
                    item.setAttribute('aria-selected', selected ? 'true' : 'false');
                    item.addEventListener('click', (event) => {
                        event.stopPropagation();
                        if (option.disabled || hidden?.disabled) return;
                        this.setValue(option.value, true);
                        this.close();
                        trigger.focus({ preventScroll: true });
                    });
                    panel.appendChild(item);
                });
                this.syncLabel();
                this.syncDisabled();
            },
            refreshNativeOptions() {
                if (this.nativeSelect) this.render();
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
                    hidden?.dispatchEvent(new Event('change', { bubbles: true }));
                }
            },
            syncLabel() {
                const current = this.getValue();
                const matched = this.options.find((option) => option.value === current);
                label.textContent = matched ? matched.label : placeholder;
                label.classList.toggle('placeholder', !matched);
            },
            syncDisabled() {
                const disabled = Boolean(hidden?.disabled);
                trigger.disabled = disabled;
                root.classList.toggle('disabled', disabled);
                trigger.setAttribute('aria-disabled', disabled ? 'true' : 'false');
            },
            focusOption(direction) {
                const options = Array.from(panel.querySelectorAll('.custom-select-option:not(.disabled)'));
                if (!options.length) return;
                const current = options.findIndex((option) => Number(option.dataset.optionIndex) === this.focusedIndex);
                const next = current < 0
                    ? (direction > 0 ? 0 : options.length - 1)
                    : (current + direction + options.length) % options.length;
                options.forEach((option) => option.classList.remove('focused'));
                const active = options[next];
                this.focusedIndex = Number(active.dataset.optionIndex);
                active.classList.add('focused');
                trigger.setAttribute('aria-activedescendant', active.id);
                active.scrollIntoView({ block: 'nearest' });
            },
            selectFocusedOption() {
                const active = panel.querySelector(`[data-option-index="${this.focusedIndex}"]`);
                active?.click();
            },
            open() {
                this.render();
                if (trigger.disabled) return;
                CustomSelect.closeAll(instance);
                root.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                const selected = this.options.findIndex((option) => option.value === this.getValue() && !option.disabled);
                this.focusedIndex = selected >= 0 ? selected : -1;
                if (selected >= 0) {
                    const active = panel.querySelector(`[data-option-index="${selected}"]`);
                    active?.classList.add('focused');
                    if (active) trigger.setAttribute('aria-activedescendant', active.id);
                }
                this.position();
            },

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
                const maxWidth = Math.max(0, viewportWidth - edge * 2);
                panel.style.width = 'max-content';
                panel.style.maxWidth = `${maxWidth}px`;
                const panelWidth = Math.min(maxWidth, Math.max(rect.width, panel.getBoundingClientRect().width));
                root.classList.toggle('drop-up', dropUp);
                panel.style.width = `${Math.round(panelWidth)}px`;
                panel.style.maxHeight = `${Math.max(72, Math.round(height))}px`;
                panel.style.top = dropUp
                    ? `${Math.max(edge, Math.round(rect.top - gap - height))}px`
                    : `${Math.round(rect.bottom + gap)}px`;
                const left = Math.min(Math.max(edge, Math.round(rect.left)), viewportWidth - Math.round(panelWidth) - edge);
                panel.style.left = `${Math.max(edge, left)}px`;
            },
            close() {
                root.classList.remove('open', 'drop-up');
                trigger.setAttribute('aria-expanded', 'false');
                trigger.removeAttribute('aria-activedescendant');
                this.focusedIndex = -1;
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
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!root.classList.contains('open')) instance.open();
                instance.focusOption(event.key === 'ArrowDown' ? 1 : -1);
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (root.classList.contains('open')) instance.selectFocusedOption();
                else instance.open();
            } else if (event.key === 'Escape') {
                instance.close();
            }
        });
        panel.addEventListener('click', (event) => event.stopPropagation());
        hidden?.addEventListener('change', () => {
            instance.syncLabel();
            instance.syncDisabled();
        });

        this.registry.set(root.id || inputId, instance);
        if (inputId) this.registry.set(inputId, instance);
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
    refreshNativeSelect(key) {
        this.registry.get(key)?.refreshNativeOptions();
    },
    sync(key) {
        const instance = this.registry.get(key);
        if (!instance) return;
        if (instance.nativeSelect) instance.refreshNativeOptions();
        else {
            instance.syncLabel();
            instance.syncDisabled();
        }
    },
    syncAll() {
        new Set(this.registry.values()).forEach((instance) => {
            if (instance.nativeSelect) instance.refreshNativeOptions();
            else {
                instance.syncLabel();
                instance.syncDisabled();
            }
        });
    },
    closeAll(except = null) {
        this.registry.forEach((instance) => {
            if (instance !== except) instance.close();
        });
    },
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
        window.addEventListener('resize', () => this.repositionOpen());
        document.addEventListener('scroll', (event) => {
            if (event.target instanceof Node && event.target.nodeType === 1 && event.target.closest?.('.custom-select-panel')) return;
            this.closeAll();
        }, true);
    }
};

const CustomDatePicker = {
    instances: new Map(),
    bound: false,
    initAll() {
        document.querySelectorAll('input[type="date"][id]').forEach((input) => this.init(input));
        if (this.bound) return;
        this.bound = true;
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.custom-date-picker')) this.closeAll();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this.closeAll();
        });
    },
    parse(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
        return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
    },
    formatDate(value) {
        return Schedule.formatDisplayDate(value);
    },
    dateKey(date) {
        const pad = (part) => String(part).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    },
    init(input) {
        if (input.dataset.customDatePicker === '1') return this.instances.get(input.id);
        input.dataset.customDatePicker = '1';
        input.classList.add('custom-date-source');
        input.tabIndex = -1;
        input.setAttribute('aria-hidden', 'true');

        const root = document.createElement('span');
        root.className = 'custom-date-picker';
        const trigger = document.createElement('button');
        trigger.id = `custom-date-${input.id}`;
        trigger.type = 'button';
        trigger.className = 'custom-date-trigger';
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-expanded', 'false');
        const label = input.labels?.[0]?.textContent.trim().replace(/\s+/g, ' ');
        trigger.setAttribute('aria-label', label || '选择日期');

        const calendar = document.createElement('div');
        calendar.className = 'custom-date-calendar';
        calendar.setAttribute('role', 'dialog');
        calendar.setAttribute('aria-label', '选择日期');
        root.append(trigger, calendar);
        input.insertAdjacentElement('afterend', root);
        input.labels?.forEach((item) => {
            item.htmlFor = trigger.id;
        });

        const instance = {
            input, root, trigger, calendar,
            viewDate: this.parse(input.value) || new Date(),
            sync() {
                const date = CustomDatePicker.parse(input.value);
                trigger.textContent = date
                    ? CustomDatePicker.formatDate(date)
                    : '选择日期';
                this.render();
            },
            render() {
                calendar.replaceChildren();
                const year = this.viewDate.getFullYear();
                const month = this.viewDate.getMonth();
                const header = document.createElement('div');
                header.className = 'custom-date-calendar-header';
                const previous = document.createElement('button');
                previous.type = 'button';
                previous.className = 'custom-date-nav';
                previous.textContent = '‹';
                previous.setAttribute('aria-label', '上个月');
                previous.addEventListener('click', () => this.changeMonth(-1));
                const monthLabel = document.createElement('span');
                monthLabel.className = 'custom-date-month';
                monthLabel.textContent = `${year}年${month + 1}月`;
                const next = document.createElement('button');
                next.type = 'button';
                next.className = 'custom-date-nav';
                next.textContent = '›';
                next.setAttribute('aria-label', '下个月');
                next.addEventListener('click', () => this.changeMonth(1));
                header.append(previous, monthLabel, next);

                const weekdays = document.createElement('div');
                weekdays.className = 'custom-date-weekdays';
                ['一', '二', '三', '四', '五', '六', '日'].forEach((day) => {
                    const item = document.createElement('span');
                    item.className = 'custom-date-weekday';
                    item.textContent = day;
                    weekdays.appendChild(item);
                });
                const days = document.createElement('div');
                days.className = 'custom-date-days';
                const firstDay = new Date(year, month, 1);
                const startOffset = (firstDay.getDay() + 6) % 7;
                const todayKey = CustomDatePicker.dateKey(new Date());
                for (let index = 0; index < 42; index += 1) {
                    const date = new Date(year, month, index - startOffset + 1);
                    const key = CustomDatePicker.dateKey(date);
                    const dayButton = document.createElement('button');
                    dayButton.type = 'button';
                    dayButton.className = 'custom-date-day';
                    dayButton.textContent = String(date.getDate());
                    dayButton.setAttribute('aria-label', key);
                    if (date.getMonth() !== month) dayButton.classList.add('outside-month');
                    if (key === todayKey) dayButton.classList.add('today');
                    if (key === input.value) {
                        dayButton.classList.add('selected');
                        dayButton.setAttribute('aria-pressed', 'true');
                    }
                    dayButton.addEventListener('click', () => this.select(key));
                    days.appendChild(dayButton);
                }

                const actions = document.createElement('div');
                actions.className = 'custom-date-actions';
                [['今天', () => this.select(todayKey)], ['清除', () => this.select('')]].forEach(([text, action]) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'custom-date-action';
                    button.textContent = text;
                    button.addEventListener('click', action);
                    actions.appendChild(button);
                });
                calendar.append(header, weekdays, days, actions);
            },
            changeMonth(offset) {
                this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + offset, 1);
                this.render();
            },
            select(value) {
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                this.sync();
                this.close();
            },
            position() {
                const rect = trigger.getBoundingClientRect();
                const width = 280;
                const height = calendar.offsetHeight || 330;
                const left = Math.max(6, Math.min(rect.left, window.innerWidth - width - 6));
                const top = rect.bottom + height <= window.innerHeight - 6
                    ? rect.bottom + 4
                    : Math.max(6, rect.top - height - 4);
                calendar.style.left = `${left}px`;
                calendar.style.top = `${top}px`;
            },
            open() {
                CustomDatePicker.closeAll(this);
                this.viewDate = CustomDatePicker.parse(input.value) || new Date();
                this.render();
                root.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                this.position();
            },
            close() {
                root.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
            }
        };
        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (root.classList.contains('open')) instance.close();
            else instance.open();
        });
        input.addEventListener('change', () => setTimeout(() => instance.sync(), 0));
        window.addEventListener('resize', () => {
            if (root.classList.contains('open')) instance.position();
        });
        instance.sync();
        this.instances.set(input.id, instance);
        return instance;
    },
    closeAll(except = null) {
        this.instances.forEach((instance) => {
            if (instance !== except) instance.close();
        });
    },
    syncAll() {
        this.instances.forEach((instance) => instance.sync());
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
        btnRestartGuide: document.getElementById('btn-restart-guide'),
        dropOverlay: document.getElementById('config-drop-overlay'),
        inputApiHost: document.getElementById('input-api-host'),
        inputWeatherProvider: document.getElementById('input-weather-provider'),
        inputLocationQuery: document.getElementById('input-location-query'),
        btnSearchLocation: document.getElementById('btn-search-location'),
        btnLocateByIp: document.getElementById('btn-locate-by-ip'),
        inputGeocodingResult: document.getElementById('input-geocoding-result'),
        locationSearchStatus: document.getElementById('location-search-status'),
        inputWeatherApiKey: document.getElementById('input-weather-api-key'),
        btnOpenWeatherProvider: document.getElementById('btn-open-weather-provider'),
        weatherProviderHint: document.getElementById('weather-provider-hint'),
        weatherApiHostGroup: document.getElementById('weather-api-host-group'),
        weatherQWeatherGuide: document.getElementById('weather-qweather-guide'),
        weatherJwtSection: document.getElementById('weather-jwt-section'),
        weatherApiKeySection: document.getElementById('weather-api-key-section'),
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
        inputShowWeather: document.getElementById('input-show-weather'),
        inputShowTimeline: document.getElementById('input-show-timeline'),
        inputShowBottom: document.getElementById('input-show-bottom'),
        inputShowClockSeconds: document.getElementById('input-show-clock-seconds'),
        inputShowBottomText: document.getElementById('input-show-bottom-text'),
        displayProfileEdit: document.getElementById('select-display-profile-edit'),
        inputDisplayProfileName: document.getElementById('input-display-profile-name'),
        inputDisplayProfileTheme: document.getElementById('input-display-profile-theme'),
        inputProfileShowWeather: document.getElementById('input-profile-show-weather'),
        inputProfileShowTimeline: document.getElementById('input-profile-show-timeline'),
        inputProfileShowBottom: document.getElementById('input-profile-show-bottom'),
        inputProfileShowSeconds: document.getElementById('input-profile-show-seconds'),
        inputProfileBottomText: document.getElementById('input-profile-bottom-text'),
        btnSaveDisplayProfile: document.getElementById('btn-save-display-profile'),
        btnDeleteDisplayProfile: document.getElementById('btn-delete-display-profile'),
        inputDisplayRuleDate: document.getElementById('input-display-rule-date'),
        displayRuleProfile: document.getElementById('select-display-rule-profile'),
        btnAddDisplayRule: document.getElementById('btn-add-display-rule'),
        displayRuleList: document.getElementById('display-rule-list'),
        inputBottomOffset: document.getElementById('input-bottom-offset'),
        bottomOffsetLabel: document.getElementById('bottom-offset-label'),
        bottomAlignGroup: document.getElementById('bottom-align-group'),
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
        updateStatus: document.getElementById('about-update-status'),
        btnCheckUpdate: document.getElementById('btn-check-update'),
        btnOpenReleases: document.getElementById('btn-open-releases'),
        daySelector: document.getElementById('day-selector'),
        cycleWeekCount: document.getElementById('input-cycle-week-count'),
        cycleStartDate: document.getElementById('input-cycle-start-date'),
        cycleWeekSelector: document.getElementById('cycle-week-selector'),
        courseEditMode: document.getElementById('input-course-edit-mode'),
        overrideDate: document.getElementById('input-course-override-date'),
        overrideType: document.getElementById('input-course-override-type'),
        btnCreateOverride: document.getElementById('btn-create-course-override'),
        btnRemoveOverride: document.getElementById('btn-remove-course-override'),
        overrideStatus: document.getElementById('course-override-status'),
        courseDaySummary: document.getElementById('course-day-summary'),
        inputCopyCourseDay: document.getElementById('input-copy-course-day'),
        btnCopyCourses: document.getElementById('btn-copy-courses'),
        courseList: document.getElementById('course-list'),
        btnDownloadCourseTemplate: document.getElementById('btn-download-course-template'),
        btnImportCourses: document.getElementById('btn-import-courses'),
        btnExportCourses: document.getElementById('btn-export-courses'),
        btnAddCourse: document.getElementById('btn-add-course')
    },

    timeTimer: null,
    locationResults: [],
    async init() {
        await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
        await this.setWindowDragRegion('main');

        Dialog.bindKeys();
        this.initCustomSelects();
        CustomDatePicker.initAll();
        CustomSelect.bindGlobal();
        this.bindDragHandle();
        this.bindMainDrag();

        this.el.btnRefresh.addEventListener('click', () => this.handleRefresh());
        this.el.btnClose.addEventListener('click', () => this.hideMainWindow('close-button'));
        this.el.btnSettings.addEventListener('click', () => this.openSettings());
        this.el.btnCancelSettings.addEventListener('click', () => this.cancelSettings());
        this.el.btnSaveSettings.addEventListener('click', () => this.saveSettings());
        this.el.btnImportConfig.addEventListener('click', () => this.importConfig());
        this.el.btnExportConfig.addEventListener('click', () => this.exportConfig());
        this.el.inputWeatherProvider.addEventListener('change', () => this.switchWeatherProvider());
        this.el.btnOpenWeatherProvider.addEventListener('click', () => this.openWeatherProvider());
        this.el.btnSearchLocation.addEventListener('click', () => this.searchWeatherLocations());
        this.el.btnLocateByIp.addEventListener('click', () => this.locateWeatherByIp());
        this.el.inputLocationQuery.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void this.searchWeatherLocations();
            }
        });
        this.el.inputGeocodingResult.addEventListener('change', () => this.applySelectedLocation());
        this.el.btnCheckUpdate?.addEventListener('click', async () => {
            const button = this.el.btnCheckUpdate;
            button.disabled = true;
            this.setUpdateStatus('正在检查更新…');
            try {
                const hasUpdate = await Updater.check({ silent: false });
                if (!hasUpdate) this.setUpdateStatus(`已是最新版本 v${window.NL_APPVERSION || '--'}`, 'is-latest');
            } finally {
                button.disabled = false;
                this.renderAboutUpdateState();
            }
        });
        this.el.btnOpenReleases?.addEventListener('click', () => Updater.openReleasePage());
        window.addEventListener('dragenter', (event) => this.handleDragEnter(event));
        window.addEventListener('dragover', (event) => this.handleDragOver(event));
        window.addEventListener('dragleave', (event) => this.handleDragLeave(event));
        window.addEventListener('drop', (event) => this.handleDrop(event));
        await Neutralino.events.on('windowClose', () => {
            if (App.shuttingDown) {
                void Logger.info('退出期间允许窗口关闭', { module: 'window', action: 'close-during-shutdown' });
                return;
            }
            this.hideMainWindow('window-close');
        });
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.currentTarget.dataset.target);
            });
        });
        this.el.btnRestartGuide?.addEventListener('click', async () => {
            this.el.viewSettings.classList.add('hidden');
            this.el.viewMain.classList.add('hidden');
            await Onboarding.start({ returnTab: 'about' });
        });

        this.renderDaySelector();
        this.el.inputCopyCourseDay.addEventListener('change', () => {
            this.el.btnCopyCourses.disabled = !this.el.inputCopyCourseDay.value;
        });
        this.el.btnCopyCourses.addEventListener('click', () => this.copyCoursesToDay());
        this.el.btnAddCourse.addEventListener('click', () => this.addCourseRow());
        this.el.cycleWeekCount.addEventListener('change', () => this.updateCourseRotationWeekCount());
        this.el.cycleStartDate.addEventListener('change', () => this.updateCourseRotationStartDate());
        this.el.courseEditMode.addEventListener('change', () => this.changeCourseEditMode());
        this.el.overrideDate.addEventListener('change', () => this.changeCourseOverrideDate());
        this.el.overrideType.addEventListener('change', () => this.changeCourseOverrideType());
        this.el.btnCreateOverride.addEventListener('click', () => this.createCourseOverride());
        this.el.btnRemoveOverride.addEventListener('click', () => this.removeCourseOverride());
        this.el.btnImportCourses.addEventListener('click', () => this.importCoursesSpreadsheet());
        this.el.btnDownloadCourseTemplate.addEventListener('click', () => this.downloadCourseTemplate());
        this.el.btnExportCourses.addEventListener('click', () => this.exportCoursesSpreadsheet());
        this.el.displayProfileEdit.addEventListener('change', () => this.loadDisplayProfileForm());
        this.el.btnSaveDisplayProfile.addEventListener('click', () => this.saveDisplayProfile());
        this.el.btnDeleteDisplayProfile.addEventListener('click', () => this.deleteDisplayProfile());
        this.el.btnAddDisplayRule.addEventListener('click', () => this.addDisplayRule());
        this.el.btnAddSubject.addEventListener('click', () => this.addSubject());
        this.el.inputNewSubject.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); this.addSubject(); }
        });
        const rememberCaret = () => {
            this.customBottomTextSelection = this.el.inputCustomBottomText.selectionStart;
        };
        this.el.inputCustomBottomText.addEventListener('focus', rememberCaret);
        this.el.inputCustomBottomText.addEventListener('click', rememberCaret);
        this.el.inputCustomBottomText.addEventListener('keyup', rememberCaret);
        this.el.inputCustomBottomText.addEventListener('blur', rememberCaret);
        document.querySelectorAll('.placeholder-token').forEach(button => {
            button.addEventListener('mousedown', (event) => event.preventDefault());
            button.addEventListener('click', () => {
                this.appendPlaceholder(button.dataset.placeholder);
            });
        });
        if (this.el.inputFontSizeScale) {
            this.el.inputFontSizeScale.addEventListener('input', () => {
                this.syncFontSizeScaleLabel();
                const preview = Math.max(80, Math.min(150, Number(this.el.inputFontSizeScale.value) || 100)) / 100;
                document.documentElement.style.setProperty('--fs-scale', String(preview));
                this.updateFontPreview();
            });
        }
        [this.el.inputCourseFontSize, this.el.inputBottomFontSize].forEach((input) => {
            if (!input) return;
            input.addEventListener('input', () => {
                this.syncRangeLabels();
                this.updateFontPreview();
            });
        });
        if (this.el.inputBottomOffset) {
            this.el.inputBottomOffset.addEventListener('input', () => this.syncBottomOffsetLabel());
        }
        if (this.el.bottomAlignGroup) {
            this.el.bottomAlignGroup.addEventListener('click', (event) => {
                const button = event.target.closest('.segmented-btn');
                if (!button) return;
                this.setBottomAlign(button.dataset.align);
                this.markSettingsDirty();
            });
        }
        [this.el.inputFontFamily, this.el.inputCourseFont].forEach((input) => {
            if (!input) return;
            input.addEventListener('change', () => this.updateFontPreview());
        });
        this.startClock();
    },

    THEME_OPTIONS: [
        { value: 'default', label: '默认' },
        { value: 'ocean', label: '海洋蓝' },
        { value: 'forest', label: '森林绿' },
        { value: 'midnight', label: '午夜深色' },
        { value: 'high-contrast', label: '高对比度' },
        { value: 'monochrome', label: '纯黑白' }
    ],

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

    WEATHER_PROVIDER_OPTIONS: [
        { value: 'qweather', label: '和风天气' },
        { value: 'openMeteo', label: 'Open-Meteo（免密钥）' },
        { value: 'weatherApi', label: 'WeatherAPI.com' },
        { value: 'openWeatherMap', label: 'OpenWeatherMap' }
    ],

    initCustomSelects() {
        CustomSelect.initAll();
        CustomSelect.setOptions('select-weather-provider', this.WEATHER_PROVIDER_OPTIONS);
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
        const courses = Schedule.resolveCourses(new Date(), AppData).courses;
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
        const displayConfig = this.getEffectiveDisplayConfig();
        const template = displayConfig.customBottomText || '';
        if (!template || !this.isBottomTextVisible()) {
            this.el.customBottomText.textContent = '';
            return;
        }

        const now = new Date();
        const pad = value => String(value).padStart(2, '0');
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
            date: CustomDatePicker.formatDate(now),
            datetime: `${CustomDatePicker.formatDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
            weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()],
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
            targetDate: CustomDatePicker.formatDate(targetDate) || '未设置',
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
        this.scheduleFitWindow();
    },

    fitWidthTimer: null,
    appliedMainWidth: null,
    weatherExtraWidth: 0,
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
        this.el.timeClock.textContent = `${hours}:${minutes}`;
        this.el.timeClock.dataset.seconds = `:${seconds}`;
        this.el.timeDate.textContent = CustomDatePicker.formatDate(now);
        this.el.timeDisplay.title = `${CustomDatePicker.formatDate(now)} ${hours}:${minutes}:${seconds}`;
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

    getEffectiveDisplayConfig(date = new Date()) {
        const profileId = AppData.displayRules?.[Schedule.getDateKey(date)];
        const profiles = Array.isArray(AppData.displayProfiles) ? AppData.displayProfiles : [];
        const profile = profiles.find((item) => item.id === profileId);
        return profile ? { ...AppData, ...profile } : AppData;
    },

    applyActiveDisplayProfile(force = false) {
        const dateKey = Schedule.getDateKey(new Date());
        const profileId = AppData.displayRules?.[dateKey] || '';
        const key = `${dateKey}:${profileId}`;
        if (!force && this.activeDisplayProfileKey === key) return false;
        this.activeDisplayProfileKey = key;
        const config = this.getEffectiveDisplayConfig();
        this.applyTheme(config.theme);
        this.applyDisplayOptions(config);
        this.renderCustomBottomInfo();
        return true;
    },

    applyFontStyles() {
        const style = document.documentElement.style;
        const family = String(AppData.fontFamily || '').trim();
        if (family) style.setProperty('--font-sans', family);
        else style.removeProperty('--font-sans');

        const scale = Math.max(80, Math.min(150, Number(AppData.fontSizeScale) || 100)) / 100;
        style.setProperty('--fs-scale', String(scale));

        const courseSize = Math.max(12, Math.min(32, Number(AppData.courseFontSize) || 15));
        const courseFont = String(AppData.courseFont || '').trim();
        style.setProperty('--course-name-size', `${courseSize}px`);
        if (courseFont) style.setProperty('--course-name-font', courseFont);
        else style.removeProperty('--course-name-font');

        this.appliedMainWidth = null;
        this.scheduleFitWindow(260);
    },

    syncFontSizeScaleLabel() {
        const input = this.el.inputFontSizeScale;
        if (!input || !this.el.fontSizeScaleLabel) return;
        const value = Math.max(80, Math.min(150, Number(input.value) || 100));
        this.el.fontSizeScaleLabel.textContent = `${value}%`;
    },

    syncRangeLabels() {
        if (this.el.inputCourseFontSize && this.el.courseFontSizeLabel) {
            const value = Math.max(12, Math.min(32, Number(this.el.inputCourseFontSize.value) || 15));
            this.el.courseFontSizeLabel.textContent = `${value} px`;
        }
        if (this.el.inputBottomFontSize && this.el.bottomFontSizeLabel) {
            const value = Math.max(8, Math.min(30, Number(this.el.inputBottomFontSize.value) || 10));
            this.el.bottomFontSizeLabel.textContent = `${value} px`;
        }
        this.syncBottomOffsetLabel();
    },

    syncBottomOffsetLabel() {
        if (!this.el.inputBottomOffset || !this.el.bottomOffsetLabel) return;
        const value = Math.max(-20, Math.min(20, Number(this.el.inputBottomOffset.value) || 0));
        this.el.bottomOffsetLabel.textContent = `${value} px`;
    },

    setBottomAlign(align) {
        if (!this.el.bottomAlignGroup) return;
        this.el.bottomAlignGroup.querySelectorAll('.segmented-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.align === align);
        });
    },

    getBottomAlign() {
        const active = this.el.bottomAlignGroup?.querySelector('.segmented-btn.active');
        return active?.dataset.align || 'right';
    },

    getBottomOffset() {
        return Math.max(-20, Math.min(20, Number(this.el.inputBottomOffset?.value) || 0));
    },

    applyDisplayOptions(config = this.getEffectiveDisplayConfig()) {
        const viewMain = this.el.viewMain;
        if (viewMain) {
            viewMain.classList.toggle('hide-weather', config.showWeather === false);
            viewMain.classList.toggle('hide-timeline', config.showTimeline === false);
        }
        this.el.timeDisplay?.classList.toggle('seconds-visible', config.showClockSeconds !== false);
        const bottomText = this.el.customBottomText;
        if (bottomText) {
            const align = ['left', 'center', 'right'].includes(config.bottomAlign) ? config.bottomAlign : 'right';
            bottomText.classList.toggle('pos-left', align === 'left');
            bottomText.classList.toggle('pos-center', align === 'center');
            bottomText.classList.toggle('pos-right', align === 'right');
            bottomText.classList.toggle('force-hidden', config.showBottomText === false);
        }
        const root = document.documentElement;
        const offset = Math.max(-20, Math.min(20, Number(config.bottomOffset) || 0));
        root.style.setProperty('--bottom-offset', `${offset}px`);
        this.appliedMainWidth = null;
        this.scheduleFitWindow(200);
    },

    /** 自定义文本当前是否可见（总开关关闭时不参与宽度测量） */
    isBottomTextVisible() {
        return this.getEffectiveDisplayConfig().showBottomText !== false;
    },

    /** 设置关于页的更新状态文本与配色 */
    setUpdateStatus(text, state = '') {
        const el = this.el.updateStatus;
        if (!el) return;
        el.textContent = text;
        el.classList.remove('has-update', 'is-latest');
        if (state) el.classList.add(state);
    },

    /** 根据缓存的检查结果刷新关于页状态（不发请求） */
    renderAboutUpdateState() {
        const current = String(window.NL_APPVERSION || '').trim();
        const latest = String(AppData.latestKnownVersion || '').trim();
        if (!latest) {
            this.setUpdateStatus(current ? `当前版本 v${current}` : '尚未检查更新');
            return;
        }
        if (Updater.compareVersions(latest, current) > 0) {
            this.setUpdateStatus(`发现新版本 v${latest}（当前 v${current || '未知'}）`, 'has-update');
        } else {
            this.setUpdateStatus(`已是最新版本 v${current || latest}`, 'is-latest');
        }
    },

    updateFontPreview() {
        const ui = this.el.fontPreviewUi;
        const course = this.el.fontPreviewCourse;
        if (!ui || !course) return;
        const scale = Math.max(80, Math.min(150, Number(this.el.inputFontSizeScale?.value) || 100)) / 100;
        const courseSize = Math.max(12, Math.min(32, Number(this.el.inputCourseFontSize?.value) || 15));
        const globalFamily = String(this.el.inputFontFamily?.value || '').trim();
        const courseFamily = String(this.el.inputCourseFont?.value || '').trim();

        course.style.fontSize = `${courseSize * scale}px`;
        course.style.fontFamily = courseFamily || globalFamily || '';
        if (this.el.fontPreviewCourseMeta) {
            this.el.fontPreviewCourseMeta.textContent = `${courseSize} px · ${Math.round(scale * 100)}%`;
        }

        ui.style.fontSize = `${12 * scale}px`;
        ui.style.fontFamily = globalFamily;
        if (this.el.fontPreviewUiMeta) this.el.fontPreviewUiMeta.textContent = `${Math.round(scale * 100)}%`;
    },

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
                const exclude = Array.from(document.querySelectorAll('#view-main button, #view-main .icon-btn, #view-main .weather-warning'))
                    .filter((node) => node.id !== 'view-main');
                await Neutralino.window.setDraggableRegion('view-main', {
                    exclude: [...APP_CONFIG.excludeDrag, ...exclude]
                });
            }
        } catch (error) { }
    },

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

    /** 读取当前窗口尺寸，失败时返回 null 以便调用方回退到默认尺寸 */
    async getCurrentSize() {
        try {
            const size = await Neutralino.window.getSize();
            const width = Math.round(Number(size?.width) || 0);
            const height = Math.round(Number(size?.height) || 0);
            return width > 0 && height > 0 ? { width, height } : null;
        } catch (error) {
            return null;
        }
    },

    async fitWindowToContent() {
        if (this.el.viewSettings && !this.el.viewSettings.classList.contains('hidden')) return;
        const baseWidth = APP_CONFIG.windowSize.width;
        const maxWidth = APP_CONFIG.maxWindowWidth || 1920;

        let extra = 0;
        let weatherExtra = 0;
        document.body.classList.add('measuring-width');
        try {
            const timeline = this.el.timeline;
            if (timeline && AppData.showTimeline !== false) {
                const available = timeline.clientWidth;
                let contentWidth = 0;
                timeline.querySelectorAll('.time-node').forEach((node) => {
                    const nameWidth = node.querySelector('.name')?.scrollWidth || 0;
                    const timeWidth = node.querySelector('.time')?.scrollWidth || 0;
                    contentWidth += Math.max(nameWidth, timeWidth, 40);
                });
                if (contentWidth > available) extra = Math.max(extra, contentWidth - available);
            }
            if (AppData.showWeather !== false) {
                weatherExtra = this.measureWeatherOverflow();
                extra = Math.max(extra, weatherExtra);
            }
            const bottomInfo = this.el.customBottomText;
            if (bottomInfo && bottomInfo.textContent && this.isBottomTextVisible()) {
                const overflow = bottomInfo.scrollWidth - bottomInfo.clientWidth;
                if (overflow > 0) extra = Math.max(extra, overflow);
            }
        } finally {
            document.body.classList.remove('measuring-width');
        }

        this.applyWeatherExtraWidth(weatherExtra);

        const targetWidth = Math.min(maxWidth, Math.max(baseWidth, baseWidth + Math.ceil(extra) + 10));
        const appliedWidth = this.appliedMainWidth || baseWidth;
        if (targetWidth === appliedWidth) {
            return;
        }
        this.appliedMainWidth = targetWidth;
        try {
            if (extra > 0) {
                await this.animateWindowSize({ width: targetWidth, height: APP_CONFIG.windowSize.height }, APP_CONFIG.topOffset);
                void Logger.info('主界面宽度自适应', {
                    module: 'window',
                    action: 'fit-width',
                    context: { baseWidth, targetWidth, overflow: Math.ceil(extra) }
                });
            } else {
                await this.positionWindow({ width: targetWidth, height: APP_CONFIG.windowSize.height }, APP_CONFIG.topOffset);
            }
        } catch (error) {
            void Logger.warn('主界面宽度自适应失败', { module: 'window', action: 'fit-width' }, error);
        }
    },

    measureWeatherOverflow() {
        const container = this.el.weather;
        if (!container) return 0;
        const viewportWidth = window.innerWidth;
        const assigned = viewportWidth <= 900 ? 130 : viewportWidth <= 1100 ? 140 : 150;
        const contentWidth = Array.from(container.children)
            .reduce((sum, child) => sum + child.getBoundingClientRect().width, 0);
        const styles = getComputedStyle(container);
        const gaps = Math.max(0, container.children.length - 1) * (parseFloat(styles.columnGap) || 0);
        const borders = (parseFloat(styles.borderLeftWidth) || 0) + (parseFloat(styles.borderRightWidth) || 0);
        const naturalWidth = Math.max(contentWidth + gaps + borders, container.scrollWidth);
        return Math.max(0, Math.ceil(naturalWidth - assigned));
    },

    applyWeatherExtraWidth(extra) {
        const next = Math.max(0, Math.ceil(Number(extra) || 0));
        const current = this.weatherExtraWidth || 0;
        if (next === current) return false;
        this.weatherExtraWidth = next;
        const root = document.documentElement;
        if (next > 0) root.style.setProperty('--weather-extra', `${next}px`);
        else root.style.removeProperty('--weather-extra');
        return true;
    },

    windowTransition: null,
    windowTransitionToken: 0,

    async animateWindowSize(targetSize, top) {
        const token = ++this.windowTransitionToken;
        if (this.windowTransition) await this.windowTransition.catch(() => { });
        const run = (async () => {
            if (token !== this.windowTransitionToken) return;
            await this.positionWindow(targetSize, top);
        })();
        this.windowTransition = run;
        try {
            await run;
        } finally {
            if (this.windowTransition === run) this.windowTransition = null;
        }
    },

    windowVisible: true,

    hideMainWindow(source = 'unknown') {
        // 引导未完成时不允许隐藏窗口，否则托盘重新调出后引导状态与窗口尺寸会错乱
        if (typeof Onboarding !== 'undefined' && Onboarding.active) {
            void Logger.info('忽略隐藏主窗口请求（引导进行中）', {
                module: 'window', action: 'hide-skip', context: { source, visible: this.windowVisible }
            });
            try { void Neutralino.window.focus(); } catch (error) { }
            return;
        }
        void Logger.info('收到隐藏主窗口请求', {
            module: 'window', action: 'hide-request', context: { source, visible: this.windowVisible }
        });
        const apply = () => {
            const changed = this.windowVisible;
            this.windowVisible = false;
            if (changed) this.scheduleTrayUpdate(60, 'window-hidden');
            void Logger.info('主窗口已隐藏', { module: 'window', action: 'hide-complete', context: { source } });
        };
        try {
            const task = Neutralino.window.hide();
            if (task && typeof task.then === 'function') task.then(apply).catch((error) => {
                void Logger.error('隐藏窗口失败', { module: 'window', action: 'hide', context: { source } }, error);
            });
            else apply();
        } catch (error) {
            void Logger.error('隐藏窗口失败', { module: 'window', action: 'hide', context: { source } }, error);
        }
    },

    async showMainWindow() {
        void Logger.info('收到显示主窗口请求', { module: 'window', action: 'show-request', context: { visible: this.windowVisible } });
        this.el.viewSettings.classList.add('hidden');
        this.el.viewMain.classList.remove('hidden');
        this.appliedMainWidth = APP_CONFIG.windowSize.width;
        try {
            await this.positionWindow(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
            await this.setWindowDragRegion('main');
            await Neutralino.window.show();
            this.windowVisible = true;
            this.scheduleTrayUpdate(60, 'window-shown');
            await Neutralino.window.focus();
            this.scheduleFitWindow(200);
            void Logger.info('主窗口已显示', { module: 'window', action: 'show-complete' });
        } catch (error) {
            void Logger.error('显示窗口失败', { module: 'window', action: 'show' }, error);
            throw error;
        }
    },

    trayBound: false,
    trayUpdateTimer: null,
    trayUpdatePromise: Promise.resolve(),
    trayMenuSignature: null,
    trayIconPathCache: new Map(),
    async initTray() {
        if (this.trayBound) {
            this.scheduleTrayUpdate(0, 'initialize-again');
            return;
        }
        void Logger.info('初始化托盘菜单', { module: 'tray', action: 'init', context: { os: window.NL_OS } });
        try {
            const handleTrayAction = async (event) => {
                const rawDetail = event.detail;
                const menuItemId = typeof rawDetail === 'string'
                    ? rawDetail
                    : rawDetail?.id || rawDetail?.menuItemId || rawDetail?.itemId;
                void Logger.info('收到托盘菜单操作', {
                    module: 'tray', action: 'menu-action',
                    context: { menuItemId: menuItemId || '', visible: this.windowVisible }
                });
                try {
                    switch (menuItemId) {
                        case 'show':
                            await this.showMainWindow();
                            break;
                        case 'hide':
                            this.hideMainWindow('tray-hide');
                            break;
                        case 'settings':
                            await this.showMainWindow();
                            await this.openSettings();
                            break;
                        case 'refresh':
                            await this.handleRefresh();
                            break;
                        case 'check-update':
                            await Updater.check({ silent: false });
                            break;
                        case 'autostart':
                            await this.toggleAutoStart();
                            break;
                        case 'exit':
                            await App.shutdown('tray-menu');
                            break;
                        default:
                            void Logger.warn('忽略未知托盘菜单项', {
                                module: 'tray', action: 'unknown-menu-action', context: { menuItemId: String(menuItemId || '') }
                            });
                    }
                } catch (error) {
                    void Logger.error('托盘菜单操作失败', {
                        module: 'tray', action: 'menu-action', context: { menuItemId: String(menuItemId || '') }
                    }, error);
                }
            };
            await Neutralino.events.on('trayMenuItemClicked', handleTrayAction);
            this.trayBound = true;
            await this.updateTrayMenu('initialize');
            void Logger.info('托盘菜单初始化完成', { module: 'tray', action: 'init-complete' });
        } catch (error) {
            void Logger.error('托盘菜单初始化失败', { module: 'tray', action: 'init' }, error);
            try {
                await Dialog.alert(error.message || String(error), '托盘菜单初始化失败', 'danger');
            } catch (messageBoxError) { }
        }
    },

    scheduleTrayUpdate(delay = 150, reason = 'state-change') {
        clearTimeout(this.trayUpdateTimer);
        this.trayUpdateTimer = setTimeout(() => {
            void this.updateTrayMenu(reason).catch((error) => {
                void Logger.error('托盘菜单更新任务失败', { module: 'tray', action: 'schedule-update', context: { reason } }, error);
            });
        }, delay);
    },

    updateTrayMenu(reason = 'manual') {
        const update = this.trayUpdatePromise.catch(() => {}).then(() => this.applyTrayMenu(reason));
        this.trayUpdatePromise = update;
        return update;
    },

    async applyTrayMenu(reason = 'manual') {
        const visible = this.windowVisible === true;
        const stateSignature = JSON.stringify({ visible, autoStart: AppData.autoStart === true });
        if (stateSignature === this.trayMenuSignature) {
            void Logger.info('托盘菜单状态未变化，跳过重建', {
                module: 'tray', action: 'menu-update-skip', context: { reason, visible }
            });
            return;
        }
        const menuItems = [
            ...(visible
                ? [
                    { id: 'show', text: '显示主界面', isDisabled: true },
                    { id: 'hide', text: '隐藏主界面' }
                ]
                : [
                    { id: 'show', text: '显示主界面' },
                    { id: 'hide', text: '隐藏主界面', isDisabled: true }
                ]),
            { id: 'settings', text: '设置' },
            { id: 'refresh', text: '刷新' },
            { id: 'check-update', text: '检查更新' },
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
                await Neutralino.os.setTray({ icon: iconPath, menuItems });
                this.trayMenuSignature = stateSignature;
                void Logger.info('托盘菜单更新完成', {
                    module: 'tray', action: 'menu-update', context: { reason, visible, iconName }
                });
                return;
            } catch (error) {
                errors.push(`${iconName}: ${error?.message || error}`);
            }
        }
        void Logger.error('托盘创建失败', {
            module: 'tray', action: 'set', context: { reason, visible, attempted: errors }
        }, new Error(errors.join(' | ')));
    },

    async getTrayIconPath(fileName) {
        if (this.trayIconPathCache.has(fileName)) return this.trayIconPathCache.get(fileName);
        const errors = [];
        const candidates = this.getTrayIconCandidates(fileName);
        for (const candidate of candidates) {
            try {
                const stats = await Neutralino.filesystem.getStats(candidate);
                if (!stats.isFile) continue;
                const absolutePath = await Neutralino.filesystem.getAbsolutePath(candidate);
                this.trayIconPathCache.set(fileName, absolutePath);
                return absolutePath;
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
                const absolutePath = await Neutralino.filesystem.getAbsolutePath(tempPath);
                this.trayIconPathCache.set(fileName, absolutePath);
                return absolutePath;
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
        if (!config.weather.jwtConfig || typeof config.weather.jwtConfig !== 'object') {
            config.weather.jwtConfig = {};
        }
        if (config.weather.provider !== undefined && !Object.prototype.hasOwnProperty.call(APP_CONFIG.weatherProviders, config.weather.provider)) {
            throw new Error('天气服务商不受支持');
        }
        const stringFields = ['apiHost', 'location', 'realLocation'];
        for (const field of stringFields) {
            const value = config.weather[field];
            if (value !== undefined && value !== null && typeof value !== 'string') {
                throw new Error(`天气配置 ${field} 必须是字符串`);
            }
        }
        if (config.weather.apiKey !== undefined && config.weather.apiKey !== null && typeof config.weather.apiKey !== 'string') {
            throw new Error('天气 API Key 必须是字符串');
        }
        if (config.weather.providers !== undefined &&
            (!config.weather.providers || typeof config.weather.providers !== 'object' || Array.isArray(config.weather.providers))) {
            throw new Error('天气服务商配置必须是对象');
        }
        for (const [provider, providerConfig] of Object.entries(config.weather.providers || {})) {
            if (!Object.prototype.hasOwnProperty.call(APP_CONFIG.weatherProviders, provider) ||
                !providerConfig || typeof providerConfig !== 'object' || Array.isArray(providerConfig)) {
                throw new Error(`天气服务商配置无效：${provider}`);
            }
            for (const field of ['apiHost', 'apiKey']) {
                if (providerConfig[field] !== undefined && providerConfig[field] !== null && typeof providerConfig[field] !== 'string') {
                    throw new Error(`${provider} 的 ${field} 必须是字符串`);
                }
            }
            if (providerConfig.jwtConfig !== undefined &&
                (!providerConfig.jwtConfig || typeof providerConfig.jwtConfig !== 'object' || Array.isArray(providerConfig.jwtConfig))) {
                throw new Error(`${provider} 的 JWT 配置无效`);
            }
            if (providerConfig.jwtConfig?.privateKey !== undefined && typeof providerConfig.jwtConfig.privateKey !== 'string') {
                throw new Error(`${provider} 的私钥必须是字符串`);
            }
        }
        const jwtFields = ['kid', 'sub', 'iss', 'privateKey'];
        for (const field of jwtFields) {
            const value = config.weather.jwtConfig[field];
            if (value !== undefined && value !== null && typeof value !== 'string') {
                throw new Error(`JWT 配置 ${field} 必须是字符串`);
            }
        }
        const nestedMinutes = Number(config.weather.weatherRefreshMinutes);
        if (Number.isInteger(nestedMinutes) && nestedMinutes >= 1) {
            if (config.weatherRefreshMinutes === undefined) config.weatherRefreshMinutes = nestedMinutes;
            delete config.weather.weatherRefreshMinutes;
        }
        if (config.fontFamily !== undefined && config.fontFamily !== null && typeof config.fontFamily !== 'string') {
            throw new Error('全局字体必须是字符串');
        }
        if (config.fontSizeScale !== undefined && config.fontSizeScale !== null) {
            const scale = Number(config.fontSizeScale);
            if (!Number.isFinite(scale)) throw new Error('全局字号缩放必须是数字');
            config.fontSizeScale = Math.max(80, Math.min(150, Math.round(scale)));
        }
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
        const validateCourseMap = (courseMap, label) => {
            if (!courseMap || typeof courseMap !== 'object' || Array.isArray(courseMap)) {
                throw new Error(`${label}必须是按星期组织的对象`);
            }
            for (const day of Object.keys(DAY_MAP)) {
                if (courseMap[day] !== undefined && !Array.isArray(courseMap[day])) {
                    throw new Error(`${label}的${DAY_MAP[day]}课程必须是数组`);
                }
                for (const course of courseMap[day] || []) {
                    if (!course || typeof course !== 'object' ||
                        !/^([01]\d|2[0-3]):[0-5]\d$/.test(course.start || '') ||
                        !/^([01]\d|2[0-3]):[0-5]\d$/.test(course.end || '')) {
                        throw new Error(`${label}包含无效课程时间`);
                    }
                }
            }
        };
        if (config.courseRotation !== undefined) {
            if (!config.courseRotation || typeof config.courseRotation !== 'object' || Array.isArray(config.courseRotation)) {
                throw new Error('课表轮换配置无效');
            }
            if (config.courseRotation.startDate !== undefined &&
                Schedule.getDateKey(config.courseRotation.startDate) !== config.courseRotation.startDate) {
                throw new Error('轮换起始日期格式无效');
            }
            if (config.courseRotation.weeks !== undefined &&
                (!Array.isArray(config.courseRotation.weeks) || config.courseRotation.weeks.length > 7)) {
                throw new Error('轮换周期最多支持 8 周');
            }
            (config.courseRotation.weeks || []).forEach((week, index) => validateCourseMap(week, `第 ${index + 2} 周`));
        }
        if (config.courseOverrides !== undefined) {
            if (!config.courseOverrides || typeof config.courseOverrides !== 'object' || Array.isArray(config.courseOverrides)) {
                throw new Error('临时覆盖配置无效');
            }
            Object.entries(config.courseOverrides).forEach(([date, override]) => {
                if (Schedule.getDateKey(date) !== date || !override || typeof override !== 'object' ||
                    !Array.isArray(override.courses)) {
                    throw new Error(`临时覆盖日期或内容无效：${date}`);
                }
                if (override.type && !['adjustment', 'substitute', 'event'].includes(override.type)) {
                    throw new Error(`临时覆盖类型无效：${date}`);
                }
                override.courses.forEach((course) => {
                    if (!course || typeof course !== 'object' ||
                        !/^([01]\d|2[0-3]):[0-5]\d$/.test(course.start || '') ||
                        !/^([01]\d|2[0-3]):[0-5]\d$/.test(course.end || '')) {
                        throw new Error(`临时覆盖课程时间无效：${date}`);
                    }
                });
            });
        }
        if (config.displayProfiles !== undefined && !Array.isArray(config.displayProfiles)) {
            throw new Error('显示方案必须是数组');
        }
        const profileIds = new Set();
        (config.displayProfiles || []).forEach((profile) => {
            if (!profile || typeof profile.id !== 'string' || !profile.id ||
                typeof profile.name !== 'string' || !profile.name.trim()) {
                throw new Error('显示方案缺少有效的名称或标识');
            }
            if (profileIds.has(profile.id)) throw new Error(`显示方案标识重复：${profile.id}`);
            profileIds.add(profile.id);
            if (profile.theme && !['default', 'ocean', 'forest', 'midnight', 'high-contrast', 'monochrome'].includes(profile.theme)) {
                throw new Error(`显示方案主题无效：${profile.name}`);
            }
            if (profile.customBottomText !== undefined && typeof profile.customBottomText !== 'string') {
                throw new Error(`显示方案底部信息必须是文本：${profile.name}`);
            }
            for (const field of ['showWeather', 'showTimeline', 'showBottomText', 'showClockSeconds']) {
                if (profile[field] !== undefined && typeof profile[field] !== 'boolean') {
                    throw new Error(`显示方案 ${field} 必须是布尔值：${profile.name}`);
                }
            }
        });
        if (config.displayRules !== undefined) {
            if (!config.displayRules || typeof config.displayRules !== 'object' || Array.isArray(config.displayRules)) {
                throw new Error('显示方案日期规则无效');
            }
            Object.entries(config.displayRules).forEach(([date, profileId]) => {
                if (Schedule.getDateKey(date) !== date || !profileIds.has(profileId)) {
                    throw new Error(`显示方案日期规则无效：${date}`);
                }
            });
        }
    },

    maskSecret(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (/-----BEGIN/.test(text)) return '•••••••• (PEM 私钥已隐藏)';
        if (text.length <= 8) return '••••••';
        return `${text.slice(0, 4)}••••${text.slice(-4)}`;
    },

    buildConfigPreview(config, source, sectionsOnly = false) {
        const esc = (value) => this.escapeHtml(value);
        const currentVersion = String(window.NL_APPVERSION || '').trim();
        const fileVersion = String(config?.version || '').trim();
        const versionMatch = Boolean(fileVersion) && fileVersion === currentVersion;
        const weather = config?.weather || {};
        const jwt = weather.jwtConfig || {};
        const courses = config?.courses || {};

        let totalCourses = 0;
        let activeDays = 0;
        const dayKeys = Object.keys(DAY_MAP);
        dayKeys.forEach((day) => {
            const list = Array.isArray(courses[day]) ? courses[day] : [];
            if (list.length) activeDays += 1;
            totalCourses += list.length;
        });

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

        const providerSummary = Object.entries(APP_CONFIG.weatherProviders).map(([provider, details]) => {
            const saved = weather.providers?.[provider] || {};
            const configured = provider === (weather.provider || 'qweather') || saved.apiHost || saved.apiKey ||
                (provider === 'qweather' && (weather.apiHost || jwt.privateKey)) ||
                Boolean(SecretVault.recall(`weather:${provider}:apiKey`) || SecretVault.recall(`jwt:${provider}:privateKey`));
            return `${details.label}${configured ? '（已配置）' : '（未配置）'}`;
        }).join('、');
        const weatherGrid = [
            item('服务商', APP_CONFIG.weatherProviders[weather.provider || 'qweather']?.label || '未知'),
            item('所有服务商配置', providerSummary),
            item('API Host', weather.apiHost, { critical: true }),
            item('API Key', weather.apiKey, { secret: true }),
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
            item('文本位置', `${config?.bottomAlign === 'left' ? '左对齐' : config?.bottomAlign === 'center' ? '居中' : '右对齐'}${Number(config?.bottomOffset) ? ` · 垂直 ${config.bottomOffset} px` : ''}`),
            item('显示天气', config?.showWeather === false ? '已隐藏' : '显示'),
            item('显示课表', config?.showTimeline === false ? '已隐藏' : '显示'),
            item('显示自定义文本', config?.showBottomText === false ? '已隐藏' : '显示'),
            item('显示时钟秒数', config?.showClockSeconds === false ? '关闭' : '开启'),
            item('倒计时名称', config?.countdownName),
                item('目标日期', CustomDatePicker.formatDate(config?.countdownDate)),
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
        if (sectionsOnly) return sections;

        return `
            <div class="import-preview">
                <div class="import-preview-meta">${meta}</div>
                <div class="import-preview-legend">
                    <i class="import-preview-critical-mark" aria-hidden="true">●</i>标记项为关键配置，导入后将覆盖当前设置
                </div>${sections}
            </div>`;
    },

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
        imported.weather.provider = imported.weather.provider || 'qweather';
        if (!imported.weather.providers || typeof imported.weather.providers !== 'object') imported.weather.providers = {};
        if (!imported.weather.providers[imported.weather.provider]) {
            imported.weather.providers[imported.weather.provider] = imported.weather.provider === 'qweather'
                ? { apiHost: imported.weather.apiHost || '', jwtConfig: { ...imported.weather.jwtConfig } }
                : { apiKey: imported.weather.apiKey || '' };
        }
        const activeProviderConfig = imported.weather.providers[imported.weather.provider];
        if (imported.weather.provider === 'qweather') {
            imported.weather.apiHost = activeProviderConfig.apiHost || imported.weather.apiHost || '';
            imported.weather.jwtConfig = { ...imported.weather.jwtConfig, ...(activeProviderConfig.jwtConfig || {}) };
        } else {
            imported.weather.apiKey = activeProviderConfig.apiKey || imported.weather.apiKey || '';
        }
        if (!imported.courses) imported.courses = {};
        if (!Array.isArray(imported.subjects)) imported.subjects = [];
        imported.onboardingCompleted = true;
        imported.onboardingCompletedAt = AppData.onboardingCompletedAt || new Date().toISOString();
        delete imported.version;
        SecretVault.remember('weather:apiHost', imported.weather.apiHost || '');
        SecretVault.remember('weather:location', imported.weather.location || '');
        SecretVault.remember('weather:apiKey', imported.weather.apiKey || '');
        SecretVault.remember('jwt:privateKey', imported.weather.jwtConfig.privateKey || '');
        for (const [provider, providerConfig] of Object.entries(imported.weather.providers)) {
            SecretVault.remember(`weather:${provider}:apiHost`, providerConfig.apiHost || '');
            SecretVault.remember(`weather:${provider}:apiKey`, providerConfig.apiKey || '');
            SecretVault.remember(`jwt:${provider}:privateKey`, providerConfig.jwtConfig?.privateKey || '');
        }

        EditData = imported;
        try {
            const autoStartError = await this.persistSettings({ trigger: 'import', source, versionMatch });
            void Logger.info('导入配置已保存', { module: 'config', action: 'import-save', context: { source, versionMatch } });
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

    async downloadCourseTemplate() {
        try {
            if (typeof XLSX === 'undefined') throw new Error('Excel 组件尚未加载');
            const workbook = XLSX.utils.book_new();
            const rows = [
                ['周次', '星期', '开始时间', '结束时间', '课程', '备注'],
                [1, '周一', '08:00', '08:45', '语文', ''],
                [2, '周一', '08:00', '08:45', '数学', '可选；不填写时按第 1 周处理']
            ];
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '课程表');
            const path = await Neutralino.os.showSaveDialog('保存 Excel 课表模板', {
                forceOverwrite: true,
                defaultPath: 'classbroom-course-template.xlsx',
                filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
            });
            if (!path) return;
            const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            await Neutralino.filesystem.writeBinaryFile(path, bytes);
            await Dialog.alert(path, '模板已保存');
        } catch (error) {
            await Dialog.alert(error.message || String(error), '模板生成失败', 'danger');
        }
    },

    async exportCoursesSpreadsheet() {
        try {
            if (typeof XLSX === 'undefined') throw new Error('Excel 组件尚未加载');
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.aoa_to_sheet(CourseExport.buildRotationRows(EditData, DAY_MAP)),
                '轮换课表'
            );
            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.aoa_to_sheet(CourseExport.buildOverrideRows(EditData)),
                '临时覆盖'
            );
            const path = await Neutralino.os.showSaveDialog('导出 Excel 课表', {
                forceOverwrite: true,
                defaultPath: 'classbroom-courses.xlsx',
                filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
            });
            if (!path) return;
            const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            await Neutralino.filesystem.writeBinaryFile(path, bytes);
            await Dialog.alert(path, '课表已导出');
        } catch (error) {
            await Dialog.alert(error.message || String(error), '课表导出失败', 'danger');
        }
    },

    async importCoursesSpreadsheet() {
        try {
            const paths = await Neutralino.os.showOpenDialog('导入 Excel 课表', {
                multiSelections: false,
                filters: [{ name: 'Excel / CSV 课表', extensions: ['xlsx', 'xls', 'csv'] }]
            });
            if (!paths?.length) return;
            if (typeof XLSX === 'undefined') throw new Error('Excel 组件尚未加载');
            const filePath = paths[0];
            const isCsv = /\.csv$/i.test(filePath);
            const fileData = isCsv
                ? await Neutralino.filesystem.readFile(filePath)
                : await Neutralino.filesystem.readBinaryFile(filePath);
            const workbook = XLSX.read(fileData, { type: isCsv ? 'string' : 'array', cellDates: false });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) throw new Error('工作簿中没有工作表');
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
            const parsed = CourseImport.parseRows(rows);
            if (parsed.errors.length) {
                await Dialog.alert(parsed.errors.slice(0, 12).join('\n'), '课表内容有误', 'warning');
                return;
            }
            const groups = new Map();
            parsed.entries.forEach((entry) => {
                const key = `${entry.week}:${entry.day}`;
                groups.set(key, (groups.get(key) || 0) + 1);
            });
            const summary = [...groups.entries()].map(([key, count]) => {
                const [week, day] = key.split(':');
                return `第${week}周 ${DAY_MAP[day]}：${count} 节`;
            }).join('\n');
            const confirmed = await Dialog.confirm(
                `共识别 ${parsed.entries.length} 节课程，将替换文件中出现的轮换周和星期，其他安排不变。\n\n${summary}`,
                { title: '确认导入课表', confirmText: '导入并替换' }
            );
            if (!confirmed) return;

            const maxWeek = Math.max(...parsed.entries.map((entry) => entry.week));
            while (EditData.courseRotation.weeks.length < maxWeek - 1) EditData.courseRotation.weeks.push({});
            const replacements = new Map();
            parsed.entries.forEach((entry) => {
                const key = `${entry.week}:${entry.day}`;
                if (!replacements.has(key)) replacements.set(key, []);
                replacements.get(key).push({ start: entry.start, end: entry.end, course: entry.course, note: entry.note });
            });
            replacements.forEach((courses, key) => {
                const [week, day] = key.split(':');
                const weekCourses = Number(week) === 1 ? EditData.courses : EditData.courseRotation.weeks[Number(week) - 2];
                weekCourses[day] = courses;
            });
            this.el.cycleWeekCount.value = String(EditData.courseRotation.weeks.length + 1);
            CurrentEditMode = 'regular';
            this.el.courseEditMode.value = CurrentEditMode;
            CurrentEditWeek = 1;
            CurrentEditDay = parsed.entries[0].day;
            CurrentEditCourseIndex = null;
            CustomSelect.syncAll();
            CustomDatePicker.syncAll();
            this.renderCourseCycleSelector();
            this.renderDaySelector();
            this.renderCourseList();
            this.markSettingsDirty();
            await Dialog.alert(`已导入 ${parsed.entries.length} 节课程，请保存设置以应用。`, '导入完成');
        } catch (error) {
            void Logger.error('Excel 课表导入失败', { module: 'course', action: 'spreadsheet-import' }, error);
            await Dialog.alert(error.message || String(error), '导入失败', 'danger');
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

    buildExportPayload(source) {
        const clone = JSON.parse(JSON.stringify(source || {}));
        const weather = clone.weather || {};
        const jwt = weather.jwtConfig || {};
        const customTexts = clone.customTexts || {};
        const activeProvider = weather.provider || 'qweather';
        const weatherProviders = {};
        Object.keys(APP_CONFIG.weatherProviders).forEach((provider) => {
            const saved = weather.providers?.[provider] || {};
            const providerJwt = saved.jwtConfig || (provider === 'qweather' ? jwt : {});
            if (provider === 'qweather') {
                weatherProviders[provider] = {
                    apiHost: saved.apiHost || SecretVault.recall(`weather:${provider}:apiHost`) ||
                        (activeProvider === provider ? weather.apiHost : '') || '',
                    jwtConfig: {
                        kid: providerJwt.kid || '',
                        sub: providerJwt.sub || '',
                        iss: providerJwt.iss || '',
                        privateKey: providerJwt.privateKey || SecretVault.recall('jwt:qweather:privateKey') ||
                            (activeProvider === provider ? SecretVault.recall('jwt:privateKey') : '') || ''
                    }
                };
            } else if (provider === 'weatherApi' || provider === 'openWeatherMap') {
                weatherProviders[provider] = {
                    apiKey: saved.apiKey || SecretVault.recall(`weather:${provider}:apiKey`) ||
                        (activeProvider === provider ? weather.apiKey || SecretVault.recall('weather:apiKey') : '') || ''
                };
            } else {
                weatherProviders[provider] = {};
            }
        });
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
            bottomAlign: ['left', 'center', 'right'].includes(clone.bottomAlign) ? clone.bottomAlign : 'right',
            bottomOffset: Math.max(-20, Math.min(20, Math.round(Number(clone.bottomOffset) || 0))),
            showWeather: clone.showWeather !== false,
            showTimeline: clone.showTimeline !== false,
            showBottomText: clone.showBottomText !== false,
            showClockSeconds: clone.showClockSeconds !== false,
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
                provider: weather.provider || 'qweather',
                providers: weatherProviders,
                apiHost: weather.apiHost || '',
                apiKey: weather.apiKey || SecretVault.recall(`weather:${activeProvider}:apiKey`) || SecretVault.recall('weather:apiKey'),
                location: weather.location || '',
                realLocation: weather.realLocation || '',
                jwtConfig: {
                    kid: jwt.kid || '',
                    sub: jwt.sub || '',
                    iss: jwt.iss || '',
                    privateKey: jwt.privateKey || SecretVault.recall('jwt:qweather:privateKey') || SecretVault.recall('jwt:privateKey')
                }
            }
        };
        const known = new Set(['version', 'exportedAt', 'theme', 'fontFamily', 'fontSizeScale', 'courseFont',
            'courseFontSize', 'customBottomText', 'bottomFontSize', 'bottomColor', 'countdownName', 'countdownDate',
            'customTexts', 'weatherRefreshMinutes', 'autoStart', 'subjects', 'courses', 'weather',
            'bottomAlign', 'bottomOffset', 'showWeather', 'showTimeline', 'showBottomText',
            'showClockSeconds',
            'lastUpdateCheckAt', 'latestKnownVersion',
            'onboardingCompleted', 'onboardingCompletedAt']);
        Object.keys(clone).forEach((key) => {
            if (!known.has(key)) payload[key] = clone[key];
        });
        return payload;
    },

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
            if (inSettings) this.cacheWeatherProviderFields(this.el.inputWeatherProvider.value || 'qweather');
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

    async openSettings(configToEdit = null, options = {}) {
        const { tab = null, guide = false } = options;
        EditData = configToEdit
            ? JSON.parse(JSON.stringify(configToEdit))
            : JSON.parse(JSON.stringify(AppData));
        if (!EditData.weather) EditData.weather = { jwtConfig: {} };
        if (!EditData.weather.jwtConfig) EditData.weather.jwtConfig = {};
        if (!EditData.courses) EditData.courses = {};
        if (!EditData.courseRotation || typeof EditData.courseRotation !== 'object' || Array.isArray(EditData.courseRotation)) EditData.courseRotation = {};
        if (!Array.isArray(EditData.courseRotation.weeks)) EditData.courseRotation.weeks = [];
        if (!EditData.courseRotation.startDate) {
            EditData.courseRotation.startDate = Schedule.getDateKey(Schedule.getMonday(new Date()));
        }
        if (!EditData.courseOverrides || typeof EditData.courseOverrides !== 'object' || Array.isArray(EditData.courseOverrides)) EditData.courseOverrides = {};
        if (!Array.isArray(EditData.displayProfiles)) EditData.displayProfiles = [];
        if (!EditData.displayRules || typeof EditData.displayRules !== 'object') EditData.displayRules = {};
        CurrentEditWeek = 1;
        CurrentEditMode = 'regular';
        CurrentOverrideDate = Schedule.getDateKey(new Date());
        this.el.cycleWeekCount.value = String(EditData.courseRotation.weeks.length + 1);
        this.el.cycleStartDate.value = EditData.courseRotation.startDate;
        this.el.courseEditMode.value = CurrentEditMode;
        this.el.overrideDate.value = CurrentOverrideDate;
        this.el.inputDisplayRuleDate.value = '';

        const activeProvider = EditData.weather.provider || 'qweather';
        const hasProviderConfigs = EditData.weather.providers && typeof EditData.weather.providers === 'object';
        if (!hasProviderConfigs) EditData.weather.providers = {};
        if (!EditData.weather.providers[activeProvider]) {
            EditData.weather.providers[activeProvider] = activeProvider === 'qweather'
                ? { apiHost: EditData.weather.apiHost || '', jwtConfig: { ...EditData.weather.jwtConfig } }
                : { apiKey: EditData.weather.apiKey || '' };
        }
        this.el.inputWeatherProvider.value = activeProvider;
        CustomSelect.setValue('select-weather-provider', activeProvider);
        this.activeWeatherProvider = activeProvider;
        this.loadWeatherProviderFields(activeProvider);
        this.updateWeatherProviderFields();
        this.el.inputLocation.value = EditData.weather.location || '';
        this.el.inputRealLocation.value = EditData.weather.realLocation || '';
        this.el.inputAutoStart.checked = EditData.autoStart === true;
        this.el.inputTheme.value = EditData.theme || 'default';
        this.el.inputWeatherRefreshMinutes.value = EditData.weatherRefreshMinutes || 10;
        this.el.inputCustomBottomText.value = EditData.customBottomText || '';
        CurrentEditCourseIndex = null;
        this.el.inputCountdownName.value = EditData.countdownName || '';
        this.el.inputCountdownDate.value = EditData.countdownDate || '';
        this.el.inputBottomFontSize.value = EditData.bottomFontSize || 10;
        this.el.inputShowWeather.checked = EditData.showWeather !== false;
        this.el.inputShowTimeline.checked = EditData.showTimeline !== false;
        this.el.inputShowBottom.checked = EditData.showBottomText !== false;
        this.el.inputShowClockSeconds.checked = EditData.showClockSeconds !== false;
        this.el.inputShowBottomText.checked = EditData.showBottomText !== false;
        this.el.inputBottomOffset.value = Math.max(-20, Math.min(20, Number(EditData.bottomOffset) || 0));
        this.setBottomAlign(EditData.bottomAlign || 'right');
        this.syncBottomOffsetLabel();
        this.el.inputCourseFont.value = EditData.courseFont || '';
        this.el.inputCourseFontSize.value = EditData.courseFontSize || 15;
        this.el.inputFontFamily.value = EditData.fontFamily || '';
        this.el.inputFontSizeScale.value = EditData.fontSizeScale || 100;
        this.syncFontSizeScaleLabel();
        this.syncRangeLabels();
        this.updateFontPreview();
        CustomSelect.setValue('select-theme', this.el.inputTheme.value);
        CustomSelect.setValue('select-theme-main', this.el.inputTheme.value);
        CustomSelect.setValue('select-font-family', this.el.inputFontFamily.value);
        CustomSelect.setValue('select-course-font', this.el.inputCourseFont.value);
        this.el.inputBottomColor.value = EditData.bottomColor || '#64748b';
        this.el.inputCustomOne.value = EditData.customTexts?.one || '';
        this.el.inputCustomTwo.value = EditData.customTexts?.two || '';
        this.el.inputCustomThree.value = EditData.customTexts?.three || '';
        this.renderSubjectList();
        this.renderDisplayProfileEditor();
        this.renderCourseCycleSelector();
        this.renderCourseModeControls();
        CustomSelect.syncAll();
        CustomDatePicker.syncAll();
        if (this.el.aboutVersion) this.el.aboutVersion.textContent = window.NL_APPVERSION || '--';
        this.renderAboutUpdateState();

        this.renderCourseList(); 

        this.el.viewMain.classList.add('hidden');
        this.el.viewSettings.classList.remove('hidden');
        this.bindSettingsDirtyTracking();
        this.settingsSnapshot = this.getSettingsSnapshot();

        await this.animateWindowSize(APP_CONFIG.settingsSize);
        await this.setWindowDragRegion('settings');
        if (tab) this.switchTab(tab);
        if (guide) this.runWeatherGuide();
    },

    /**
     * 按 data-target 切换设置页标签。
     * @param {string} target 标签名（main/weather/courses/bottom/about）
     */
    switchTab(target) {
        if (!target) return;
        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.target === target);
        });
        document.querySelectorAll('.tab-content').forEach((content) => {
            content.classList.toggle('active', content.id === `tab-${target}`);
        });
        const targetEl = document.getElementById(`tab-${target}`);
        if (targetEl) void targetEl.offsetWidth;
    },

    
    runWeatherGuide() {
        const provider = this.el.inputWeatherProvider;
        if (!provider) return;
        provider.closest('.form-group')?.scrollIntoView({ block: 'nearest' });
        provider.focus({ preventScroll: true });
    },

    getWeatherProviderConfig(provider) {
        if (!EditData.weather.providers || typeof EditData.weather.providers !== 'object') EditData.weather.providers = {};
        if (!EditData.weather.providers[provider] || typeof EditData.weather.providers[provider] !== 'object') {
            EditData.weather.providers[provider] = {};
        }
        return EditData.weather.providers[provider];
    },

    cacheWeatherProviderFields(provider) {
        const config = this.getWeatherProviderConfig(provider);
        if (provider === 'qweather') {
            config.apiHost = this.el.inputApiHost.value.trim() || SecretVault.recall('weather:qweather:apiHost') || config.apiHost || '';
            const jwt = config.jwtConfig || {};
            config.jwtConfig = {
                kid: this.el.inputKid.value.trim(),
                sub: this.el.inputSub.value.trim(),
                iss: this.el.inputIss.value.trim(),
                privateKey: this.el.inputPrivateKey.value.trim() || SecretVault.recall('jwt:qweather:privateKey') || jwt.privateKey ||
                    SecretVault.recall('jwt:privateKey') || (EditData.weather.provider === provider ? EditData.weather.jwtConfig?.privateKey : '') || ''
            };
            return;
        }
        config.apiKey = this.el.inputWeatherApiKey.value.trim() || SecretVault.recall(`weather:${provider}:apiKey`) || config.apiKey ||
            (EditData.weather.provider === provider ? EditData.weather.apiKey || SecretVault.recall('weather:apiKey') : '') || '';
    },

    loadWeatherProviderFields(provider) {
        const config = this.getWeatherProviderConfig(provider);
        const isQWeather = provider === 'qweather';
        const jwt = config.jwtConfig || (isQWeather ? EditData.weather.jwtConfig || {} : {});
        this.el.inputApiHost.value = isQWeather
            ? config.apiHost || SecretVault.recall('weather:qweather:apiHost') || (EditData.weather.provider === provider ? EditData.weather.apiHost : '') || ''
            : '';
        this.el.inputKid.value = isQWeather ? jwt.kid || '' : '';
        this.el.inputSub.value = isQWeather ? jwt.sub || '' : '';
        this.el.inputIss.value = isQWeather ? jwt.iss || '' : '';
        this.el.inputPrivateKey.value = '';
        const savedPrivateKey = isQWeather && Boolean(jwt.privateKey || SecretVault.recall('jwt:qweather:privateKey') || SecretVault.recall('jwt:privateKey'));
        this.el.inputPrivateKey.placeholder = savedPrivateKey ? '已保存私钥，留空则保持不变' : '-----BEGIN PRIVATE KEY-----...';
        this.el.inputWeatherApiKey.value = '';
        const savedApiKey = !isQWeather && Boolean(config.apiKey || SecretVault.recall(`weather:${provider}:apiKey`) ||
            (EditData.weather.provider === provider && (EditData.weather.apiKey || SecretVault.recall('weather:apiKey'))));
        this.el.inputWeatherApiKey.placeholder = savedApiKey ? '已保存密钥，留空则保持不变' : '输入 API Key';
    },

    switchWeatherProvider() {
        const previous = this.activeWeatherProvider || EditData.weather.provider || 'qweather';
        this.cacheWeatherProviderFields(previous);
        const provider = this.el.inputWeatherProvider.value || 'qweather';
        this.loadWeatherProviderFields(provider);
        this.activeWeatherProvider = provider;
        this.updateWeatherProviderFields();
        this.markSettingsDirty();
    },

    updateWeatherProviderFields() {
        const provider = this.el.inputWeatherProvider.value || 'qweather';
        const isQWeather = provider === 'qweather';
        const needsApiKey = ['weatherApi', 'openWeatherMap'].includes(provider);
        this.el.weatherApiHostGroup.hidden = !isQWeather;
        this.el.weatherQWeatherGuide.hidden = !isQWeather;
        this.el.weatherJwtSection.hidden = !isQWeather;
        this.el.weatherApiKeySection.hidden = !needsApiKey;
        this.el.weatherProviderHint.textContent = {
            qweather: '和风天气需要 API Host 与 JWT 凭据，并支持天气预警。',
            openMeteo: '无需密钥；提供当前天气，不包含天气预警。',
            weatherApi: '需要 API Key；当前天气和预警由 forecast 接口提供。',
            openWeatherMap: '需要 API Key；当前天气可用，不包含天气预警。'
        }[provider] || '';
    },

    normalizeLocationText(value) {
        return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s·,，、]/g, '');
    },

    formatLocationLabel(result) {
        const parts = [result.name, result.admin3, result.admin2, result.admin1, result.country].filter(Boolean);
        return parts.filter((part, index) => parts.findIndex((candidate) => this.normalizeLocationText(candidate) === this.normalizeLocationText(part)) === index).join(' · ');
    },

    async searchWeatherLocations() {
        const query = this.el.inputLocationQuery.value.trim();
        if (query.length < 2) {
            this.el.locationSearchStatus.textContent = '请输入至少两个字符';
            return;
        }
        this.el.btnSearchLocation.disabled = true;
        this.el.locationSearchStatus.textContent = '正在搜索地区…';
        try {
            const queryText = this.normalizeLocationText(query);
            const results = await API.searchLocations(query);
            const rankedResults = results.filter((result) => result.name &&
                result.latitude !== null && result.latitude !== undefined && Number.isFinite(Number(result.latitude)) &&
                result.longitude !== null && result.longitude !== undefined && Number.isFinite(Number(result.longitude)));
            rankedResults.sort((resultA, resultB) => {
                const rank = (result) => {
                    const name = this.normalizeLocationText(result.name);
                    if (name === queryText) return 0;
                    if (name.startsWith(queryText)) return 1;
                    if (name.includes(queryText)) return 2;
                    return 3;
                };
                return rank(resultA) - rank(resultB) || (Number(resultB.population) || 0) - (Number(resultA.population) || 0);
            });
            const seenCoordinates = new Set();
            this.locationResults = rankedResults.filter((result) => {
                const coordinateKey = `${Number(result.latitude).toFixed(5)},${Number(result.longitude).toFixed(5)}`;
                if (seenCoordinates.has(coordinateKey)) return false;
                seenCoordinates.add(coordinateKey);
                return true;
            });
            const labels = this.locationResults.map((result) => this.formatLocationLabel(result));
            const labelCounts = new Map(labels.map((label) => [label, labels.filter((item) => item === label).length]));
            const options = this.locationResults.map((result, index) => {
                const label = labels[index];
                const coordinates = `(${Number(result.latitude).toFixed(4)}, ${Number(result.longitude).toFixed(4)})`;
                return { value: String(index), label: labelCounts.get(label) > 1 ? `${label} ${coordinates}` : label };
            });
            CustomSelect.setOptions('select-geocoding-result', options);
            CustomSelect.setValue('select-geocoding-result', '');
            this.el.locationSearchStatus.textContent = options.length
                ? `找到 ${options.length} 个地区，选择匹配项以填入位置`
                : '没有找到匹配地区';
        } catch (error) {
            this.locationResults = [];
            CustomSelect.setOptions('select-geocoding-result', []);
            CustomSelect.setValue('select-geocoding-result', '');
            this.el.locationSearchStatus.textContent = '地区查询失败，请检查网络后重试';
        } finally {
            this.el.btnSearchLocation.disabled = false;
        }
    },

    async locateWeatherByIp() {
        this.el.btnLocateByIp.disabled = true;
        this.el.locationSearchStatus.textContent = '正在根据公网 IP 推测位置…';
        try {
            const result = await API.locateByIp();
            if (result.latitude === null || result.latitude === undefined || result.longitude === null || result.longitude === undefined ||
                !Number.isFinite(Number(result.latitude)) || !Number.isFinite(Number(result.longitude))) {
                throw new Error('定位服务未返回有效坐标');
            }
            const location = {
                name: result.city,
                admin1: result.region,
                country: result.country
            };
            this.el.inputLocation.value = `${Number(result.longitude).toFixed(5)},${Number(result.latitude).toFixed(5)}`;
            this.el.inputRealLocation.value = this.formatLocationLabel(location);
            this.el.locationSearchStatus.textContent = `已填入：${this.el.inputRealLocation.value}（IP 定位仅供参考）`;
            this.markSettingsDirty();
        } catch (error) {
            this.el.locationSearchStatus.textContent = 'IP 定位失败，可改用地区搜索或手动填写经纬度';
            void Logger.warn('IP 地区定位失败', { module: 'weather', action: 'ip-geolocation' }, error);
        } finally {
            this.el.btnLocateByIp.disabled = false;
        }
    },

    applySelectedLocation() {
        const value = this.el.inputGeocodingResult.value;
        if (value === '') return;
        const result = this.locationResults[Number(value)];
        if (!result || !Number.isFinite(Number(result.longitude)) || !Number.isFinite(Number(result.latitude))) return;
        this.el.inputLocation.value = `${Number(result.longitude).toFixed(5)},${Number(result.latitude).toFixed(5)}`;
        this.el.inputRealLocation.value = this.formatLocationLabel(result);
        this.el.locationSearchStatus.textContent = '已填入地区和经纬度';
        this.markSettingsDirty();
    },

    async openWeatherProvider() {
        const provider = this.el.inputWeatherProvider.value || 'qweather';
        const details = APP_CONFIG.weatherProviders[provider] || APP_CONFIG.weatherProviders.qweather;
        const dialog = Dialog.show({
            title: `${details.label} 控制台`,
            html: `<div class="provider-browser"><div class="provider-browser-toolbar"><span>若页面未显示或无法登录，请使用系统浏览器打开。</span><button id="btn-weather-provider-external" class="btn btn-secondary" type="button">在系统浏览器打开</button></div><span id="weather-provider-open-error" role="status"></span><iframe class="provider-browser-frame" src="${this.escapeHtml(details.url)}" title="${this.escapeHtml(details.label)} 控制台" referrerpolicy="no-referrer" sandbox="allow-forms allow-scripts allow-same-origin allow-popups"></iframe></div>`,
            wide: true,
            buttons: [{ text: '关闭', value: true, primary: true }]
        });
        document.getElementById('btn-weather-provider-external')?.addEventListener('click', async () => {
            try {
                await Neutralino.os.open(details.url);
            } catch (error) {
                const status = document.getElementById('weather-provider-open-error');
                if (status) status.textContent = error.message || String(error);
            }
        });
        await dialog;
    },

    async closeSettings({ silent = false } = {}) {
        this.el.viewSettings.classList.add('hidden');
        this.el.viewMain.classList.remove('hidden');

        this.appliedMainWidth = APP_CONFIG.windowSize.width;
        await this.animateWindowSize(APP_CONFIG.windowSize, APP_CONFIG.topOffset);
        await this.setWindowDragRegion('main');
        if (!silent) this.scheduleFitWindow(200);
    },

    async cancelSettings() {
        const hasChanges = this.getSettingsSnapshot() !== this.settingsSnapshot;
        const confirmed = await Dialog.confirm(
            hasChanges ? '有尚未保存的修改，确定放弃并退出设置吗？' : '确定退出设置吗？',
            { title: '取消设置', confirmText: hasChanges ? '放弃修改' : '退出设置' }
        );
        if (confirmed) await this.closeSettings();
    },

    getSettingsSnapshot() {
        const fields = [
            'inputApiHost', 'inputLocation', 'inputRealLocation', 'inputKid', 'inputSub', 'inputIss',
            'inputPrivateKey', 'inputWeatherApiKey', 'inputTheme', 'inputWeatherRefreshMinutes', 'inputCustomBottomText',
            'inputCountdownName', 'inputCountdownDate', 'inputBottomFontSize', 'inputBottomColor',
            'inputCourseFont', 'inputCourseFontSize', 'inputFontFamily', 'inputFontSizeScale',
            'inputCustomOne', 'inputCustomTwo', 'inputCustomThree', 'inputBottomOffset'
        ];
        const values = fields.map((key) => this.el[key]?.value ?? '');
        values.push(this.el.inputWeatherProvider?.value || 'qweather');
        values.push(this.el.inputAutoStart?.checked === true);
        values.push(this.el.inputShowWeather?.checked === true);
        values.push(this.el.inputShowTimeline?.checked === true);
        values.push(this.el.inputShowBottom?.checked === true);
        values.push(this.el.inputShowClockSeconds?.checked === true);
        values.push(this.el.inputShowBottomText?.checked === true);
        values.push(this.getBottomAlign());
        values.push(
            this.el.displayProfileEdit?.value || '',
            this.el.inputDisplayProfileName?.value || '',
            this.el.inputDisplayProfileTheme?.value || '',
            this.el.inputProfileShowWeather?.checked === true,
            this.el.inputProfileShowTimeline?.checked === true,
            this.el.inputProfileShowBottom?.checked === true,
            this.el.inputProfileShowSeconds?.checked === true,
            this.el.inputProfileBottomText?.value || '',
            this.el.inputDisplayRuleDate?.value || '',
            this.el.displayRuleProfile?.value || '',
            this.el.cycleWeekCount?.value || '',
            this.el.cycleStartDate?.value || ''
        );
        return JSON.stringify({ values, editData: EditData });
    },

    markSettingsDirty() {
        if (this.el.btnSaveSettings) this.el.btnSaveSettings.disabled = false;
    },

    bindSettingsDirtyTracking() {
        if (!this.el.viewSettings || this.settingsDirtyBound) return;
        this.el.viewSettings.addEventListener('input', () => this.markSettingsDirty());
        this.el.viewSettings.addEventListener('change', (event) => {
            if (event.target === this.el.inputShowBottom || event.target === this.el.inputShowBottomText) {
                const synchronizedInput = event.target === this.el.inputShowBottom
                    ? this.el.inputShowBottomText
                    : this.el.inputShowBottom;
                synchronizedInput.checked = event.target.checked;
            }
            this.markSettingsDirty();
        });
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
            delete AppData.weather.jwtConfig.privateKey;
            delete AppData.weather.apiKey;
            for (const providerConfig of Object.values(AppData.weather.providers || {})) {
                if (!providerConfig || typeof providerConfig !== 'object') continue;
                providerConfig.apiHost = '';
                providerConfig.apiKey = '';
                if (providerConfig.jwtConfig) providerConfig.jwtConfig.privateKey = '';
            }
            AppData.weather.apiHost = SecretVault.recall('weather:apiHost');
            AppData.weather.location = SecretVault.recall('weather:location');
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
        const privateKeyInput = this.el.inputPrivateKey;
        if (privateKeyInput) privateKeyInput.value = '';
        if (EditData.weather?.jwtConfig) EditData.weather.jwtConfig.privateKey = '';
        this.scheduleTrayUpdate();
        await this.closeSettings();
        await App.init();
        return autoStartError;
    },

    async saveSettings() {
        const provider = this.el.inputWeatherProvider.value || 'qweather';
        this.cacheWeatherProviderFields(provider);
        EditData.weather.provider = provider;
        const providerConfig = this.getWeatherProviderConfig(provider);
        EditData.weather.apiHost = provider === 'qweather' ? providerConfig.apiHost || '' : '';
        EditData.weather.apiKey = provider === 'qweather' ? '' : providerConfig.apiKey || '';
        EditData.weather.jwtConfig = provider === 'qweather' ? { ...providerConfig.jwtConfig } : {};
        SecretVault.remember('weather:apiHost', EditData.weather.apiHost);
        SecretVault.remember('weather:apiKey', EditData.weather.apiKey);
        SecretVault.remember(`weather:${provider}:apiHost`, providerConfig.apiHost || '');
        SecretVault.remember(`weather:${provider}:apiKey`, providerConfig.apiKey || '');
        SecretVault.remember('jwt:privateKey', EditData.weather.jwtConfig.privateKey || '');
        SecretVault.remember(`jwt:${provider}:privateKey`, providerConfig.jwtConfig?.privateKey || '');
        EditData.weather.location = this.el.inputLocation.value.trim();
        SecretVault.remember('weather:location', EditData.weather.location);
        EditData.weather.realLocation = this.el.inputRealLocation.value.trim();
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
        EditData.courseFont = this.el.inputCourseFont.value || '';
        EditData.courseFontSize = Math.max(12, Math.min(32, Number(this.el.inputCourseFontSize.value) || 15));
        EditData.fontFamily = this.el.inputFontFamily.value || '';
        EditData.fontSizeScale = Math.max(80, Math.min(150, Number(this.el.inputFontSizeScale.value) || 100));
        EditData.bottomColor = this.el.inputBottomColor.value || '#64748b';
        EditData.showWeather = this.el.inputShowWeather.checked;
        EditData.showTimeline = this.el.inputShowTimeline.checked;
        EditData.showClockSeconds = this.el.inputShowClockSeconds.checked;
        EditData.showBottomText = this.el.inputShowBottom.checked;
        EditData.bottomAlign = this.getBottomAlign();
        EditData.bottomOffset = this.getBottomOffset();
        EditData.courseRotation.startDate = Schedule.getDateKey(Schedule.getMonday(this.el.cycleStartDate.value));
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

    renderDisplayProfileEditor() {
        const profiles = EditData.displayProfiles || [];
        const selectedId = this.el.displayProfileEdit.value;
        this.el.displayProfileEdit.innerHTML = '<option value="">新建方案</option>';
        this.el.displayRuleProfile.innerHTML = '';
        profiles.forEach((profile) => {
            const editOption = document.createElement('option');
            editOption.value = profile.id;
            editOption.textContent = profile.name;
            this.el.displayProfileEdit.appendChild(editOption);
            const ruleOption = editOption.cloneNode(true);
            this.el.displayRuleProfile.appendChild(ruleOption);
        });
        this.el.displayProfileEdit.value = profiles.some((profile) => profile.id === selectedId) ? selectedId : '';
        this.el.displayRuleProfile.disabled = profiles.length === 0;
        this.el.btnAddDisplayRule.disabled = profiles.length === 0;
        CustomSelect.refreshNativeSelect('select-display-profile-edit');
        CustomSelect.refreshNativeSelect('select-display-rule-profile');
        CustomSelect.sync('select-display-profile-edit');
        CustomSelect.sync('select-display-rule-profile');
        this.loadDisplayProfileForm();
        this.renderDisplayRules();
    },

    loadDisplayProfileForm() {
        const profile = EditData.displayProfiles?.find((item) => item.id === this.el.displayProfileEdit.value);
        this.el.inputDisplayProfileName.value = profile?.name || '';
        this.el.inputDisplayProfileTheme.value = profile?.theme || EditData.theme || 'default';
        CustomSelect.sync('input-display-profile-theme');
        this.el.inputProfileShowWeather.checked = profile?.showWeather ?? EditData.showWeather !== false;
        this.el.inputProfileShowTimeline.checked = profile?.showTimeline ?? EditData.showTimeline !== false;
        this.el.inputProfileShowBottom.checked = profile?.showBottomText ?? EditData.showBottomText !== false;
        this.el.inputProfileShowSeconds.checked = profile?.showClockSeconds ?? EditData.showClockSeconds !== false;
        this.el.inputProfileBottomText.value = profile?.customBottomText ?? EditData.customBottomText ?? '';
        this.el.btnDeleteDisplayProfile.hidden = !profile;
    },

    saveDisplayProfile() {
        const name = this.el.inputDisplayProfileName.value.trim();
        if (!name) {
            void Dialog.alert('请填写方案名称', '信息不完整', 'warning');
            return;
        }
        const profile = {
            id: this.el.displayProfileEdit.value || `display-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            theme: this.el.inputDisplayProfileTheme.value,
            showWeather: this.el.inputProfileShowWeather.checked,
            showTimeline: this.el.inputProfileShowTimeline.checked,
            showBottomText: this.el.inputProfileShowBottom.checked,
            showClockSeconds: this.el.inputProfileShowSeconds.checked,
            customBottomText: this.el.inputProfileBottomText.value.trim()
        };
        const index = EditData.displayProfiles.findIndex((item) => item.id === profile.id);
        if (index < 0) EditData.displayProfiles.push(profile);
        else EditData.displayProfiles[index] = profile;
        this.renderDisplayProfileEditor();
        this.el.displayProfileEdit.value = profile.id;
        this.loadDisplayProfileForm();
        CustomSelect.sync('select-display-profile-edit');
        this.markSettingsDirty();
    },

    async deleteDisplayProfile() {
        const profileId = this.el.displayProfileEdit.value;
        if (!profileId) return;
        const profile = EditData.displayProfiles.find((item) => item.id === profileId);
        const confirmed = await Dialog.confirm(`删除“${profile?.name || '未命名方案'}”并移除关联的日期规则？`, {
            title: '删除显示方案', confirmText: '删除'
        });
        if (!confirmed) return;
        EditData.displayProfiles = EditData.displayProfiles.filter((item) => item.id !== profileId);
        Object.keys(EditData.displayRules).forEach((date) => {
            if (EditData.displayRules[date] === profileId) delete EditData.displayRules[date];
        });
        this.renderDisplayProfileEditor();
        this.markSettingsDirty();
    },

    async addDisplayRule() {
        const date = this.el.inputDisplayRuleDate.value;
        const profileId = this.el.displayRuleProfile.value;
        if (!date || !profileId) {
            await Dialog.alert('请选择日期和显示方案', '信息不完整', 'warning');
            return;
        }
        const oldProfileId = EditData.displayRules[date];
        if (oldProfileId && oldProfileId !== profileId) {
            const confirmed = await Dialog.confirm(`${date} 已关联其他方案，是否替换？`, {
                title: '替换日期方案', confirmText: '替换'
            });
            if (!confirmed) return;
        }
        EditData.displayRules[date] = profileId;
        this.renderDisplayRules();
        this.markSettingsDirty();
    },

    renderDisplayRules() {
        this.el.displayRuleList.innerHTML = '';
        const profiles = new Map((EditData.displayProfiles || []).map((profile) => [profile.id, profile.name]));
        Object.entries(EditData.displayRules || {}).sort(([left], [right]) => left.localeCompare(right)).forEach(([date, profileId]) => {
            const row = document.createElement('div');
            row.className = 'display-rule-item';
            const label = document.createElement('span');
            label.textContent = `${CustomDatePicker.formatDate(date)} · ${profiles.get(profileId) || '已删除方案'}`;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-secondary';
            remove.textContent = '移除';
            remove.addEventListener('click', () => {
                delete EditData.displayRules[date];
                this.renderDisplayRules();
                this.markSettingsDirty();
            });
            row.append(label, remove);
            this.el.displayRuleList.appendChild(row);
        });
    },

    getSelectedCourseOverride() {
        return EditData.courseOverrides?.[CurrentOverrideDate] || null;
    },

    getEditCoursesForDay(day) {
        if (CurrentEditMode === 'override') {
            const override = this.getSelectedCourseOverride();
            return override?.courses || null;
        }
        if (!EditData.courses) EditData.courses = {};
        let weekCourses = EditData.courses;
        if (CurrentEditWeek > 1) {
            if (!EditData.courseRotation) EditData.courseRotation = { weeks: [] };
            if (!Array.isArray(EditData.courseRotation.weeks)) EditData.courseRotation.weeks = [];
            while (EditData.courseRotation.weeks.length < CurrentEditWeek - 1) {
                EditData.courseRotation.weeks.push({});
            }
            weekCourses = EditData.courseRotation.weeks[CurrentEditWeek - 2];
        }
        if (!Array.isArray(weekCourses[day])) weekCourses[day] = [];
        return weekCourses[day];
    },

    renderCourseCycleSelector() {
        if (!this.el.cycleWeekSelector) return;
        this.el.cycleWeekSelector.innerHTML = '';
        const weekCount = (EditData.courseRotation?.weeks?.length || 0) + 1;
        for (let week = 1; week <= weekCount; week += 1) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `day-btn ${CurrentEditWeek === week ? 'active' : ''}`;
            button.textContent = weekCount === 2 ? (week === 1 ? 'A周' : 'B周') : `第${week}周`;
            button.disabled = CurrentEditMode === 'override';
            button.addEventListener('click', () => {
                CurrentEditWeek = week;
                CurrentEditCourseIndex = null;
                this.renderCourseCycleSelector();
                this.renderCourseList();
            });
            this.el.cycleWeekSelector.appendChild(button);
        }
        this.el.cycleWeekSelector.hidden = weekCount <= 1 || CurrentEditMode === 'override';
    },

    renderCourseModeControls() {
        const isOverrideMode = CurrentEditMode === 'override';
        const override = this.getSelectedCourseOverride();
        this.el.cycleWeekSelector.hidden = isOverrideMode || (EditData.courseRotation?.weeks?.length || 0) === 0;
        this.el.cycleWeekCount.disabled = isOverrideMode;
        this.el.cycleStartDate.disabled = isOverrideMode;
        CustomSelect.sync('input-cycle-week-count');
        this.el.courseEditMode.value = CurrentEditMode;
        CustomSelect.sync('input-course-edit-mode');
        this.el.overrideDate.hidden = !isOverrideMode;
        this.el.overrideType.hidden = !isOverrideMode;
        CustomSelect.sync('input-course-override-type');
        this.el.overrideDate.closest('label').hidden = !isOverrideMode;
        this.el.overrideType.closest('label').hidden = !isOverrideMode;
        this.el.btnCreateOverride.hidden = !isOverrideMode;
        this.el.btnRemoveOverride.hidden = !isOverrideMode || !override;
        this.el.btnImportCourses.hidden = isOverrideMode;
        this.el.btnDownloadCourseTemplate.hidden = isOverrideMode;
        this.el.btnCreateOverride.disabled = Boolean(override);
        this.el.inputCopyCourseDay.closest('.course-copy-controls').hidden = isOverrideMode;
        this.el.overrideStatus.textContent = !isOverrideMode
            ? ''
            : override
                ? `已启用${{ adjustment: '临时调课', substitute: '代课', event: '临时活动' }[override.type] || '临时覆盖'}，原轮换课表保留`
                : '尚无临时覆盖，主界面仍显示轮换课表';
    },

    async updateCourseRotationWeekCount() {
        const oldWeeks = EditData.courseRotation.weeks;
        const nextCount = Math.max(1, Math.min(8, Number(this.el.cycleWeekCount.value) || 1));
        const nextWeeks = nextCount - 1;
        if (nextWeeks < oldWeeks.length) {
            const removedWeeks = oldWeeks.slice(nextWeeks);
            const hasCourses = removedWeeks.some((week) => Object.values(week || {}).some((courses) => courses?.length));
            if (hasCourses && !await Dialog.confirm('缩短周期会删除被移除轮换周的课程，是否继续？', { title: '缩短轮换周期', confirmText: '删除并缩短' })) {
                this.el.cycleWeekCount.value = String(oldWeeks.length + 1);
                CustomSelect.sync('input-cycle-week-count');
                return;
            }
            oldWeeks.length = nextWeeks;
        } else {
            while (oldWeeks.length < nextWeeks) oldWeeks.push({});
        }
        CurrentEditWeek = Math.min(CurrentEditWeek, nextCount);
        this.renderCourseCycleSelector();
        this.renderCourseList();
        this.markSettingsDirty();
    },

    updateCourseRotationStartDate() {
        const monday = Schedule.getDateKey(Schedule.getMonday(this.el.cycleStartDate.value));
        this.el.cycleStartDate.value = monday;
        EditData.courseRotation.startDate = monday;
        this.markSettingsDirty();
    },

    changeCourseEditMode() {
        CurrentEditMode = this.el.courseEditMode.value;
        if (CurrentEditMode === 'override') {
            if (!CurrentOverrideDate) CurrentOverrideDate = Schedule.getDateKey(new Date());
            this.el.overrideDate.value = CurrentOverrideDate;
            const resolved = Schedule.resolveCourses(CurrentOverrideDate, EditData);
            CurrentEditDay = resolved.day;
            CurrentEditWeek = resolved.week;
            if (resolved.override) this.el.overrideType.value = resolved.override.type || 'adjustment';
        }
        CurrentEditCourseIndex = null;
        this.renderDaySelector();
        this.renderCourseCycleSelector();
        this.renderCourseList();
    },

    changeCourseOverrideDate() {
        CurrentOverrideDate = this.el.overrideDate.value || Schedule.getDateKey(new Date());
        this.el.overrideDate.value = CurrentOverrideDate;
        const resolved = Schedule.resolveCourses(CurrentOverrideDate, EditData);
        CurrentEditDay = resolved.day;
        CurrentEditWeek = resolved.week;
        if (resolved.override) this.el.overrideType.value = resolved.override.type || 'adjustment';
        CustomSelect.sync('input-course-override-type');
        CurrentEditCourseIndex = null;
        this.renderDaySelector();
        this.renderCourseList();
    },

    changeCourseOverrideType() {
        const override = this.getSelectedCourseOverride();
        if (!override) return;
        override.type = this.el.overrideType.value;
        this.renderCourseModeControls();
        this.markSettingsDirty();
    },

    createCourseOverride() {
        if (this.getSelectedCourseOverride()) return;
        const resolved = Schedule.resolveCourses(CurrentOverrideDate, EditData);
        EditData.courseOverrides[CurrentOverrideDate] = {
            type: this.el.overrideType.value,
            courses: JSON.parse(JSON.stringify(resolved.courses))
        };
        CurrentEditDay = resolved.day;
        CurrentEditWeek = resolved.week;
        CurrentEditCourseIndex = null;
        this.renderCourseModeControls();
        this.renderDaySelector();
        this.renderCourseList();
        this.markSettingsDirty();
    },

    async removeCourseOverride() {
        if (!this.getSelectedCourseOverride()) return;
        const confirmed = await Dialog.confirm(`删除 ${CustomDatePicker.formatDate(CurrentOverrideDate)} 的临时覆盖并恢复轮换课表？`, {
            title: '恢复原课表', confirmText: '恢复'
        });
        if (!confirmed) return;
        delete EditData.courseOverrides[CurrentOverrideDate];
        this.renderCourseModeControls();
        this.renderCourseList();
        this.markSettingsDirty();
    },

    renderDaySelector() {
        this.el.daySelector.innerHTML = '';
        this.el.daySelector.hidden = CurrentEditMode === 'override';
        this.el.inputCopyCourseDay.innerHTML = '<option value="">复制到星期…</option>';
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
            if (dayKey !== CurrentEditDay) {
                const option = document.createElement('option');
                option.value = dayKey;
                option.textContent = DAY_MAP[dayKey];
                this.el.inputCopyCourseDay.appendChild(option);
            }
        });
        CustomSelect.refreshNativeSelect('input-copy-course-day');
        this.el.btnCopyCourses.disabled = true;
    },

    async copyCoursesToDay() {
        if (CurrentEditMode !== 'regular') return;
        const targetDay = this.el.inputCopyCourseDay.value;
        if (!targetDay || targetDay === CurrentEditDay || !DAY_MAP[targetDay]) return;
        const courses = this.getEditCoursesForDay(CurrentEditDay) || [];
        const confirmed = await Dialog.confirm(
            `将${DAY_MAP[CurrentEditDay]}的 ${courses.length} 节课程复制到${DAY_MAP[targetDay]}？目标星期的课程将被替换。`,
            { title: '复制课表', confirmText: '复制并覆盖' }
        );
        if (!confirmed) return;
        const targetCourses = CurrentEditWeek === 1
            ? EditData.courses
            : EditData.courseRotation.weeks[CurrentEditWeek - 2];
        targetCourses[targetDay] = JSON.parse(JSON.stringify(courses));
        this.el.inputCopyCourseDay.value = '';
        this.el.btnCopyCourses.disabled = true;
        this.markSettingsDirty();
    },

    createCourseEditForm(course, courseIndex) {
        const form = document.createElement('div');
        form.className = 'course-editor-form';
        const subjectMenu = document.createElement('details');
        subjectMenu.className = 'course-subject-menu';
        subjectMenu.id = `course-subject-menu-${courseIndex}`;
        const menuTrigger = document.createElement('summary');
        menuTrigger.className = 'course-subject-menu-trigger';
        menuTrigger.textContent = course.course || '选择课程名称';
        menuTrigger.setAttribute('aria-label', `选择课程名称，当前为${course.course || '未设置'}`);

        const subjectOptions = document.createElement('div');
        subjectOptions.className = 'course-subject-options';
        const subjects = Array.isArray(EditData.subjects) && EditData.subjects.length
            ? [...new Set(EditData.subjects)]
            : ['语文', '数学', '英语'];
        if (course.course && !subjects.includes(course.course)) subjects.push(course.course);
        subjects.forEach((subject) => {
            const subjectButton = document.createElement('button');
            subjectButton.type = 'button';
            subjectButton.className = 'course-subject-option';
            subjectButton.textContent = subject;
            subjectButton.classList.toggle('active', course.course === subject);
            subjectButton.addEventListener('click', (event) => {
                event.stopPropagation();
                course.course = subject;
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
                if (!customName) return;
                course.course = customName;
                if (!Array.isArray(EditData.subjects)) EditData.subjects = [];
                if (!EditData.subjects.includes(customName)) EditData.subjects.push(customName);
                this.renderSubjectList();
                this.renderCourseList();
                this.markSettingsDirty();
            });
            subjectOptions.append(customInput, confirmButton);
            customInput.focus();
            customInput.setSelectionRange(customInput.value.length, customInput.value.length);
        });
        subjectOptions.appendChild(customButton);
        subjectMenu.append(menuTrigger, subjectOptions);

        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className = 'btn btn-secondary course-editor-done';
        doneButton.textContent = '完成';
        doneButton.addEventListener('click', (event) => {
            event.stopPropagation();
            CurrentEditCourseIndex = null;
            this.renderCourseList();
        });

        const editorHint = document.createElement('p');
        editorHint.className = 'course-editor-hint';
        editorHint.textContent = '选择课程名称，或打开菜单添加自定义名称；拖动时间滑块调整时间，最后保存设置。';
        form.append(subjectMenu, editorHint, doneButton);
        return form;
    },

    createCourseActionButtons(course, index, courses) {
        const duplicate = document.createElement('button');
        duplicate.type = 'button';
        duplicate.className = 'btn-course-action btn-course-duplicate';
        duplicate.textContent = '复制';
        duplicate.title = '复制课程';
        duplicate.setAttribute('aria-label', `复制${course.course || '未命名课程'}`);
        duplicate.addEventListener('click', (event) => {
            event.stopPropagation();
            courses.splice(index + 1, 0, JSON.parse(JSON.stringify(course)));
            CurrentEditCourseIndex = index + 1;
            this.renderCourseList();
            this.markSettingsDirty();
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn-delete';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `删除${course.course || '未命名课程'}`);
        remove.addEventListener('click', (event) => {
            event.stopPropagation();
            courses.splice(index, 1);
            CurrentEditCourseIndex = null;
            this.renderCourseList();
            this.markSettingsDirty();
        });
        return [duplicate, remove];
    },

    renderCourseList() {
        this.el.courseList.innerHTML = '';
        const courses = this.getEditCoursesForDay(CurrentEditDay);
        this.renderCourseModeControls();
        this.el.btnAddCourse.disabled = !courses;
        const weekLabel = CurrentEditMode !== 'regular' || !(EditData.courseRotation?.weeks?.length || 0)
            ? ''
            : `${EditData.courseRotation.weeks.length + 1 === 2 ? (CurrentEditWeek === 1 ? 'A周' : 'B周') : `第${CurrentEditWeek}周`} · `;
        this.el.courseDaySummary.textContent = `${weekLabel}${DAY_MAP[CurrentEditDay]} · ${courses?.length || 0} 节`;
        if (courses && CurrentEditCourseIndex !== null && CurrentEditCourseIndex >= courses.length) CurrentEditCourseIndex = null;
        if (!courses?.length) {
            const emptyState = document.createElement('div');
            emptyState.className = 'course-empty-state';
            emptyState.innerHTML = courses
                ? '<b>本日暂无课程</b><span>点击“添加课程”开始安排今天的课表。</span>'
                : '<b>本日尚无临时覆盖</b><span>新建后可编辑当天安排，原轮换课表会保留。</span>';
            this.el.courseList.appendChild(emptyState);
            return;
        }

        courses.forEach((course, index) => {
            const row = document.createElement('div');
            row.className = 'course-item';
            row.tabIndex = -1;
            row.title = course.note || '';
            row.classList.toggle('selected', CurrentEditCourseIndex === index);
            row.dataset.courseIndex = String(index);
            row.addEventListener('click', (event) => {
                if (event.target.closest('button, input, textarea, select, details, .custom-select, .custom-date-picker, .course-editor-form, .course-time-panel')) return;
                CurrentEditCourseIndex = CurrentEditCourseIndex === index ? null : index;
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
                    courses[index].start = startTime;
                    courses[index].end = endTime;
                    if (activeThumb) activeThumb.focus({ preventScroll: true });
                    this.markSettingsDirty();
                };

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
            const [btnDuplicate, btnDelete] = this.createCourseActionButtons(course, index, courses);

            const timePanel = document.createElement('div');
            timePanel.className = 'course-time-panel';
            if (timeRangeEditor) timePanel.appendChild(timeRangeEditor);

            if (CurrentEditCourseIndex === index) {
                row.append(this.createCourseEditForm(course, index), timePanel, btnDuplicate, btnDelete);
                this.el.courseList.appendChild(row);
                return;
            }

            let compactTime = null;
            let compactName = null;
            if (CurrentEditCourseIndex !== index) {
                compactName = document.createElement('span');
                compactName.className = 'course-name-summary';
                compactName.textContent = course.course || '未设置课程';
                compactName.tabIndex = 0;
                compactName.setAttribute('role', 'button');
                compactName.title = '点击编辑课程';
                compactName.addEventListener('click', (event) => {
                    event.stopPropagation();
                    CurrentEditCourseIndex = index;
                    this.renderCourseList();
                });
                compactName.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    CurrentEditCourseIndex = index;
                    this.renderCourseList();
                });
                compactTime = document.createElement('span');
                compactTime.className = 'course-time-summary';
                compactTime.textContent = `${course.start || '--:--'}–${course.end || '--:--'}`;
                compactTime.tabIndex = 0;
                compactTime.setAttribute('role', 'button');
                compactTime.title = '点击编辑课程';
                compactTime.addEventListener('click', (event) => {
                    event.stopPropagation();
                    CurrentEditCourseIndex = index;
                    this.renderCourseList();
                });
                compactTime.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    CurrentEditCourseIndex = index;
                    this.renderCourseList();
                });
                subjectPanel.append(compactName, compactTime);
            }

            row.appendChild(subjectPanel);
            row.append(btnDuplicate, btnDelete);
            this.el.courseList.appendChild(row);
        });
    },

    renderSubjectList() {
        if (!Array.isArray(EditData.subjects)) {
            EditData.subjects = ['语文', '数学', '英语'];
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
                const courses = this.getEditCoursesForDay(CurrentEditDay);
                if (CurrentEditCourseIndex !== null && courses?.[CurrentEditCourseIndex]) {
                    courses[CurrentEditCourseIndex].course = subject;
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
        const courses = this.getEditCoursesForDay(CurrentEditDay);
        if (!courses) return;
        courses.push({ start: '08:00', end: '08:45', course: '' });
        CurrentEditCourseIndex = courses.length - 1;
        setTimeout(() => { this.el.courseList.scrollTop = this.el.courseList.scrollHeight; }, 10);
        this.renderCourseList();
        this.markSettingsDirty();
    },

    timelineSignature: null,
    renderTimeline(courses, override = null) {
        const now = new Date();
        const overrideLabels = { adjustment: '临时调课', substitute: '代课', event: '临时活动' };
        const overrideLabel = overrideLabels[override?.type] || '';
        const courseSignature = JSON.stringify({ courses: courses || [], override: override?.type || '' });
        const courseChanged = this.timelineSignature !== courseSignature;
        if (this.el.timeDate) this.el.timeDate.dataset.courseMode = overrideLabel;
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
            if (index === 0 && overrideLabel) displayName = `${overrideLabel} · ${displayName}`;
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
                const dot = document.createElement('div');
                dot.className = 'dot';
                const time = document.createElement('div');
                time.className = 'time';
                time.textContent = displayTime;
                const name = document.createElement('div');
                name.className = 'name';
                name.textContent = displayName;
                name.title = item.note ? `${displayName}\n${item.note}` : displayName;
                el.append(dot, time, name);
                this.el.timeline.appendChild(el);
            } else {
                el.querySelector('.time').textContent = displayTime;
                const nameEl = el.querySelector('.name');
                nameEl.textContent = displayName;
                nameEl.title = item.note ? `${displayName}\n${item.note}` : displayName;
                if (previousStatus !== statusClass && ['now', 'ending', 'done'].includes(statusClass)) {
                    el.classList.remove('course-state-entered');
                    void el.offsetWidth;
                    el.classList.add('course-state-entered');
                }
            }
        });
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
        this.applyWeatherExtraWidth(0);
        this.scheduleFitWindow();
        return changed;
    }
};

const App = {
    trayInitialized: false,
    shuttingDown: false,
    shutdownPromise: null,
    courseRefreshTimer: null,
    weatherRefreshTimer: null,
    weatherRefreshInFlight: null,
    nextWeatherRefreshAt: null,
    async init() {
        await Logger.init();
        await Store.init();
        UI.activeDisplayProfileKey = null;
        UI.applyFontStyles();
        UI.applyActiveDisplayProfile(true);
        if (!this.trayInitialized) {
            await UI.initTray();
            this.trayInitialized = UI.trayBound;
        }
        this.refreshCourses();
        UI.renderCustomBottomInfo();
        this.startRefreshTimers();
        await this.refreshWeather();
        void Logger.info('应用初始化完成', { module: 'lifecycle', action: 'init' });
        Updater.scheduleStartupCheck();
        if (AppData.onboardingCompleted !== true) {
            await Onboarding.start();
        }
    },
    refreshCourses() {
        const startedAt = performance.now();
        try {
            UI.applyActiveDisplayProfile();
            const schedule = Schedule.resolveCourses(new Date(), AppData);
            const courses = schedule.courses;
            UI.renderTimeline(courses, schedule.override);
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
    async shutdown(source = 'unknown') {
        if (this.shutdownPromise) {
            void Logger.info('忽略重复退出请求', { module: 'lifecycle', action: 'shutdown-duplicate', context: { source } });
            return this.shutdownPromise;
        }
        this.shuttingDown = true;
        this.shutdownPromise = (async () => {
            void Logger.info('开始退出应用', { module: 'lifecycle', action: 'shutdown-start', context: { source } });
            UI.stopClock();
            clearInterval(this.courseRefreshTimer);
            clearInterval(this.weatherRefreshTimer);
            clearTimeout(UI.trayUpdateTimer);
            clearTimeout(UI.fitWidthTimer);
            clearTimeout(UI.weatherRemeasureTimer);
            UI.windowTransitionToken += 1;
            try {
                await UI.trayUpdatePromise;
            } catch (error) {
                await Logger.warn('退出时托盘菜单更新未完成', { module: 'tray', action: 'shutdown-wait' }, error);
            }
            await Logger.info('应用退出', { module: 'lifecycle', action: 'shutdown', context: { source } });
            await Neutralino.app.exit();
        })();
        try {
            await this.shutdownPromise;
        } catch (error) {
            this.shuttingDown = false;
            this.shutdownPromise = null;
            await Logger.error('应用退出失败', { module: 'lifecycle', action: 'shutdown', context: { source } }, error);
            throw error;
        }
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