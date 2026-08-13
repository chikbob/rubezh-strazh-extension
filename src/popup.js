"use strict";
const statusElement = document.querySelector('#status'), go = document.querySelector('#prepare');
go.onclick = async () => { statusElement.textContent = 'Чтение карточки…'; const r = await chrome.runtime.sendMessage({ type: 'READ_ACTIVE' }); if (!r?.ok) {
    statusElement.textContent = r?.error || 'Карточка сотрудника не найдена';
    return;
} await chrome.runtime.sendMessage({ type: 'OPEN_PRINT_DIALOG', employee: r.employee }); window.close(); };
document.querySelector('#settings').onclick = () => chrome.runtime.openOptionsPage();
