import{renderCard,renderCardPanels}from'./renderer.js';
import type{EmployeeData,PassType}from'./types.js';

const BRIDGE='http://127.0.0.1:18451';

async function directPrint(colorImageDataUrl:string,blackImageDataUrl:string){
 const response=await fetch(`${BRIDGE}/print`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({colorImageDataUrl,blackImageDataUrl})});
 const result=await response.json() as{ok?:boolean;error?:string;printer?:string};
 if(!response.ok||!result.ok)throw new Error(result.error||`Ошибка моста печати (${response.status})`);
 return result;
}

async function main(){
 const stored=await chrome.storage.session.get('printPayload');
 const payload=stored.printPayload as{employee:EmployeeData;type:PassType}|undefined;
 const status=document.querySelector<HTMLElement>('#status')!;
 const printButton=document.querySelector<HTMLButtonElement>('#confirm-print')!;
 const cancelButton=document.querySelector<HTMLButtonElement>('#cancel-print')!;
 if(!payload){status.textContent='Данные пропуска не найдены.';return}
 cancelButton.addEventListener('click',async()=>{await chrome.storage.session.remove('printPayload');window.close()});
 try{
  status.textContent='Формирование пропуска…';
  const[dataUrl,panels]=await Promise.all([renderCard(payload.type,payload.employee),renderCardPanels(payload.type,payload.employee)]);
  const image=document.querySelector<HTMLImageElement>('#card')!;
  image.src=dataUrl;
  await image.decode();
  document.title=`Пропуск — ${payload.employee.fullName}`;
  status.textContent='Проверьте данные и нажмите «Печать».';
  printButton.disabled=false;
  printButton.addEventListener('click',async()=>{
   if(printButton.disabled)return;
   printButton.disabled=true;
   cancelButton.disabled=true;
   status.textContent='Отправка на IDP SMART…';
   try{
    const result=await directPrint(panels.colorImageDataUrl,panels.blackImageDataUrl);
    status.textContent=`Задание отправлено на ${result.printer||'IDP SMART'}.`;
    await chrome.storage.session.remove('printPayload');
    window.setTimeout(()=>window.close(),900);
   }catch(error){
    const message=String(error);
    status.textContent=message.includes('Failed to fetch')?`Print Bridge не отвечает. Повторно запустите bridge\\install.cmd. (${message})`:`Ошибка IDP SMART: ${message}`;
    printButton.disabled=false;
    cancelButton.disabled=false;
   }
  });
 }catch(error){status.textContent=`Ошибка формирования пропуска: ${String(error)}`}
}

void main();
