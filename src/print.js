import { renderCard, renderCardPanels } from './renderer.js';
const BRIDGE = 'http://127.0.0.1:18451';
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp']);
async function directPrint(colorImageDataUrl, blackImageDataUrl) {
    const response = await fetch(`${BRIDGE}/print`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ colorImageDataUrl, blackImageDataUrl }) });
    const result = await response.json();
    if (!response.ok || !result.ok)
        throw new Error(result.error || `Ошибка моста печати (${response.status})`);
    return result;
}
function readPhoto(file) {
    return new Promise((resolve, reject) => {
        if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
            reject(new Error('Выберите фотографию JPG, PNG, WebP или BMP.'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Не удалось прочитать выбранный файл.'));
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const probe = new Image();
            probe.onerror = () => reject(new Error('Выбранный файл не удалось открыть как изображение.'));
            probe.onload = () => resolve({ dataUrl, mimeType: file.type, width: probe.naturalWidth, height: probe.naturalHeight });
            probe.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });
}
async function setPreview(image, dataUrl) {
    image.src = dataUrl;
    await image.decode();
}
async function main() {
    const stored = await chrome.storage.session.get('printPayload');
    const payload = stored.printPayload;
    const status = document.querySelector('#status');
    const image = document.querySelector('#card');
    const printButton = document.querySelector('#confirm-print');
    const cancelButton = document.querySelector('#cancel-print');
    const selectPhotoButton = document.querySelector('#select-photo');
    const photoInput = document.querySelector('#photo-file');
    const photoName = document.querySelector('#photo-name');
    const identifierStep = document.querySelector('#identifier-step');
    const identifierSelect = document.querySelector('#identifier-select');
    let panels;
    let isBusy = false;
    if (!payload) {
        status.textContent = 'Данные пропуска не найдены.';
        return;
    }
    const requiresPhoto = payload.type === 'employee' || payload.type === 'mosn';
    const identifiers = Array.from(new Set((payload.employee.identifiers?.length ? payload.employee.identifiers : [payload.employee.passNumber]).filter((v) => Boolean(v))));
    let selectedIdentifier = identifiers[0];
    let selectedPhoto;
    const employeeForRender = () => ({ ...payload.employee, photo: selectedPhoto, passNumber: selectedIdentifier }); // photo:undefined is used for the initial no-photo render
    const setControlsBusy = (busy) => {
        isBusy = busy;
        cancelButton.disabled = busy;
        selectPhotoButton.disabled = busy;
        photoInput.disabled = busy;
        identifierSelect.disabled = busy;
        printButton.disabled = busy || !panels;
    };
    if (identifiers.length > 1) {
        identifierStep.hidden = false;
        for (const id of identifiers) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = id;
            identifierSelect.append(option);
        }
        identifierSelect.value = selectedIdentifier || '';
    }
    const rerender = async () => {
        panels = undefined;
        setControlsBusy(true);
        const employee = employeeForRender();
        const dataUrl = await renderCard(payload.type, employee);
        await setPreview(image, dataUrl);
        if (!requiresPhoto || selectedPhoto)
            panels = await renderCardPanels(payload.type, employee);
        setControlsBusy(false);
    };
    identifierSelect.addEventListener('change', async () => { selectedIdentifier = identifierSelect.value; try {
        await rerender();
        status.textContent = requiresPhoto && !selectedPhoto ? 'Выберите исходный файл фотографии. До этого печать недоступна.' : 'Проверьте данные и нажмите «Печать».';
    }
    catch (error) {
        status.textContent = `Ошибка формирования пропуска: ${String(error)}`;
        setControlsBusy(false);
    } });
    cancelButton.addEventListener('click', async () => { await chrome.storage.session.remove('printPayload'); window.close(); });
    selectPhotoButton.addEventListener('click', () => {
        if (isBusy)
            return;
        photoInput.value = '';
        photoInput.click();
    });
    photoInput.addEventListener('change', async () => {
        const file = photoInput.files?.[0];
        if (!file)
            return;
        setControlsBusy(true);
        status.textContent = 'Добавление фотографии в пропуск…';
        try {
            const photo = await readPhoto(file);
            selectedPhoto = photo;
            await rerender();
            photoName.textContent = file.name;
            selectPhotoButton.textContent = 'Заменить фото';
            status.textContent = 'Фото добавлено. Проверьте пропуск и нажмите «Печать».';
        }
        catch (error) {
            photoName.textContent = 'Фото не выбрано';
            status.textContent = `Ошибка фотографии: ${String(error)}`;
        }
        finally {
            setControlsBusy(false);
        }
    });
    printButton.addEventListener('click', async () => {
        if (isBusy || !panels)
            return;
        setControlsBusy(true);
        status.textContent = 'Отправка на IDP SMART…';
        try {
            const result = await directPrint(panels.colorImageDataUrl, panels.blackImageDataUrl);
            status.textContent = `Задание отправлено на ${result.printer || 'IDP SMART'}.`;
            await chrome.storage.session.remove('printPayload');
            window.setTimeout(() => window.close(), 900);
        }
        catch (error) {
            const message = String(error);
            status.textContent = message.includes('Failed to fetch') ? `Print Bridge не отвечает. Повторно запустите bridge\\install.cmd. (${message})` : `Ошибка IDP SMART: ${message}`;
            setControlsBusy(false);
        }
    });
    try {
        document.title = `Пропуск — ${payload.employee.fullName}`;
        status.textContent = requiresPhoto ? 'Формирование пропуска без фотографии…' : 'Формирование пропуска…';
        await setPreview(image, await renderCard(payload.type, employeeForRender()));
        if (requiresPhoto) {
            selectPhotoButton.hidden = false;
            photoName.hidden = false;
            status.textContent = 'Выберите исходный файл фотографии. До этого печать недоступна.';
        }
        else {
            panels = await renderCardPanels(payload.type, employeeForRender());
            status.textContent = 'Проверьте данные и нажмите «Печать».';
            printButton.disabled = false;
        }
    }
    catch (error) {
        status.textContent = `Ошибка формирования пропуска: ${String(error)}`;
    }
}
void main();
