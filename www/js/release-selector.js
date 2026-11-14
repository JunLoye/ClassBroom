const ReleaseSelector = (() => {
    function pickLatestRelease(releases) {
        if (!Array.isArray(releases) || !releases.length) return null;
        const publishable = releases.filter((item) => item && !item.draft && (item.tag_name || item.name));
        if (!publishable.length) return null;
        return publishable.find((item) => item.prerelease !== true) || publishable[0];
    }

    return { pickLatestRelease };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ReleaseSelector;
if (typeof globalThis !== 'undefined') globalThis.ReleaseSelector = ReleaseSelector;
