const CourseOverride = (() => {
    function ensure(courseOverrides, date, resolved) {
        if (courseOverrides[date]) return courseOverrides[date];
        const override = {
            courses: JSON.parse(JSON.stringify(resolved?.courses || []))
        };
        courseOverrides[date] = override;
        return override;
    }

    function remove(courseOverrides, date) {
        if (!courseOverrides[date]) return false;
        delete courseOverrides[date];
        return true;
    }

    return { ensure, remove };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CourseOverride;
if (typeof globalThis !== 'undefined') globalThis.CourseOverride = CourseOverride;
