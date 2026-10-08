import{renderCard,renderCardPanels}from'./renderer.js';
import type{EmployeeData,EmployeePhoto,PassType}from'./types.js';

const BRIDGE='http://127.0.0.1:18451';
const ALLOWED_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/bmp']);
type CardPanels=Awaited<ReturnType<typeof renderCardPanels>>;

async function directPrint(colorImageDataUrl:string,blackImageDataUrl:string,jobId:string){
 const health=await fetch(`${BRIDGE}/health`).then(response=>response.json());
 if(health.protocolVersion!==4)throw new Error('Обновите Print Bridge: запустите bridge\\install.cmd из новой версии, когда принтер не печатает. Старый мост не используется.');
 const response=await fetch(`${BRIDGE}/print`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({colorImageDataUrl,blackImageDataUrl,jobId})});
 const result=await response.json() as{ok?:boolean;error?:string;printer?:string};
 if(!response.ok||!result.ok)throw new Error(result.error||`Ошибка моста печати (${response.status})`);
 return result;
}

function readPhoto(file:File):Promise<EmployeePhoto>{
 return new Promise((resolve,reject)=>{
  if(!ALLOWED_IMAGE_TYPES.has(file.type)){reject(new Error('Выберите фотографию JPG, PNG, WebP или BMP.'));return}
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('Не удалось прочитать выбранный файл.'));
  reader.onload=()=>{
   const dataUrl=String(reader.result||'');
   const probe=new Image();
   probe.onerror=()=>reject(new Error('Выбранный файл не удалось открыть как изображение.'));
   probe.onload=()=>resolve({dataUrl,mimeType:file.type,width:probe.naturalWidth,height:probe.naturalHeight});
   probe.src=dataUrl;
  };
  reader.readAsDataURL(file);
 });
}

async function setPreview(image:HTMLImageElement,dataUrl:string){
 image.src=dataUrl;
 await image.decode();
}

async function main(){
 const payloadKey=new URLSearchParams(location.search).get('payload')||'printPayload';
 const stored=await chrome.storage.session.get(payloadKey);
 const payload=stored[payloadKey] as{employee:EmployeeData;type:PassType;sourceTabId:number}|undefined;
 const status=document.querySelector<HTMLElement>('#status')!;
 const image=document.querySelector<HTMLImageElement>('#card')!;
 const printButton=document.querySelector<HTMLButtonElement>('#confirm-print')!;
 const cancelButton=document.querySelector<HTMLButtonElement>('#cancel-print')!;
 const selectPhotoButton=document.querySelector<HTMLButtonElement>('#select-photo')!;
 const photoInput=document.querySelector<HTMLInputElement>('#photo-file')!;
 const photoName=document.querySelector<HTMLElement>('#photo-name')!;
 const identifierStep=document.querySelector<HTMLElement>('#identifier-step')!;
 const identifierSelect=document.querySelector<HTMLSelectElement>('#identifier-select')!;
 let panels:CardPanels|undefined;
 let isBusy=false;
 let printAttempted=false;
 if(!payload){status.textContent='Данные пропуска не найдены.';return}

 const requiresPhoto=payload.type==='employee'||payload.type==='mosn';
 let identifiers=Array.from(new Set(payload.employee.identifiers||[]));
 let currentCardAvailable=false;
 let selectedIdentifier=identifiers[0];
 let selectedPhoto:EmployeePhoto|undefined;
 const employeeForRender=()=>({...payload.employee,photo:selectedPhoto,passNumber:selectedIdentifier});
 const setControlsBusy=(busy:boolean)=>{
  isBusy=busy;
  cancelButton.disabled=busy;
  selectPhotoButton.disabled=busy;
  photoInput.disabled=busy;
  identifierSelect.disabled=busy;
  printButton.disabled=busy||!panels||!selectedIdentifier||!currentCardAvailable||printAttempted;
 };

 const updateIdentifierOptions=()=>{
  identifierStep.hidden=false;
  identifierSelect.replaceChildren();
  for(const id of identifiers){const option=document.createElement('option');option.value=id;option.textContent=id;identifierSelect.append(option)}
  if(!identifiers.length){const option=document.createElement('option');option.textContent='В текущей карточке нет идентификаторов';option.value='';identifierSelect.append(option)}
  identifierSelect.value=selectedIdentifier||'';
 };
 updateIdentifierOptions();
 const rerender=async()=>{
  panels=undefined; setControlsBusy(true);
  const employee=employeeForRender();
  const dataUrl=await renderCard(payload.type,employee);
  await setPreview(image,dataUrl);
 if(!requiresPhoto||selectedPhoto) panels=await renderCardPanels(payload.type,employee);
  setControlsBusy(false);
 };
 identifierSelect.addEventListener('change',async()=>{selectedIdentifier=identifierSelect.value;try{await rerender();status.textContent=requiresPhoto&&!selectedPhoto?'Выберите исходный файл фотографии. До этого печать недоступна.':'Проверьте данные и нажмите «Печать».'}catch(error){status.textContent=`Ошибка формирования пропуска: ${String(error)}`;setControlsBusy(false)}});

 const refreshIdentifiers=async()=>{
  try{
   const result=await chrome.tabs.sendMessage(payload.sourceTabId,{type:'READ_CURRENT_CARD'}) as {ok:boolean;employee:EmployeeData};
   if(!result?.ok||result.employee.fullName!==payload.employee.fullName||result.employee.employeeNumber!==payload.employee.employeeNumber)throw new Error('Исходная карточка закрыта или открыта для другого человека.');
   const next=Array.from(new Set(result.employee.identifiers||[]));
   const changed=!currentCardAvailable||JSON.stringify(next)!==JSON.stringify(identifiers);
   currentCardAvailable=true;
   if(changed){
    identifiers=next;
    if(!selectedIdentifier||!identifiers.includes(selectedIdentifier))selectedIdentifier=identifiers[0];
    updateIdentifierOptions();
    await rerender();
    status.textContent=!selectedIdentifier?'Добавьте идентификатор в карточку RUBEZH. Он появится здесь автоматически.':requiresPhoto&&!selectedPhoto?'Выберите исходный файл фотографии. До этого печать недоступна.':'Идентификаторы обновлены. Проверьте пропуск и нажмите «Печать».';
   }
   return !changed;
  }catch(error){currentCardAvailable=false;setControlsBusy(false);status.textContent=`Не удалось проверить текущую карточку. Вернитесь к ней в RUBEZH. ${String(error)}`;return false}
 };
 cancelButton.addEventListener('click',async()=>{await chrome.storage.session.remove(payloadKey);window.close()});
 selectPhotoButton.addEventListener('click',()=>{
  if(isBusy)return;
  photoInput.value='';
  photoInput.click();
 });
 photoInput.addEventListener('change',async()=>{
  const file=photoInput.files?.[0];
  if(!file)return;
  setControlsBusy(true);
  status.textContent='Добавление фотографии в пропуск…';
  try{
   const photo=await readPhoto(file);
   selectedPhoto=photo;
   await rerender();
   photoName.textContent=file.name;
   selectPhotoButton.textContent='Заменить фото';
   status.textContent='Фото добавлено. Проверьте пропуск и нажмите «Печать».';
  }catch(error){
   photoName.textContent='Фото не выбрано';
   status.textContent=`Ошибка фотографии: ${String(error)}`;
  }finally{setControlsBusy(false)}
 });
 printButton.addEventListener('click',async()=>{
  if(isBusy||!panels||printAttempted)return;
  setControlsBusy(true);
  if(!await refreshIdentifiers()||!currentCardAvailable||!selectedIdentifier){setControlsBusy(false);return}
  setControlsBusy(true);
  printAttempted=true;
  status.textContent='Печать на IDP SMART… Дождитесь завершения задания.';
  try{
   const result=await directPrint(panels.colorImageDataUrl,panels.blackImageDataUrl,payloadKey);
   status.textContent=`Печать завершена на ${result.printer||'IDP SMART'}.`;
   await chrome.storage.session.remove(payloadKey);
   window.setTimeout(()=>window.close(),900);
  }catch(error){
   const message=String(error);
   status.textContent=`Печать не подтверждена. Проверьте дисплей принтера и карточку; не отправляйте её повторно вслепую. ${message}`;
   setControlsBusy(false);
  }
 });

 try{
  document.title=`Пропуск — ${payload.employee.fullName}`;
  status.textContent=requiresPhoto?'Формирование пропуска без фотографии…':'Формирование пропуска…';
  await setPreview(image,await renderCard(payload.type,employeeForRender()));
  if(requiresPhoto){
   selectPhotoButton.hidden=false;
   photoName.hidden=false;
   status.textContent='Выберите исходный файл фотографии. До этого печать недоступна.';
  }else{
   panels=await renderCardPanels(payload.type,employeeForRender());
   status.textContent='Проверьте данные и нажмите «Печать».';
   setControlsBusy(false);
  }
  await refreshIdentifiers();
  window.setInterval(()=>{if(!isBusy&&!printAttempted)void refreshIdentifiers()},2000);
 }catch(error){status.textContent=`Ошибка формирования пропуска: ${String(error)}`}
}

void main();
