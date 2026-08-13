import { DEFAULT_SETTINGS } from './types.js';
import { CARD_DPI, renderCard } from './renderer.js';
let employee;
let image = '';
const q = (s) => document.querySelector(s);
async function refresh() { const type = q('#type').value; const s = { ...DEFAULT_SETTINGS, ...await chrome.storage.local.get(DEFAULT_SETTINGS) }; const r = await renderCard(type, employee, q('#position').value, s.autoNormalize); image = r.dataUrl; q('#preview').src = image; q('#warnings').textContent = r.warnings.join(' '); q('#position').value = r.position.text; q('#print').disabled = !employee.fullName || !r.position.fits; }
async function init() {
    const got = await chrome.storage.session.get('pendingEmployee');
    employee = got.pendingEmployee;
    if (!employee) {
        q('#warnings').textContent = 'Данные карточки не найдены.';
        return;
    }
    q('#name').textContent = employee.fullName;
    q('#department').textContent = employee.department || '—';
    q('#position').value = employee.position || '';
    q('#type').onchange = () => void refresh();
    q('#position').oninput = () => void refresh();
    q('#print').onclick = async () => {
        const settings = { ...DEFAULT_SETTINGS, ...await chrome.storage.local.get(DEFAULT_SETTINGS) };
        q('#print-status').textContent = 'Отправка…';
        const job = { type: q('#type').value, employee: { ...employee, photo: undefined }, displayValues: { fullName: employee.fullName, position: q('#position').value, department: employee.department }, printer: settings.printer, copies: 1, imageDataUrl: image, dpi: CARD_DPI };
        const result = await chrome.runtime.sendMessage({ type: 'NATIVE', payload: { command: 'print', job } });
        q('#print-status').textContent = result?.ok ? 'Задание отправлено на принтер' : result?.message || 'Принтер пропусков не отвечает. Проверьте питание и подключение.';
    };
    await refresh();
}
void init();
window.addEventListener('beforeunload', () => void chrome.storage.session.remove('pendingEmployee'));
