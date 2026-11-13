const CourseExport = {
    buildRotationRows(config, dayMap) {
        const rows = [['周次', '星期', '开始时间', '结束时间', '课程', '备注']];
        const weeks = [config?.courses || {}, ...(config?.courseRotation?.weeks || [])];
        weeks.forEach((weekCourses, weekIndex) => {
            Object.entries(dayMap).forEach(([day, dayLabel]) => {
                const courses = Array.isArray(weekCourses?.[day]) ? weekCourses[day] : [];
                courses.forEach((course) => {
                    rows.push([
                        weekIndex + 1,
                        dayLabel,
                        course.start || '',
                        course.end || '',
                        course.course || '',
                        course.note || ''
                    ]);
                });
            });
        });
        return rows;
    },

    buildOverrideRows(config) {
        const rows = [['日期', '事件类型', '开始时间', '结束时间', '课程', '备注']];
        const typeLabels = { adjustment: '临时调课', substitute: '代课', event: '临时活动' };
        Object.entries(config?.courseOverrides || {})
            .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
            .forEach(([date, override]) => {
                if (!Array.isArray(override?.courses)) return;
                const eventType = typeLabels[override.type] || override.type || '';
                if (!override.courses.length) {
                    rows.push([date, eventType, '', '', '', '']);
                    return;
                }
                override.courses.forEach((course) => {
                    rows.push([
                        date,
                        eventType,
                        course.start || '',
                        course.end || '',
                        course.course || '',
                        course.note || ''
                    ]);
                });
            });
        return rows;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = CourseExport;