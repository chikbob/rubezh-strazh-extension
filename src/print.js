import { renderCard } from './renderer.js';
const BRIDGE = 'http://127.0.0.1:18451';
async function directPrint(imageDataUrl) { const response = await fetch(`${BRIDGE}/print`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageDataUrl }) }); const result = await response.json(); if (!response.ok || !result.ok)
    throw new Error(result.error || `Ошибка моста печати (${response.status})`); return result; }
async function main() { const stored = await chrome.storage.session.get('printPayload'); const payload = stored.printPayload; const status = document.querySelector('#status'); if (!payload) {
    status.textContent = 'Данные пропуска не найдены.';
    return;
} try {
    status.textContent = 'Формирование пропуска…';
    const dataUrl = await renderCard(payload.type, payload.employee);
    const image = document.querySelector('#card');
    image.src = dataUrl;
    await image.decode();
    document.title = `Пропуск — ${payload.employee.fullName}`;
    status.textContent = 'Отправка на IDP SMART…';
    const result = await directPrint(dataUrl);
    status.textContent = `Задание отправлено на ${result.printer || 'IDP SMART'}.`;
    await chrome.storage.session.remove('printPayload');
    window.setTimeout(() => window.close(), 900);
}
catch (error) {
    const message = String(error);
    status.textContent = message.includes('Failed to fetch') ? `Print Bridge не отвечает. Повторно запустите bridge\\install.cmd. (${message})` : `Ошибка IDP SMART: ${message}`;
} }
void main();
