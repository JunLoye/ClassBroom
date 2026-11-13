const Schedule = (() => {
    const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const DAY_MS = 24 * 60 * 60 * 1000;

    function parseLocalDate(value) {
        if (value instanceof Date) {
            return new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
        if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    function getDateKey(value) {
        const date = parseLocalDate(value);
        if (!date) return '';
        const pad = (part) => String(part).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function formatDisplayDate(value) {
        const date = parseLocalDate(value);
        if (!date) return '';
        const pad = (part) => String(part).padStart(2, '0');
        return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
    }

    function getMonday(value) {
        const date = parseLocalDate(value) || parseLocalDate(new Date());
        date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        return date;
    }

    function getCycleWeekIndex(value, startDate, weekCount) {
        const count = Math.max(1, Math.floor(Number(weekCount) || 1));
        const date = getMonday(value);
        const anchor = getMonday(startDate || date);
        const dateOrdinal = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
        const anchorOrdinal = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
        const elapsedWeeks = Math.floor((dateOrdinal - anchorOrdinal) / (DAY_MS * 7));
        return ((elapsedWeeks % count) + count) % count;
    }

    function resolveCourses(value, config = {}) {
        const date = parseLocalDate(value) || parseLocalDate(new Date());
        const day = DAY_KEYS[date.getDay()];
        const dateKey = getDateKey(date);
        const override = config.courseOverrides?.[dateKey];
        const extraWeeks = Array.isArray(config.courseRotation?.weeks) ? config.courseRotation.weeks : [];
        const weekIndex = getCycleWeekIndex(date, config.courseRotation?.startDate, extraWeeks.length + 1);
        const weekCourses = weekIndex === 0 ? (config.courses || {}) : (extraWeeks[weekIndex - 1] || {});
        const hasOverride = Boolean(override && Array.isArray(override.courses));

        return {
            courses: hasOverride ? override.courses : (weekCourses[day] || []),
            dateKey,
            day,
            week: weekIndex + 1,
            override: hasOverride ? override : null
        };
    }

    return { DAY_KEYS, parseLocalDate, getDateKey, formatDisplayDate, getMonday, getCycleWeekIndex, resolveCourses };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schedule;
if (typeof globalThis !== 'undefined') globalThis.Schedule = Schedule;