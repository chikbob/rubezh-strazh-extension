import { ACTION_SELECTORS, EMPLOYEE_ROOTS, FIELD_LABELS, PHOTO_SELECTORS } from './selectors.js';
const clean = (v) => v.replace(/\s+/g, ' ').trim();
function allRoots() { const roots = [document]; document.querySelectorAll('*').forEach(e => { if (e.shadowRoot)
    roots.push(e.shadowRoot); }); return roots; }
function isVisitorPage() { return allRoots().some(root => Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).some(title => clean(title.textContent || '').toLowerCase() === 'личные данные посетителя')); }
function visitorComment() { for (const root of allRoots()) {
    const textareas = Array.from(root.querySelectorAll('textarea'));
    const labelled = textareas.find(area => /комментарий/iu.test(area.closest('.input-group,.form-group,.row')?.textContent || ''));
    const area = labelled || (textareas.length === 1 ? textareas[0] : null);
    if (area && clean(area.value))
        return clean(area.value);
} return ''; }
function findByLabel(labels) {
    for (const root of allRoots())
        for (const label of Array.from(root.querySelectorAll('label'))) {
            const text = clean(label.textContent || '').replace(/\s*\*$/, '');
            if (!labels.some(x => text.toLowerCase().includes(x.toLowerCase())))
                continue;
            const id = label.getAttribute('for');
            const el = (id && root.querySelector(`#${CSS.escape(id)}`)) || label.querySelector('input,textarea,select') || label.parentElement?.querySelector('input,textarea,select');
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
                return el;
        }
    for (const root of allRoots())
        for (const el of Array.from(root.querySelectorAll('input,textarea,select'))) {
            const hay = [el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label')].filter(Boolean).join(' ').toLowerCase();
            if (labels.some(x => hay.includes(x.toLowerCase())))
                return el;
        }
    for (const root of allRoots())
        for (const node of Array.from(root.querySelectorAll('div,span,td'))) {
            const text = clean(node.textContent || '').replace(/\s*\*$/, '');
            if (!labels.some(x => text.toLowerCase() === x.toLowerCase()))
                continue;
            const el = node.parentElement?.querySelector('input,textarea,select') || node.nextElementSibling?.querySelector?.('input,textarea,select');
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
                return el;
        }
    return null;
}
function bestImageSource(el) {
    const srcset = el.getAttribute('srcset') || '';
    const srcsetItems = srcset.split(',').map(item => { const parts = item.trim().split(/\s+/); const width = Number.parseFloat(parts[1] || '0'); return { src: parts[0] || '', width: Number.isFinite(width) ? width : 0 }; }).filter(item => item.src);
    const largest = srcsetItems.sort((a, b) => b.width - a.width)[0]?.src;
    return el.dataset.original || el.dataset.src || largest || el.src || el.currentSrc;
}
async function imageToData(el) {
    if (el instanceof HTMLCanvasElement) {
        try {
            return { dataUrl: el.toDataURL('image/png'), mimeType: 'image/png', width: el.width, height: el.height };
        }
        catch {
            return null;
        }
    }
    if (!(el instanceof HTMLImageElement) || !el.src)
        return null;
    const source = bestImageSource(el);
    try {
        const res = await fetch(source, { credentials: 'include' });
        const blob = await res.blob();
        return await new Promise(ok => { const r = new FileReader(); r.onload = () => { const dataUrl = String(r.result), probe = new Image(); probe.onload = () => ok({ dataUrl, mimeType: blob.type || 'image/jpeg', width: probe.naturalWidth, height: probe.naturalHeight }); probe.onerror = () => ok({ dataUrl, mimeType: blob.type || 'image/jpeg', width: el.naturalWidth, height: el.naturalHeight }); probe.src = dataUrl; }; r.onerror = () => ok(null); r.readAsDataURL(blob); });
    }
    catch {
        return source.startsWith('data:') ? { dataUrl: source, mimeType: source.slice(5, source.indexOf(';')), width: el.naturalWidth, height: el.naturalHeight } : null;
    }
}
export class RubezhAdapter {
    isEmployeePage() { return EMPLOYEE_ROOTS.some(s => allRoots().some(r => r.querySelector(s))) || !!findByLabel(FIELD_LABELS.surname); }
    getActionAnchor() { for (const r of allRoots())
        for (const s of ACTION_SELECTORS) {
            const e = r.querySelector(s);
            if (e)
                return e;
        } for (const r of allRoots()) {
        const buttons = Array.from(r.querySelectorAll('employee_view button,employee-view button,.employee-view button'));
        for (const button of buttons) {
            const clues = [button.textContent, button.getAttribute('title'), button.getAttribute('aria-label'), button.className, button.innerHTML].join(' ').toLowerCase();
            if (/сохран|save|floppy|disk/.test(clues))
                return button;
        }
        for (const button of buttons) {
            const next = button.nextElementSibling;
            const nextClues = [next?.className, next?.innerHTML, next?.getAttribute('title')].join(' ').toLowerCase();
            if (next && /trash|delete|удал|корзин/.test(nextClues))
                return button;
        }
    } return document.querySelector('employee_view .panel-heading,employee-view .panel-heading,.employee-view .panel-heading,employee_view header,employee-view header'); }
    async getPhoto() { const candidates = []; for (const r of allRoots()) {
        for (const image of Array.from(r.querySelectorAll('img'))) {
            if (image.src.startsWith('data:image/jpeg') || image.src.startsWith('data:image/png'))
                candidates.push(image);
        }
        for (const s of PHOTO_SELECTORS)
            candidates.push(...Array.from(r.querySelectorAll(s)));
    } const unique = [...new Set(candidates)].filter(e => !(e instanceof HTMLImageElement) || !/brand-icon|logo/i.test(e.src)); unique.sort((a, b) => { const area = (e) => e instanceof HTMLImageElement ? e.naturalWidth * e.naturalHeight : e instanceof HTMLCanvasElement ? e.width * e.height : 0; return area(b) - area(a); }); for (const e of unique) {
        const p = await imageToData(e);
        if (p)
            return p;
    } return null; }
    async getEmployeeData() { const value = (k) => clean(findByLabel(FIELD_LABELS[k])?.value || ''); const surname = value('surname'), name = value('name'), patronymic = value('patronymic'), visitor = isVisitorPage(), comment = visitor ? (visitorComment() || value('comment')) : value('comment'), position = value('position') || (visitor ? comment : ''); let passNumber; for (const root of allRoots())
        for (const node of Array.from(root.querySelectorAll('a,span,div,td'))) {
            if (node.children.length > 2)
                continue;
            const match = clean(node.textContent || '').match(/(?:^|\D)(\d{6,12})\s*[-–—−]?\s*уровень\s*\d*/iu);
            if (match) {
                passNumber = match[1];
                break;
            }
        } if (!passNumber) {
        const body = clean(document.body.innerText);
        passNumber = body.match(/(?:^|\D)(\d{6,12})\s*[-–—−]?\s*уровень\s*\d*/iu)?.[1];
    } return { surname, name, patronymic, fullName: clean([surname, name, patronymic].filter(Boolean).join(' ')), employeeNumber: value('employeeNumber'), passNumber, position, department: value('department'), comment, accessProfile: value('accessProfile'), personalEntryPoint: value('personalEntryPoint'), loginUser: value('loginUser'), pin: value('pin'), vehicleNumber: value('vehicleNumber'), photo: await this.getPhoto() || undefined }; }
}
