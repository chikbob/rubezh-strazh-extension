document.querySelector<HTMLButtonElement>('#settings')!.onclick=()=>chrome.runtime.openOptionsPage();
document.querySelector<HTMLButtonElement>('#instructions')!.onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('src/help.html')});
