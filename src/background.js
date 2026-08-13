"use strict";
const HOST = 'ru.fmba.rubezh_print_bridge';
async function ensureContent(tabId) { try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
}
catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content.js'] });
} }
chrome.runtime.onInstalled.addListener(({ reason }) => { if (reason === 'install')
    chrome.runtime.openOptionsPage(); });
chrome.runtime.onMessage.addListener((m, _s, reply) => { (async () => { if (m.type === 'OPEN_PRINT_DIALOG') {
    await chrome.storage.session.set({ pendingEmployee: m.employee });
    await chrome.windows.create({ url: chrome.runtime.getURL('src/print-dialog.html'), type: 'popup', width: 760, height: 760 });
    return { ok: true };
} if (m.type === 'NATIVE') {
    return await chrome.runtime.sendNativeMessage(HOST, m.payload);
} if (m.type === 'REGISTER_ORIGIN') {
    await chrome.scripting.unregisterContentScripts().catch(() => { });
    await chrome.scripting.registerContentScripts([{ id: 'rubezh-adapter', matches: [`${new URL(m.origin).origin}/*`], js: ['src/content.js'], runAt: 'document_idle' }]);
    return { ok: true };
} if (m.type === 'READ_ACTIVE') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id)
        throw new Error('Нет активной вкладки');
    await ensureContent(tab.id);
    return await chrome.tabs.sendMessage(tab.id, { type: 'GET_EMPLOYEE' });
} return { ok: false }; })().then(reply).catch(e => reply({ ok: false, error: String(e) })); return true; });
