const replacements = [[/исполняющ(?:ий|ая) обязанности/giu, 'и. о.'], [/медицинск(?:ая|ий|ой|ого)/giu, 'мед.'], [/заведующ(?:ий|ая)/giu, 'зав.'], [/заместитель/giu, 'зам.'], [/отделение/giu, 'отд.']];
function wrap(ctx, text, width, maxLines) { const words = text.split(/\s+/); const lines = []; let line = ''; for (const word of words) {
    const n = line ? `${line} ${word}` : word;
    if (ctx.measureText(n).width <= width)
        line = n;
    else {
        if (line)
            lines.push(line);
        line = word;
    }
} if (line)
    lines.push(line); return lines.length <= maxLines ? lines : []; }
export function normalizePosition(ctx, input, o, auto = true) { const raw = input.replace(/\s+/g, ' ').trim(); const variants = [raw]; if (auto) {
    let v = raw;
    for (const [re, to] of replacements) {
        v = v.replace(re, to);
        if (v !== variants.at(-1))
            variants.push(v);
    }
    variants.push(v.replace(/Старшая/giu, 'Ст.').replace(/Младшая/giu, 'Мл.'));
} for (const text of variants)
    for (const scale of [1, .95, .9, .85]) {
        if (scale < o.minScale)
            continue;
        const size = o.fontSize * scale;
        ctx.font = `600 ${size}px ${o.fontFamily}`;
        const lines = wrap(ctx, text, o.maxWidth, o.maxLines);
        if (lines.length && lines.length * o.lineHeight * scale <= o.maxLines * o.lineHeight)
            return { text, lines, fontSize: size, fits: true, changed: text !== raw || scale !== 1 };
    } return { text: variants.at(-1) || raw, lines: [variants.at(-1) || raw], fontSize: o.fontSize * o.minScale, fits: false, changed: true }; }
