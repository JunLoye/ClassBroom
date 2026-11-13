const test = require('node:test');
const assert = require('node:assert/strict');
const CourseExport = require('../www/js/course-export.js');

const DAY_MAP = { mon: '周一', tue: '周二' };

test('should export courses from each rotation week in the import-compatible format', () => {
    const rows = CourseExport.buildRotationRows({
        courses: { mon: [{ start: '08:00', end: '08:45', course: '语文', note: '早读' }] },
        courseRotation: { weeks: [{ tue: [{ start: '09:00', end: '09:45', course: '数学' }] }] }
    }, DAY_MAP);

    assert.deepEqual(rows, [
        ['周次', '星期', '开始时间', '结束时间', '课程', '备注'],
        [1, '周一', '08:00', '08:45', '语文', '早读'],
        [2, '周二', '09:00', '09:45', '数学', '']
    ]);
});

test('should export dated overrides in date order with translated event types', () => {
    const rows = CourseExport.buildOverrideRows({
        courseOverrides: {
            '2026-11-10': { type: 'substitute', courses: [{ course: '英语' }] },
            '2026-11-09': { type: 'adjustment', courses: [{ start: '10:00', end: '10:45', course: '物理' }] }
        }
    });

    assert.deepEqual(rows, [
        ['日期', '事件类型', '开始时间', '结束时间', '课程', '备注'],
        ['2026-11-09', '临时调课', '10:00', '10:45', '物理', ''],
        ['2026-11-10', '代课', '', '', '英语', '']
    ]);
});

test('should preserve overrides with no courses as empty rows', () => {
    const rows = CourseExport.buildOverrideRows({
        courseOverrides: {
            '2026-11-13': { type: 'event', courses: [] }
        }
    });

    assert.deepEqual(rows, [
        ['日期', '事件类型', '开始时间', '结束时间', '课程', '备注'],
        ['2026-11-13', '临时活动', '', '', '', '']
    ]);
});