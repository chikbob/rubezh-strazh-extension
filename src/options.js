import { DEFAULT_SETTINGS } from './types.js';
const form = document.querySelector('#settings-form'), status = document.querySelector('#save-status');
async function load() { const settings = { ...DEFAULT_SETTINGS, ...await chrome.storage.local.get(DEFAULT_SETTINGS) }; form.elements.namedItem('allowedOrigin').value = settings.allowedOrigin; form.elements.namedItem('debug').checked = settings.debug; }
form.onsubmit = async (event) => { event.preventDefault(); const allowedOrigin = String(new FormData(form).get('allowedOrigin') || '').replace(/\/$/, ''); try {
    new URL(allowedOrigin);
    await chrome.storage.local.set({ allowedOrigin, debug: form.elements.namedItem('debug').checked });
    status.textContent = 'Настройки сохранены. Обновите страницу RUBEZH.';
}
catch {
    status.textContent = 'Укажите корректный адрес RUBEZH.';
} };
void load();
