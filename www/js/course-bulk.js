const CourseBulk = (() => {
    function removeAt(courses, indexes) {
        if (!Array.isArray(courses)) return [];
        const drop = new Set((indexes || []).filter((index) => Number.isInteger(index) && index >= 0));
        return courses.filter((_, index) => !drop.has(index));
    }

    function renameMany(courses, indexes, name) {
        if (!Array.isArray(courses)) return [];
        const target = String(name || '').trim();
        if (!target) return courses.slice();
        const hit = new Set((indexes || []).filter((index) => Number.isInteger(index) && index >= 0));
        return courses.map((course, index) => (hit.has(index) ? { ...course, course: target } : { ...course }));
    }

    function toggleAll(selected, total) {
        const count = Math.max(0, Number(total) || 0);
        const current = new Set(Array.from(selected || []));
        if (current.size >= count && count > 0) return new Set();
        return new Set(Array.from({ length: count }, (_, index) => index));
    }

    function toggle(selected, index) {
        const next = new Set(Array.from(selected || []));
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
    }

    function prune(selected, total) {
        const count = Math.max(0, Number(total) || 0);
        return new Set(Array.from(selected || []).filter((index) => index >= 0 && index < count));
    }

    return { removeAt, renameMany, toggleAll, toggle, prune };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CourseBulk;
if (typeof globalThis !== 'undefined') globalThis.CourseBulk = CourseBulk;
