const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

export function isVisible(element: Element): boolean {
 for (let node: Element | null = element; node; node = node.parentElement) {
  const style = getComputedStyle(node);
  if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') return false;
 }
 return element.getClientRects().length > 0;
}

export function personalPanel(): Element | undefined {
 const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
 const title = headings.find(node => isVisible(node) && /^личные данные (сотрудника|посетителя)$/iu.test(normalize(node.textContent || '')));
 return title?.closest('.panel,.card') || title?.parentElement?.parentElement || undefined;
}

export function currentIdentifiers(): string[] {
 const personal = personalPanel();
 if (!personal) return [];
 // Start at the current form and stop at its first container with a card panel.
 // Never scan body text: SPA keeps other people's cached cards in the DOM.
 for (let container: Element | null = personal.parentElement; container; container = container.parentElement) {
  const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const titles = headings.filter(node => isVisible(node) && /^управление (картами|идентификаторами)$/iu.test(normalize(node.textContent || '')));
  if (!titles.length) continue;
  if (titles.length !== 1) return []; // Ambiguous view: do not print another person's code.
  const panel = titles[0].closest('.panel,.card') || titles[0].parentElement?.parentElement;
  if (!panel) return [];
  const ids: string[] = [];
  for (const row of Array.from(panel.querySelectorAll('a,span,div,td,li'))) {
   if (!isVisible(row) || Array.from(row.children).some(child => /\d{6,12}\s*[-–—−]?\s*уровень/iu.test(child.textContent || ''))) continue;
   const match = normalize(row.textContent || '').match(/^(\d{6,12})\s*[-–—−]?\s*уровень\s*\d+(?:\s*\([^)]*\))?$/iu);
   if (match && !ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
 }
 return [];
}
