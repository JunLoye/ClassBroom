const CourseImport = (() => {
    const HEADER_ALIASES = {
        week: ['周次', '轮换周', '周期周'],
        day: ['星期', '星期几', '周几'],
        start: ['开始时间', '开始', '上课时间'],
        end: ['结束时间', '结束', '下课时间'],
        course: ['课程', '课程名称', '科目'],
        note: ['备注', '说明']
    };
    const DAY_ALIASES = {
        '1': 'mon', '2': 'tue', '3': 'wed', '4': 'thu', '5': 'fri', '6': 'sat', '7': 'sun',
        '一': 'mon', '二': 'tue', '三': 'wed', '四': 'thu', '五': 'fri', '六': 'sat', '日': 'sun', '天': 'sun'
    };

    function normalizeDay(value) {
        const day = String(value ?? '').trim().toLowerCase().replace(/^(星期|周)/, '');
        return DAY_ALIASES[day] || ({ mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' })[day] || '';
    }

    function normalizeTime(value) {
        if (typeof value === 'number' && value >= 0 && value < 1) {
            value = Math.round(value * 1440);
            return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
        }
        const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(String(value ?? '').trim());
        if (!match || Number(match[1]) > 23) return '';
        return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
    }

    function parseRows(rows) {
        const data = Array.isArray(rows) ? rows : [];
        const headerIndex = data.slice(0, 10).findIndex((row) => {
            const headers = (row || []).map((cell) => String(cell ?? '').trim().replace(/\s/g, ''));
            return ['day', 'start', 'end', 'course'].every((key) => headers.some((header) => HEADER_ALIASES[key].includes(header)));
        });
        if (headerIndex < 0) throw new Error('未找到表头。请包含“星期、开始时间、结束时间、课程”列。');

        const headers = (data[headerIndex] || []).map((cell) => String(cell ?? '').trim().replace(/\s/g, ''));
        const indexes = {};
        Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
            indexes[key] = headers.findIndex((header) => aliases.includes(header));
        });
        const entries = [];
        const errors = [];
        data.slice(headerIndex + 1).forEach((row, offset) => {
            if (!Array.isArray(row) || row.every((cell) => String(cell ?? '').trim() === '')) return;
            const rowNumber = headerIndex + offset + 2;
            const getValue = (key) => indexes[key] < 0 ? '' : row[indexes[key]];
            const day = normalizeDay(getValue('day'));
            const start = normalizeTime(getValue('start'));
            const end = normalizeTime(getValue('end'));
            const course = String(getValue('course') ?? '').trim();
            const weekText = String(getValue('week') ?? '').trim();
            const weekMatch = /^(?:第\s*)?(\d+)\s*(?:周)?$/.exec(weekText);
            const week = weekText ? Number(weekMatch?.[1]) : 1;
            const startMinutes = start ? Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) : -1;
            const endMinutes = end ? Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) : -1;
            const problems = [];
            if (!day) problems.push('星期无效');
            if (!start || !end || endMinutes <= startMinutes) problems.push('课程时间无效');
            if (!course) problems.push('课程名称为空');
            if (!Number.isInteger(week) || week < 1 || week > 8) problems.push('轮换周须为 1 到 8');
            if (problems.length) {
                errors.push(`第 ${rowNumber} 行：${problems.join('、')}`);
                return;
            }
            entries.push({
                week,
                day,
                start,
                end,
                course,
                note: String(getValue('note') ?? '').trim()
            });
        });
        if (!entries.length && !errors.length) errors.push('没有可导入的课程行');
        return { entries, errors };
    }

    return { normalizeDay, normalizeTime, parseRows };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CourseImport;
if (typeof globalThis !== 'undefined') globalThis.CourseImport = CourseImport;