import { normalizePosition } from './positionNormalizer.js';
export const CARD = { widthPx: 1012, heightPx: 638, widthMm: 85.6, heightMm: 54, dpi: 300 };
const asset = (name) => chrome.runtime.getURL(`src/assets/${name}`);
const load = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
function cover(ctx, image, iw, ih, x, y, w, h) { const scale = Math.max(w / iw, h / ih), sw = w / scale, sh = h / scale; ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h); }
function fitted(ctx, text, x, y, w, h, size, weight = 400) { let px = size; do {
    ctx.font = `${weight} ${px}px Arial`;
    if (ctx.measureText(text).width <= w)
        break;
    px--;
} while (px >= 18); ctx.fillText(text, x, y + (h + px * .72) / 2); }
export async function renderCard(type, e) {
    const canvas = document.createElement('canvas');
    canvas.width = CARD.widthPx;
    canvas.height = CARD.heightPx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const bg = await load(asset('medical-background.jpg'));
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (type === 'temporary') {
        const emblem = await load(asset('emblem-color.png'));
        ctx.globalAlpha = .13;
        ctx.drawImage(emblem, 610, 35, 350, 470);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.font = '700 52px Arial';
        ctx.fillText('ВРЕМЕННЫЙ', 735, 175);
        ctx.font = '700 58px Arial';
        ctx.fillText('ПРОПУСК', 735, 252);
        ctx.font = '700 42px Arial';
        ctx.fillText(e.employeeNumber || 'БЕЗ НОМЕРА', 735, 345);
        ctx.font = '700 31px Arial';
        ctx.fillText(e.fullName, 735, 422);
        ctx.font = '400 25px Arial';
        ctx.fillText(e.department || '', 735, 468, 500);
        ctx.font = '700 25px Arial';
        ctx.fillText('ММЦ ФГБУЗ ЮОМЦ ФМБА России', 506, 585);
        return canvas.toDataURL('image/png');
    }
    if (e.photo?.dataUrl) {
        try {
            const photo = await load(e.photo.dataUrl);
            cover(ctx, photo, photo.naturalWidth, photo.naturalHeight, 28, 44, 400, 540);
        }
        catch { }
    }
    else {
        ctx.fillStyle = '#fff';
        ctx.fillRect(28, 44, 400, 540);
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.font = '24px Arial';
        ctx.fillText('ФОТО ОТСУТСТВУЕТ', 228, 320);
    }
    ctx.fillStyle = '#111';
    ctx.textAlign = 'left';
    fitted(ctx, e.surname, 457, 12, 555, 50, 38, 700);
    fitted(ctx, e.name, 456, 83, 556, 50, 36, 700);
    fitted(ctx, e.patronymic || '', 457, 154, 555, 50, 34, 700);
    const fit = normalizePosition(ctx, e.position || '', { fontFamily: 'Arial', fontSize: 31, minScale: .85, maxWidth: 556, maxLines: 2, lineHeight: 34 }, true);
    ctx.font = `600 ${fit.fontSize}px Arial`;
    fit.lines.forEach((line, index) => ctx.fillText(line, 456, 250 + index * 34));
    if (type === 'employee') {
        ctx.font = '700 28px Arial';
        ctx.fillText(`Таб. ${e.employeeNumber || ''}`, 456, 342);
    }
    else {
        ctx.fillStyle = '#a71930';
        ctx.font = '800 48px Arial';
        ctx.fillText('МОСН', 456, 350);
    }
    ctx.fillStyle = '#111';
    ctx.font = '700 22px Arial';
    ctx.fillText('ММЦ ФГБУЗ ЮОМЦ ФМБА России', 624, 430);
    return canvas.toDataURL('image/png');
}
