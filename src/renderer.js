import { normalizePosition } from './positionNormalizer.js';
export const CARD = { widthPx: 1012, heightPx: 638, widthMm: 85.6, heightMm: 54, dpi: 300 };
const asset = (name) => chrome.runtime.getURL(`src/assets/${name}`), ORGANIZATION = 'ММЦ ФГБУЗ ЮОМЦ ФМБА России';
// Mild source correction improves pale portraits without changing printer,
// ribbon or SmartComm density settings. Values stay below the older aggressive
// 0.90/1.18/1.12 profile which clipped light skin tones.
const COLOR_FILTER = 'brightness(0.95) contrast(1.14) saturate(1.07)';
const TEXT_STROKE = 0.45;
const load = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
function cover(ctx, image, x, y, w, h) { const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight), sw = w / scale, sh = h / scale; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, w, h); }
function ink(ctx, value, x, y) { ctx.save(); ctx.strokeStyle = '#000'; ctx.lineWidth = TEXT_STROKE; ctx.lineJoin = 'round'; ctx.strokeText(value, x, y); ctx.restore(); ctx.fillText(value, x, y); }
function text(ctx, value, x, y, maxWidth, size, weight = 400) { let px = size; while (px > 18) {
    ctx.font = `${weight} ${px}px Arial`;
    if (ctx.measureText(value).width <= maxWidth)
        break;
    px--;
} ink(ctx, value, x, y); }
async function base(layer) { const canvas = document.createElement('canvas'); canvas.width = CARD.widthPx; canvas.height = CARD.heightPx; const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1012, 638); if (layer !== 'black') {
    const background = await load(asset('medical-background.jpg'));
    ctx.save();
    ctx.filter = COLOR_FILTER;
    ctx.drawImage(background, 0, 84, 440, 554);
    ctx.restore();
} ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; if (layer !== 'color') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    text(ctx, ORGANIZATION, 506, 42, 970, 48);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
} return { canvas, ctx }; }
function photoFrame(ctx, photo) { ctx.save(); ctx.filter = COLOR_FILTER; cover(ctx, photo, 33, 117, 375, 484); ctx.restore(); }
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
            ink(ctx, 'ВРЕМЕННЫЙ', 466, 216);
            ctx.font = '400 104px Arial';
            ink(ctx, 'ПРОПУСК', 466, 392);
            ctx.font = '400 37px Arial';
            ink(ctx, '№ Пропуска', 466, 548);
            ctx.font = '400 39px Arial';
            ink(ctx, e.passNumber || '', 466, 611);
            ctx.font = '700 39px Arial';
            ink(ctx, 'МО', 914, 609);
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
    ctx.fillStyle = '#000';
    text(ctx, e.surname, x, 134, w, 46);
    text(ctx, e.name, x, 196, w, 46);
    text(ctx, e.patronymic || '', x, 258, w, 46);
    const fit = normalizePosition(ctx, e.position || '', { fontFamily: 'Arial', fontSize: 40, minScale: .72, maxWidth: w, maxLines: 2, lineHeight: 44 }, true);
    ctx.font = `400 ${fit.fontSize}px Arial`;
    fit.lines.forEach((line, index) => ink(ctx, line, x, 324 + index * 44));
    if (type === 'mosn') {
        ctx.font = '400 46px Arial';
        ink(ctx, 'МОСН', x, 437);
        ink(ctx, '№ Пропуска', x, 546);
        ink(ctx, e.passNumber || '', x, 608);
    }
    else {
        ctx.font = '400 46px Arial';
        const tabLabel = 'Таб. №';
        ink(ctx, tabLabel, x, 429);
        const tabX = x + ctx.measureText(tabLabel).width + 10;
        ink(ctx, e.employeeNumber || '', tabX, 429);
        ink(ctx, '№ Пропуска', x, 528);
        ink(ctx, e.passNumber || '', x, 590);
    }
    return canvas.toDataURL('image/png');
}
export async function renderCard(type, e) { return renderLayer(type, e, 'composite'); }
export async function renderCardPanels(type, e) { const [colorImageDataUrl, blackImageDataUrl] = await Promise.all([renderLayer(type, e, 'color'), renderLayer(type, e, 'black')]); return { colorImageDataUrl, blackImageDataUrl }; }
