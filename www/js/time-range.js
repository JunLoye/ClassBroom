const TimeRange = (() => {
    /** 根据点击位置选择要拖动的端点；区间内优先近端，区间外优先远端以避免跨越。 */
    function pickThumb({ pointerMinutes, startMinutes, endMinutes }) {
        const pointer = Number(pointerMinutes);
        const start = Number(startMinutes);
        const end = Number(endMinutes);
        if (!Number.isFinite(pointer) || !Number.isFinite(start) || !Number.isFinite(end)) return 'start';
        // 两端重合时无法用距离判断，用点击方向区分：偏右拖结束，偏左或正中拖开始
        if (start === end) return pointer > start ? 'end' : 'start';
        const toStart = Math.abs(pointer - start);
        const toEnd = Math.abs(pointer - end);
        return toStart <= toEnd ? 'start' : 'end';
    }

    /** 保证开始早于结束至少一步，并对齐到步进网格。 */
    function clampRange({ startMinutes, endMinutes, step = 5, min = 360, max = 1410 }) {
        let start = Number.isFinite(Number(startMinutes)) ? Number(startMinutes) : min;
        let end = Number.isFinite(Number(endMinutes)) ? Number(endMinutes) : start + step;
        start = Math.max(min, Math.min(start, max - step));
        end = Math.max(start + step, Math.min(end, max));
        return { startMinutes: start, endMinutes: end };
    }

    /** 计算时长文案，如 “共计 40 分钟”。 */
    function formatDuration(startMinutes, endMinutes) {
        const diff = Math.max(0, Number(endMinutes) - Number(startMinutes));
        if (!Number.isFinite(diff)) return '--';
        return `${diff} 分钟`;
    }

    return { pickThumb, clampRange, formatDuration };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TimeRange;
if (typeof globalThis !== 'undefined') globalThis.TimeRange = TimeRange;
