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
async function base(layer) { const canvas = document.createElement('canvas'); canvas.width = CARD.widthPx; canvas.height = CARD.heightPx; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1012, 638); if (layer !== 'black') {
    const background = await load(asset('medical-background.jpg'));
    ctx.drawImage(background, 0, 84, 440, 554);
} ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; if (layer !== 'color') {
    ctx.font = '400 83px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ORGANIZATION, 506, 42, 970);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
} return { canvas, ctx }; }
function photoFrame(ctx, photo) { ctx.fillStyle = '#eee'; ctx.fillRect(33, 96, 375, 505); cover(ctx, photo, 33, 96, 375, 505); }
function contain(ctx, image, x, y, w, h) { const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight), dw = image.naturalWidth * scale, dh = image.naturalHeight * scale; ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
async function renderLayer(type, e, layer) {
    const { canvas, ctx } = await base(layer);
    if (type === 'temporary') {
        if (layer !== 'black') {
            const color = await load(asset('emblem-color.png'));
            contain(ctx, color, 32, 96, 375, 505);
        }
        if (layer !== 'color') {
            ctx.font = '400 72px Arial';
            ctx.fillText('ВРЕМЕННЫЙ', 466, 216);
            ctx.font = '400 104px Arial';
            ctx.fillText('ПРОПУСК', 466, 392);
            ctx.font = '400 37px Arial';
            ctx.fillText('№ Пропуска', 466, 548);
            ctx.font = '400 39px Arial';
            ctx.fillText(e.passNumber || '', 466, 611);
            ctx.font = '700 39px Arial';
            ctx.fillText('МО', 914, 609);
        }
        return canvas.toDataURL('image/png');
    }
    if (layer !== 'black' && e.photo?.dataUrl) {
        try {
            photoFrame(ctx, await load(e.photo.dataUrl));
        }
        catch { }
    }
    if (layer !== 'color') {
        const black = await load(asset('emblem-black-v2.png'));
        contain(ctx, black, 800, 410, 205, 228);
    }
    if (layer === 'color')
        return canvas.toDataURL('image/png');
    const x = 456, w = 540;
    ctx.fillStyle = '#111';
    text(ctx, e.surname, x, 123, w, 58);
    text(ctx, e.name, x, 193, w, 58);
    text(ctx, e.patronymic || '', x, 263, w, 58);
    const fit = normalizePosition(ctx, e.position || '', { fontFamily: 'Arial', fontSize: 50, minScale: .72, maxWidth: w, maxLines: 2, lineHeight: 54 }, true);
    ctx.font = `400 ${fit.fontSize}px Arial`;
    fit.lines.forEach((line, index) => ctx.fillText(line, x, 333 + index * 54));
    if (type === 'mosn') {
        ctx.font = '400 58px Arial';
        ctx.fillText('МОСН', x, 444);
        ctx.fillText('№ Пропуска', x, 552);
        ctx.fillText(e.passNumber || '', x, 617);
    }
    else {
        ctx.font = '400 58px Arial';
        const tabLabel = 'Таб. №';
        ctx.fillText(tabLabel, x, 431);
        const tabX = x + ctx.measureText(tabLabel).width + 12;
        ctx.fillText(e.employeeNumber || '', tabX, 431);
        ctx.fillText('№ Пропуска', x, 530);
        ctx.fillText(e.passNumber || '', x, 599);
    }
    return canvas.toDataURL('image/png');
}
export async function renderCard(type, e) { return renderLayer(type, e, 'composite'); }
export async function renderCardPanels(type, e) { const [colorImageDataUrl, blackImageDataUrl] = await Promise.all([renderLayer(type, e, 'color'), renderLayer(type, e, 'black')]); return { colorImageDataUrl, blackImageDataUrl }; }
