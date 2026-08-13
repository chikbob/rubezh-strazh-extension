import { ACTION_SELECTORS, EMPLOYEE_ROOTS, FIELD_LABELS, PHOTO_SELECTORS } from './selectors.js';
const clean = (v) => v.replace(/\s+/g, ' ').trim();
function allRoots() { const roots = [document]; document.querySelectorAll('*').forEach(e => { if (e.shadowRoot)
    roots.push(e.shadowRoot); }); return roots; }
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
        } for (const r of allRoots())
        for (const button of Array.from(r.querySelectorAll('employee-view button, .employee-view button'))) {
            const clues = [button.textContent, button.getAttribute('title'), button.getAttribute('aria-label'), button.className, button.innerHTML].join(' ').toLowerCase();
            if (/сохран|save|floppy/.test(clues))
                return button;
        } return null; }
    async getPhoto() { for (const r of allRoots())
        for (const s of PHOTO_SELECTORS) {
            const e = r.querySelector(s);
            if (e) {
                const p = await imageToData(e);
                if (p)
                    return p;
            }
        } return null; }
    async getEmployeeData() { const value = (k) => clean(findByLabel(FIELD_LABELS[k])?.value || ''); const surname = value('surname'), name = value('name'), patronymic = value('patronymic'); return { surname, name, patronymic, fullName: clean([surname, name, patronymic].filter(Boolean).join(' ')), employeeNumber: value('employeeNumber'), position: value('position'), department: value('department'), comment: value('comment'), accessProfile: value('accessProfile'), personalEntryPoint: value('personalEntryPoint'), loginUser: value('loginUser'), pin: value('pin'), vehicleNumber: value('vehicleNumber'), photo: await this.getPhoto() || undefined }; }
}
