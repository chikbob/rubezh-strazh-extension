"use strict";
document.querySelector('#settings').onclick = () => chrome.runtime.openOptionsPage();
document.querySelector('#instructions').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('src/help.html') });
