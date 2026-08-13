import { normalizePosition } from './positionNormalizer.js';
export const CARD = { widthPx: 1012, heightPx: 638, widthMm: 85.6, heightMm: 54, dpi: 300 };
const asset = (name) => chrome.runtime.getURL(`src/assets/${name}`), ORGANIZATION = 'ММЦ ФГБУЗ ЮОМЦ ФМБА России';
const load = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
function cover(ctx, image, x, y, w, h) { const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight), sw = w / scale, sh = h / scale; ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, w, h); }
function text(ctx, value, x, y, maxWidth, size, weight = 400) { let px = size; while (px > 18) {
    ctx.font = `${weight} ${px}px Arial`;
    if (ctx.measureText(value).width <= maxWidth)
        break;
    px--;
} ctx.fillText(value, x, y); }
async function base() { const canvas = document.createElement('canvas'); canvas.width = CARD.widthPx; canvas.height = CARD.heightPx; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1012, 638); const background = await load(asset('medical-background.jpg')); ctx.drawImage(background, 0, 64, 440, 574); ctx.fillStyle = '#111'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.font = '400 43px Arial'; ctx.textAlign = 'center'; ctx.fillText(ORGANIZATION, 506, 50); ctx.textAlign = 'left'; return { canvas, ctx }; }
function photoFrame(ctx, photo) { ctx.fillStyle = '#eee'; ctx.fillRect(33, 96, 375, 505); cover(ctx, photo, 33, 96, 375, 505); }
function emblem(ctx, image, x, y, w, h) { ctx.drawImage(image, x, y, w, h); }
export async function renderCard(type, e) {
    const { canvas, ctx } = await base();
    if (type === 'temporary') {
        const color = await load(asset('emblem-color.png'));
        emblem(ctx, color, 32, 96, 375, 505);
        ctx.font = '400 58px Arial';
        ctx.fillText('ВРЕМЕННЫЙ', 466, 216);
        ctx.font = '400 76px Arial';
        ctx.fillText('ПРОПУСК', 466, 392);
        ctx.font = '400 37px Arial';
        ctx.fillText('№ Пропуска', 466, 548);
        ctx.font = '400 39px Arial';
        ctx.fillText(e.passNumber || e.employeeNumber || '', 466, 611);
        ctx.font = '700 39px Arial';
        ctx.fillText('МО', 914, 609);
        return canvas.toDataURL('image/png');
    }
    if (e.photo?.dataUrl) {
        try {
            photoFrame(ctx, await load(e.photo.dataUrl));
        }
        catch { }
    }
    const black = await load(asset('emblem-black.png'));
    emblem(ctx, black, 800, 425, 205, 205);
    const x = 456, w = 540;
    ctx.fillStyle = '#111';
    text(ctx, e.surname, x, 123, w, 39);
    text(ctx, e.name, x, 193, w, 39);
    text(ctx, e.patronymic || '', x, 263, w, 39);
    const fit = normalizePosition(ctx, e.position || '', { fontFamily: 'Arial', fontSize: 32, minScale: .85, maxWidth: w, maxLines: 2, lineHeight: 36 }, true);
    ctx.font = `400 ${fit.fontSize}px Arial`;
    fit.lines.forEach((line, index) => ctx.fillText(line, x, 333 + index * 36));
    if (type === 'mosn') {
        ctx.font = '400 44px Arial';
        ctx.fillText('МОСН', x, 444);
        ctx.font = '400 35px Arial';
        ctx.fillText('№ Пропуска', x, 552);
        ctx.font = '400 39px Arial';
        ctx.fillText(e.passNumber || '', x, 617);
    }
    else {
        ctx.font = '400 35px Arial';
        ctx.fillText('Таб. №', x, 431);
        ctx.fillText(e.employeeNumber || '', 620, 431);
        ctx.fillText('№ Пропуска', x, 530);
        ctx.font = '400 39px Arial';
        ctx.fillText(e.passNumber || '', x, 599);
    }
    return canvas.toDataURL('image/png');
}
