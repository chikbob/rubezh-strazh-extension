import { ACTION_SELECTORS, EMPLOYEE_ROOTS, FIELD_LABELS, PHOTO_SELECTORS } from './selectors.js';
const clean = (v) => v.replace(/\s+/g, ' ').trim();
function allRoots() { const roots = [document]; document.querySelectorAll('*').forEach(e => { if (e.shadowRoot)
    roots.push(e.shadowRoot); }); return roots; }
function isVisitorPage() { return allRoots().some(root => Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).some(title => clean(title.textContent || '').toLowerCase() === 'личные данные посетителя')); }
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
    try {
        const res = await fetch(el.currentSrc || el.src, { credentials: 'include' });
        const blob = await res.blob();
        return await new Promise(ok => { const r = new FileReader(); r.onload = () => ok({ dataUrl: String(r.result), mimeType: blob.type || 'image/jpeg', width: el.naturalWidth, height: el.naturalHeight }); r.onerror = () => ok(null); r.readAsDataURL(blob); });
    }
    catch {
        return el.src.startsWith('data:') ? { dataUrl: el.src, mimeType: el.src.slice(5, el.src.indexOf(';')), width: el.naturalWidth, height: el.naturalHeight } : null;
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
    async getPhoto() { for (const r of allRoots()) {
        const dataPhoto = Array.from(r.querySelectorAll('img')).find(image => image.src.startsWith('data:image/jpeg') || image.src.startsWith('data:image/png'));
        if (dataPhoto) {
            const p = await imageToData(dataPhoto);
            if (p)
                return p;
        }
    } for (const r of allRoots())
        for (const s of PHOTO_SELECTORS) {
            for (const e of Array.from(r.querySelectorAll(s))) {
                if (e instanceof HTMLImageElement && /brand-icon|logo/i.test(e.src))
                    continue;
                const p = await imageToData(e);
                if (p)
                    return p;
            }
        } return null; }
    async getEmployeeData() { const value = (k) => clean(findByLabel(FIELD_LABELS[k])?.value || ''); const surname = value('surname'), name = value('name'), patronymic = value('patronymic'), comment = value('comment'), position = value('position') || (isVisitorPage() ? comment : ''); let passNumber; for (const root of allRoots())
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
