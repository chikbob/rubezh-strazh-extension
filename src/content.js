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
    const roots = [document];
    document.querySelectorAll("*").forEach((e) => {
      if (e.shadowRoot) roots.push(e.shadowRoot);
    });
    return roots;
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
  async function imageToData(el) {
    if (el instanceof HTMLCanvasElement) {
      try {
        return { dataUrl: el.toDataURL("image/png"), mimeType: "image/png", width: el.width, height: el.height };
      } catch {
        return null;
      }
    }
    if (!(el instanceof HTMLImageElement) || !el.src) return null;
    try {
      const res = await fetch(el.currentSrc || el.src, { credentials: "include" });
      const blob = await res.blob();
      return await new Promise((ok) => {
        const r = new FileReader();
        r.onload = () => ok({ dataUrl: String(r.result), mimeType: blob.type || "image/jpeg", width: el.naturalWidth, height: el.naturalHeight });
        r.onerror = () => ok(null);
        r.readAsDataURL(blob);
      });
    } catch {
      return el.src.startsWith("data:") ? { dataUrl: el.src, mimeType: el.src.slice(5, el.src.indexOf(";")), width: el.naturalWidth, height: el.naturalHeight } : null;
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
        const buttons2 = Array.from(r.querySelectorAll("employee_view button,employee-view button,.employee-view button"));
        for (const button of buttons2) {
          const clues = [button.textContent, button.getAttribute("title"), button.getAttribute("aria-label"), button.className, button.innerHTML].join(" ").toLowerCase();
          if (/сохран|save|floppy|disk/.test(clues)) return button;
        }
        for (const button of buttons2) {
          const next = button.nextElementSibling;
          const nextClues = [next?.className, next?.innerHTML, next?.getAttribute("title")].join(" ").toLowerCase();
          if (next && /trash|delete|удал|корзин/.test(nextClues)) return button;
        }
      }
      return document.querySelector("employee_view .panel-heading,employee-view .panel-heading,.employee-view .panel-heading,employee_view header,employee-view header");
    }
    async getPhoto() {
      for (const r of allRoots()) for (const s of PHOTO_SELECTORS) {
        const e = r.querySelector(s);
        if (e) {
          const p = await imageToData(e);
          if (p) return p;
        }
      }
      return null;
    }
    async getEmployeeData() {
      const value = (k) => clean(findByLabel(FIELD_LABELS[k])?.value || "");
      const surname = value("surname"), name = value("name"), patronymic = value("patronymic");
      return { surname, name, patronymic, fullName: clean([surname, name, patronymic].filter(Boolean).join(" ")), employeeNumber: value("employeeNumber"), position: value("position"), department: value("department"), comment: value("comment"), accessProfile: value("accessProfile"), personalEntryPoint: value("personalEntryPoint"), loginUser: value("loginUser"), pin: value("pin"), vehicleNumber: value("vehicleNumber"), photo: await this.getPhoto() || void 0 };
    }
  };

  // extension-ts/types.ts
  var DEFAULT_SETTINGS = { allowedOrigin: "http://10.250.225.16", debug: false };

  // extension-ts/content.ts
  var adapter = new RubezhAdapter();
  var ID = "rubezh-pass-print-actions";
  var buttons = [["employee", "\u041F\u0435\u0447\u0430\u0442\u044C: \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A"], ["mosn", "\u041F\u0435\u0447\u0430\u0442\u044C: \u041C\u041E\u0421\u041D"], ["temporary", "\u041F\u0435\u0447\u0430\u0442\u044C: \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0439"]];
  async function print(type) {
    const employee = await adapter.getEmployeeData();
    if (!employee.fullName) {
      alert("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0424\u0418\u041E \u0438\u0437 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 RUBEZH STRAZH.");
      return;
    }
    await chrome.runtime.sendMessage({ type: "PRINT_PASS", passType: type, employee });
  }
  async function inject() {
    if (!adapter.isEmployeePage() || document.getElementById(ID)) return;
    const settings = { ...DEFAULT_SETTINGS, ...await chrome.storage.local.get(DEFAULT_SETTINGS) };
    if (location.origin !== new URL(settings.allowedOrigin).origin) return;
    const anchor = adapter.getActionAnchor();
    if (!anchor) {
      if (settings.debug) console.warn("[RUBEZH Pass Printer] \u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u043D\u0430\u0439\u0434\u0435\u043D\u0430, \u043D\u043E \u043A\u043D\u043E\u043F\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430.");
      return;
    }
    const group = document.createElement("span");
    group.id = ID;
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "\u041F\u0435\u0447\u0430\u0442\u044C \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430");
    Object.assign(group.style, { display: "inline-flex", gap: "6px", margin: "0 6px", verticalAlign: "middle", flexWrap: "wrap" });
    for (const [type, label] of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.passType = type;
      Object.assign(button.style, { padding: "7px 10px", border: "1px solid #2475a7", borderRadius: "3px", background: "#fff", color: "#2475a7", cursor: "pointer", font: "inherit", whiteSpace: "nowrap" });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void print(type);
      });
      group.append(button);
    }
    if (anchor.matches("button")) anchor.insertAdjacentElement("afterend", group);
    else anchor.append(group);
    if (settings.debug) console.info("[RUBEZH Pass Printer] \u041A\u043D\u043E\u043F\u043A\u0438 \u043F\u0435\u0447\u0430\u0442\u0438 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B.", { root: document.querySelector("employee_view,employee-view"), anchor });
  }
  var scheduled = false;
  var schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      void inject();
    });
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
