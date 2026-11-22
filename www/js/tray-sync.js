/** 托盘状态文件与指令文件的序列化/解析，与 C++ 托盘宿主约定一致。 */
const TRAY_COMMANDS = ['show', 'hide', 'settings', 'refresh', 'check-update', 'autostart', 'exit'];

function buildTrayState(visible, autoStart) {
    return `${visible === true ? 'visible' : 'hidden'}\n${autoStart === true ? 'autostart=1' : 'autostart=0'}\n`;
}

function parseTrayCommands(text, handledCount = 0) {
    const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length <= handledCount) return { handled: Math.max(handledCount, lines.length), pending: [] };
    return { handled: lines.length, pending: lines.slice(handledCount) };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TRAY_COMMANDS, buildTrayState, parseTrayCommands };
}
