chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type !== 'PRINT_PASS')
        return false;
    (async () => { const payload = { employee: message.employee, type: message.passType }; await chrome.storage.session.set({ printPayload: payload }); await chrome.windows.create({ url: chrome.runtime.getURL('src/print.html'), type: 'popup', width: 900, height: 760 }); return { ok: true }; })().then(reply).catch(error => reply({ ok: false, error: String(error) }));
    return true;
});
export {};
