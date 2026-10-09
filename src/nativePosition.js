// Font and width of the fixed source CSD; text is never rasterized for printing.
export const NATIVE_POSITION_FONT = '400 37.5px Arial';
export const NATIVE_POSITION_WIDTH = 548;
// Local vocabulary: preserve specialties and unknown words. Cuts end on a
// consonant, not a vowel/soft sign. These are readable local abbreviations,
// not a claim that every profession has an official standard abbreviation.
const common = [
    ['оператор(?:а|ом|у|ы|ов)?', 'опер.'],
    ['медицинск(?:ая|ий|ое|ой|ого|ому|им|ие|их|ими|ую)', 'мед.'],
    ['младш(?:ая|ий|ее|ей|его|ему|им|ие|их|ими|ую)', 'млад.']
];
const adjectives = [
    ['главн', 'глав.'], ['экономическ', 'экон.'], ['функциональн', 'функц.'],
    ['процедурн', 'процед.'], ['операционн', 'операц.'], ['при[её]мн', 'приёмн.'],
    ['палатн', 'палатн.'], ['постов', 'постов.'], ['больничн', 'больничн.'],
    ['лекарственн', 'лекарств.'], ['лабораторн', 'лаб.'], ['клиническ', 'клин.'],
    ['эндоскопическ', 'эндоскоп.'], ['служебн', 'служебн.'], ['подсобн', 'подсобн.'],
    ['административн', 'адм.'], ['бухгалтерск', 'бухг.'], ['финансов', 'фин.'],
    ['кадров', 'кадров.'], ['документационн', 'документац.'], ['системн', 'сист.'],
    ['информационн', 'информ.'], ['программн', 'программ.'], ['техническ', 'техн.'],
    ['вычислительн', 'вычислит.'], ['автоматизированн', 'автоматизир.']
];
const compact = [
    ['исполняющ(?:ий|ая) обязанности', 'и. о.'],
    ['заместитель(?:ница|ницы|я|ю|ем|и|ей)?', 'зам.'],
    ['старш(?:ая|ий|ей|его|ему|им|ие|их|ими|ую)', 'ст.'],
    ['заведующ(?:ий|ая|его|ей|ему|им|ие|их|ими|ую)', 'зав.'],
    ['отделени(?:е|я|ем|ю|й|ями|ях)', 'отд.'], ['отдел(?:а|ом|у|ы|ов|ами|ах)?', 'отд.'],
    ['вопрос(?:ы|ам|ами|ах|ов)?', 'вопр.'], ['диагностик(?:а|и|ой|у)', 'диагн.'],
    ['оборудовани(?:е|я|ем|ю)', 'оборуд.'], ['обслуживани(?:е|я|ем|ю)', 'обслуж.'],
    ['помещени(?:я|й|ях|ями|е|ю|ем)', 'помещ.'], ['инженер(?:а|ом|у|ы|ов)?', 'инж.'],
    ['специалист(?:а|ом|у|ы|ов)?', 'спец.'], ['начальник(?:а|ом|у|и|ов)?', 'нач.'],
    ['руководитель(?:я|ем|ю|и|ей)?', 'рук.'], ['администратор(?:а|ом|у|ы|ов)?', 'адм-р'],
    ['бухгалтер(?:а|ом|у|ы|ов|ия|ии|ию)?', 'бухг.'],
    ['делопроизводств(?:о|а|ом|у)', 'делопроизв.'], ['документ(?:ы|ов|ами|ах|а|ом|у)?', 'докум.'],
    ['технологи(?:я|и|й|ям|ями|ях|ю)', 'технол.'], ['обеспечени(?:е|я|ем|ю)', 'обесп.'],
    ['безопасност(?:ь|и|ью)', 'безопасн.'], ['программист(?:а|ом|у|ы|ов)?', 'программ.'],
    ...adjectives.map(([stem, to]) => [stem + '(?:ый|ий|ая|ое|ой|ого|ому|ым|им|ые|ие|ых|их|ыми|ими|ую)', to])
];
function replaceWords(text, rules) {
    for (const [pattern, replacement] of rules) {
        const re = new RegExp('(?<![\\p{L}\\p{N}])(?:' + pattern + ')(?![\\p{L}\\p{N}])', 'giu');
        text = text.replace(re, match => match === match.toUpperCase() ? replacement.toUpperCase() : match[0] === match[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement);
    }
    return text;
}
function wrap(text, fits) {
    if (!text.includes('\n') && fits(text))
        return text ? [text] : [];
    const explicit = text.split('\n');
    if (explicit.length > 1)
        return explicit.length <= 2 && explicit.every(fits) ? explicit : undefined;
    const tokens = text.split(' ').flatMap(word => fits(word) ? [word] : word.split(/(?<=-)/u));
    const lines = [];
    let line = '';
    let previous = '';
    for (const token of tokens) {
        const separator = line && !previous.endsWith('-') ? ' ' : '';
        const next = line + separator + token;
        if (fits(next))
            line = next;
        else {
            if (line)
                lines.push(line);
            if (!fits(token))
                return undefined;
            line = token;
        }
        previous = token;
    }
    if (line)
        lines.push(line);
    return lines.length <= 2 ? lines : undefined;
}
export function fitNativePosition(input, fits) {
    const raw = input.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[^\S\n]+/g, ' ').trim()).filter(Boolean).join('\n');
    let text = replaceWords(raw, common);
    if (text && !text.includes('\n') && !fits(text))
        text = replaceWords(text, compact);
    let lines = wrap(text, fits);
    if (!lines) {
        text = replaceWords(text, compact);
        lines = wrap(text, fits);
    }
    if (!text)
        lines = [];
    return { text: lines ? lines.join('\n') : text, lines: lines || [], fits: !!lines, changed: (lines ? lines.join('\n') : text) !== raw };
}
export function prepareNativePosition(input) {
    const context = document.createElement('canvas').getContext('2d');
    context.font = NATIVE_POSITION_FONT;
    return fitNativePosition(input, text => context.measureText(text).width <= NATIVE_POSITION_WIDTH);
}
