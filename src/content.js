"use strict";
(() => {
  // extension-ts/selectors.ts
  var FIELD_LABELS = {
    surname: ["\u0424\u0430\u043C\u0438\u043B\u0438\u044F"],
    name: ["\u0418\u043C\u044F"],
    patronymic: ["\u041E\u0442\u0447\u0435\u0441\u0442\u0432\u043E"],
    comment: ["\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439"],
    employeeNumber: ["\u0422\u0430\u0431\u0435\u043B\u044C\u043D\u044B\u0439 \u043D\u043E\u043C\u0435\u0440"],
    position: ["\u0414\u043E\u043B\u0436\u043D\u043E\u0441\u0442\u044C"],
    department: ["\u041E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435"],
    accessProfile: ["\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0434\u043E\u0441\u0442\u0443\u043F\u0430"],
    personalEntryPoint: ["\u041B\u0438\u0447\u043D\u0430\u044F \u0442\u043E\u0447\u043A\u0430 \u043F\u0440\u043E\u0445\u043E\u0434\u0430"],
    loginUser: ["\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0434\u043B\u044F \u0432\u0445\u043E\u0434\u0430 \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0443"],
    pin: ["\u041F\u0438\u043D \u043A\u043E\u0434", "\u041F\u0438\u043D-\u043A\u043E\u0434"],
    vehicleNumber: ["\u041D\u043E\u043C\u0435\u0440 \u0430\u0432\u0442\u043E\u043C\u043E\u0431\u0438\u043B\u044F"]
  };
  var EMPLOYEE_ROOTS = ["employee_view", "employee-view", '[data-view="employee"]', ".employee-view"];
  var PHOTO_SELECTORS = ["employee_view img[src]", "employee-view img[src]", ".employee-photo img[src]", 'img[alt*="\u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A" i]', 'img[alt*="\u0444\u043E\u0442\u043E" i]', "employee_view canvas", "employee-view canvas"];
  var VIEW_ROOTS = ["employee_view", "employee-view", ".employee-view"];
  var ACTIONS = ['button[title*="\u0441\u043E\u0445\u0440\u0430\u043D" i]', 'button[aria-label*="\u0441\u043E\u0445\u0440\u0430\u043D" i]', "button:has(.fa-save)", "button:has(.fa-floppy-o)", "button:has(.glyphicon-floppy-disk)", "button:has(.glyphicon-floppy-save)", 'button:has([class*="save"])', 'button[type="submit"]'];
  var ACTION_SELECTORS = VIEW_ROOTS.flatMap((root) => ACTIONS.map((action) => `${root} ${action}`));

  // extension-ts/adapter.ts
  var clean = (v) => v.replace(/\s+/g, " ").trim();
  function allRoots() {
    const roots2 = [document];
    document.querySelectorAll("*").forEach((e) => {
      if (e.shadowRoot) roots2.push(e.shadowRoot);
    });
    return roots2;
  }
  function isVisitorPage() {
    return allRoots().some((root) => Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6")).some((title) => clean(title.textContent || "").toLowerCase() === "\u043B\u0438\u0447\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u0441\u0435\u0442\u0438\u0442\u0435\u043B\u044F"));
  }
  function visitorComment() {
    for (const root of allRoots()) {
      const textareas = Array.from(root.querySelectorAll("textarea"));
      const labelled = textareas.find((area2) => /комментарий/iu.test(area2.closest(".input-group,.form-group,.row")?.textContent || ""));
      const area = labelled || (textareas.length === 1 ? textareas[0] : null);
      if (area && clean(area.value)) return clean(area.value);
    }
    return "";
  }
  function findByLabel(labels) {
    for (const root of allRoots()) for (const label of Array.from(root.querySelectorAll("label"))) {
      const text = clean(label.textContent || "").replace(/\s*\*$/, "");
      if (!labels.some((x) => text.toLowerCase().includes(x.toLowerCase()))) continue;
      const id = label.getAttribute("for");
      const el = id && root.querySelector(`#${CSS.escape(id)}`) || label.querySelector("input,textarea,select") || label.parentElement?.querySelector("input,textarea,select");
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el;
    }
    for (const root of allRoots()) for (const el of Array.from(root.querySelectorAll("input,textarea,select"))) {
      const hay = [el.getAttribute("name"), el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label")].filter(Boolean).join(" ").toLowerCase();
      if (labels.some((x) => hay.includes(x.toLowerCase()))) return el;
    }
    for (const root of allRoots()) for (const node of Array.from(root.querySelectorAll("div,span,td"))) {
      const text = clean(node.textContent || "").replace(/\s*\*$/, "");
      if (!labels.some((x) => text.toLowerCase() === x.toLowerCase())) continue;
      const el = node.parentElement?.querySelector("input,textarea,select") || node.nextElementSibling?.querySelector?.("input,textarea,select");
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el;
    }
    return null;
  }
  function bestImageSource(el) {
    const srcset = el.getAttribute("srcset") || "";
    const srcsetItems = srcset.split(",").map((item) => {
      const parts = item.trim().split(/\s+/);
      const width = Number.parseFloat(parts[1] || "0");
      return { src: parts[0] || "", width: Number.isFinite(width) ? width : 0 };
    }).filter((item) => item.src);
    const largest = srcsetItems.sort((a, b) => b.width - a.width)[0]?.src;
    return el.dataset.original || el.dataset.src || largest || el.src || el.currentSrc;
  }
  async function imageToData(el) {
    if (el instanceof HTMLCanvasElement) {
      try {
        return { dataUrl: el.toDataURL("image/png"), mimeType: "image/png", width: el.width, height: el.height };
      } catch {
        return null;
      }
    }
    if (!(el instanceof HTMLImageElement) || !el.src) return null;
    const source = bestImageSource(el);
    try {
      const res = await fetch(source, { credentials: "include" });
      const blob = await res.blob();
      return await new Promise((ok) => {
        const r = new FileReader();
        r.onload = () => {
          const dataUrl = String(r.result), probe = new Image();
          probe.onload = () => ok({ dataUrl, mimeType: blob.type || "image/jpeg", width: probe.naturalWidth, height: probe.naturalHeight });
          probe.onerror = () => ok({ dataUrl, mimeType: blob.type || "image/jpeg", width: el.naturalWidth, height: el.naturalHeight });
          probe.src = dataUrl;
        };
        r.onerror = () => ok(null);
        r.readAsDataURL(blob);
      });
    } catch {
      return source.startsWith("data:") ? { dataUrl: source, mimeType: source.slice(5, source.indexOf(";")), width: el.naturalWidth, height: el.naturalHeight } : null;
    }
  }
  var RubezhAdapter = class {
    isEmployeePage() {
      return EMPLOYEE_ROOTS.some((s) => allRoots().some((r) => r.querySelector(s))) || !!findByLabel(FIELD_LABELS.surname);
    }
    getActionAnchor() {
      for (const r of allRoots()) for (const s of ACTION_SELECTORS) {
        const e = r.querySelector(s);
        if (e) return e;
      }
      for (const r of allRoots()) {
        const buttons = Array.from(r.querySelectorAll("employee_view button,employee-view button,.employee-view button"));
        for (const button of buttons) {
          const clues = [button.textContent, button.getAttribute("title"), button.getAttribute("aria-label"), button.className, button.innerHTML].join(" ").toLowerCase();
          if (/сохран|save|floppy|disk/.test(clues)) return button;
        }
        for (const button of buttons) {
          const next = button.nextElementSibling;
          const nextClues = [next?.className, next?.innerHTML, next?.getAttribute("title")].join(" ").toLowerCase();
          if (next && /trash|delete|удал|корзин/.test(nextClues)) return button;
        }
      }
      return document.querySelector("employee_view .panel-heading,employee-view .panel-heading,.employee-view .panel-heading,employee_view header,employee-view header");
    }
    async getPhoto() {
      const candidates = [];
      for (const r of allRoots()) {
        for (const image of Array.from(r.querySelectorAll("img"))) {
          if (image.src.startsWith("data:image/jpeg") || image.src.startsWith("data:image/png")) candidates.push(image);
        }
        for (const s of PHOTO_SELECTORS) candidates.push(...Array.from(r.querySelectorAll(s)));
      }
      const unique = [...new Set(candidates)].filter((e) => !(e instanceof HTMLImageElement) || !/brand-icon|logo/i.test(e.src));
      unique.sort((a, b) => {
        const area = (e) => e instanceof HTMLImageElement ? e.naturalWidth * e.naturalHeight : e instanceof HTMLCanvasElement ? e.width * e.height : 0;
        return area(b) - area(a);
      });
      for (const e of unique) {
        const p = await imageToData(e);
        if (p) return p;
      }
      return null;
    }
    async getEmployeeData() {
      const value = (k) => clean(findByLabel(FIELD_LABELS[k])?.value || "");
      const surname = value("surname"), name = value("name"), patronymic = value("patronymic"), visitor = isVisitorPage(), comment = visitor ? visitorComment() || value("comment") : value("comment"), position = value("position") || (visitor ? comment : "");
      let passNumber;
      for (const root of allRoots()) for (const node of Array.from(root.querySelectorAll("a,span,div,td"))) {
        if (node.children.length > 2) continue;
        const match = clean(node.textContent || "").match(/(?:^|\D)(\d{6,12})\s*[-–—−]?\s*уровень\s*\d*/iu);
        if (match) {
          passNumber = match[1];
          break;
        }
      }
      if (!passNumber) {
        const body = clean(document.body.innerText);
        passNumber = body.match(/(?:^|\D)(\d{6,12})\s*[-–—−]?\s*уровень\s*\d*/iu)?.[1];
      }
      return { surname, name, patronymic, fullName: clean([surname, name, patronymic].filter(Boolean).join(" ")), employeeNumber: value("employeeNumber"), passNumber, position, department: value("department"), comment, accessProfile: value("accessProfile"), personalEntryPoint: value("personalEntryPoint"), loginUser: value("loginUser"), pin: value("pin"), vehicleNumber: value("vehicleNumber"), photo: await this.getPhoto() || void 0 };
    }
  };

  // extension-ts/content.ts
  var adapter = new RubezhAdapter();
  var MARK = "data-rubezh-pass-button";
  var passes = [["employee", "\u0421", "\u041F\u0435\u0447\u0430\u0442\u044C \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430"], ["mosn", "\u041C", "\u041F\u0435\u0447\u0430\u0442\u044C \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430 \u041C\u041E\u0421\u041D"], ["temporary", "\u0412", "\u041F\u0435\u0447\u0430\u0442\u044C \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430"]];
  function roots() {
    const result = [document];
    for (const element of Array.from(document.querySelectorAll("*"))) if (element.shadowRoot) result.push(element.shadowRoot);
    return result;
  }
  function isPersonalDataTitle(element) {
    return /^личные данные (?:сотрудника|посетителя)$/iu.test((element.textContent || "").replace(/\s+/g, " ").trim());
  }
  function saveButtonInHeader(header) {
    return Array.from(header.querySelectorAll("button")).find((button) => /сохран|save|floppy|disk|fa-save|fa-floppy|glyphicon-floppy/iu.test([button.id, button.title, button.getAttribute("aria-label"), button.className, button.innerHTML].filter(Boolean).join(" "))) || null;
  }
  function findSaveButton() {
    for (const root of roots()) {
      const exact = root.querySelector("button#save_employee_btn,button#save_visitor_btn");
      if (exact) return exact;
      for (const title of Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6"))) {
        if (!isPersonalDataTitle(title)) continue;
        const header = title.closest(".card-header,.panel-heading,header") || title.parentElement;
        const contextual = header && saveButtonInHeader(header);
        if (contextual) return contextual;
      }
    }
    return null;
  }
  function makeButton(save, type, letter, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = save.className;
    button.setAttribute(MARK, type);
    button.title = title;
    button.setAttribute("aria-label", title);
    button.textContent = letter;
    const rect = save.getBoundingClientRect();
    const computed = getComputedStyle(save);
    Object.assign(button.style, { width: rect.width ? `${rect.width}px` : computed.width, height: rect.height ? `${rect.height}px` : computed.height, minWidth: rect.width ? `${rect.width}px` : computed.minWidth, minHeight: rect.height ? `${rect.height}px` : computed.minHeight, padding: computed.padding, margin: computed.margin, border: computed.border, borderRadius: computed.borderRadius, background: computed.background, color: computed.color, fontFamily: computed.fontFamily, fontSize: computed.fontSize, fontWeight: "700", lineHeight: computed.lineHeight, verticalAlign: computed.verticalAlign, cursor: "pointer" });
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const employee = await adapter.getEmployeeData();
      if (!employee.fullName) {
        alert("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0424\u0418\u041E \u0438\u0437 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 RUBEZH STRAZH.");
        return;
      }
      await chrome.runtime.sendMessage({ type: "PRINT_PASS", passType: type, employee });
    });
    return button;
  }
  function inject() {
    const existing = document.querySelectorAll(`[${MARK}]`);
    const save = findSaveButton();
    if (!save) {
      existing.forEach((element) => element.remove());
      return;
    }
    if (existing.length === passes.length && existing[existing.length - 1].nextElementSibling === save) return;
    existing.forEach((element) => element.remove());
    for (const [type, letter, title] of passes) save.parentElement?.insertBefore(makeButton(save, type, letter, title), save);
  }
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      inject();
    });
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
  window.setInterval(schedule, 1500);
})();
