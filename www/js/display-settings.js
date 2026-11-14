const DisplaySettings = (() => {
    const MIN_UI_SCALE = 80;
    const MAX_UI_SCALE = 150;

    function normalizeWindowWidth(value, defaultWidth = 1400, maxWidth = 1920) {
        const width = Number(value);
        if (!Number.isFinite(width)) return defaultWidth;
        return Math.max(defaultWidth, Math.min(maxWidth, Math.round(width)));
    }

    function normalizeUiScale(value) {
        const scale = Number(value);
        if (!Number.isFinite(scale)) return 100;
        return Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, Math.round(scale)));
    }

    return { normalizeWindowWidth, normalizeUiScale };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DisplaySettings;
if (typeof globalThis !== 'undefined') globalThis.DisplaySettings = DisplaySettings;