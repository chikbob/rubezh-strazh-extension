import{renderCard,renderCardPanels}from'./renderer.js';
import type{EmployeeData,EmployeePhoto,PassType}from'./types.js';

const BRIDGE='http://127.0.0.1:18451';
const ALLOWED_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/bmp']);
type CardPanels=Awaited<ReturnType<typeof renderCardPanels>>;

async function directPrint(colorImageDataUrl:string,blackImageDataUrl:string){
 const response=await fetch(`${BRIDGE}/print`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({colorImageDataUrl,blackImageDataUrl})});
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
 const stored=await chrome.storage.session.get('printPayload');
 const payload=stored.printPayload as{employee:EmployeeData;type:PassType}|undefined;
 const status=document.querySelector<HTMLElement>('#status')!;
 const image=document.querySelector<HTMLImageElement>('#card')!;
 const printButton=document.querySelector<HTMLButtonElement>('#confirm-print')!;
 const cancelButton=document.querySelector<HTMLButtonElement>('#cancel-print')!;
 const selectPhotoButton=document.querySelector<HTMLButtonElement>('#select-photo')!;
 const photoInput=document.querySelector<HTMLInputElement>('#photo-file')!;
 const photoName=document.querySelector<HTMLElement>('#photo-name')!;
 let panels:CardPanels|undefined;
 let isBusy=false;
 if(!payload){status.textContent='Данные пропуска не найдены.';return}

 const requiresPhoto=payload.type==='employee'||payload.type==='mosn';
 const employeeWithoutPhoto:EmployeeData={...payload.employee,photo:undefined};
 const setControlsBusy=(busy:boolean)=>{
  isBusy=busy;
  cancelButton.disabled=busy;
  selectPhotoButton.disabled=busy;
  photoInput.disabled=busy;
  printButton.disabled=busy||!panels;
 };

 cancelButton.addEventListener('click',async()=>{await chrome.storage.session.remove('printPayload');window.close()});
 selectPhotoButton.addEventListener('click',()=>{
  if(isBusy)return;
  photoInput.value='';
  photoInput.click();
 });
 photoInput.addEventListener('change',async()=>{
  const file=photoInput.files?.[0];
  if(!file)return;
  panels=undefined;
  setControlsBusy(true);
  status.textContent='Добавление фотографии в пропуск…';
  try{
   const photo=await readPhoto(file);
   const employee={...employeeWithoutPhoto,photo};
   const[dataUrl,nextPanels]=await Promise.all([renderCard(payload.type,employee),renderCardPanels(payload.type,employee)]);
   await setPreview(image,dataUrl);
   panels=nextPanels;
   photoName.textContent=file.name;
   selectPhotoButton.textContent='Заменить фото';
   status.textContent='Фото добавлено. Проверьте пропуск и нажмите «Печать».';
  }catch(error){
   photoName.textContent='Фото не выбрано';
   status.textContent=`Ошибка фотографии: ${String(error)}`;
  }finally{setControlsBusy(false)}
 });
 printButton.addEventListener('click',async()=>{
  if(isBusy||!panels)return;
  setControlsBusy(true);
  status.textContent='Отправка на IDP SMART…';
  try{
   const result=await directPrint(panels.colorImageDataUrl,panels.blackImageDataUrl);
   status.textContent=`Задание отправлено на ${result.printer||'IDP SMART'}.`;
   await chrome.storage.session.remove('printPayload');
   window.setTimeout(()=>window.close(),900);
  }catch(error){
   const message=String(error);
   status.textContent=message.includes('Failed to fetch')?`Print Bridge не отвечает. Повторно запустите bridge\\install.cmd. (${message})`:`Ошибка IDP SMART: ${message}`;
   setControlsBusy(false);
  }
 });

 try{
  document.title=`Пропуск — ${payload.employee.fullName}`;
  status.textContent=requiresPhoto?'Формирование пропуска без фотографии…':'Формирование пропуска…';
  await setPreview(image,await renderCard(payload.type,employeeWithoutPhoto));
  if(requiresPhoto){
   selectPhotoButton.hidden=false;
   photoName.hidden=false;
   status.textContent='Выберите исходный файл фотографии. До этого печать недоступна.';
  }else{
   panels=await renderCardPanels(payload.type,employeeWithoutPhoto);
   status.textContent='Проверьте данные и нажмите «Печать».';
   printButton.disabled=false;
  }
 }catch(error){status.textContent=`Ошибка формирования пропуска: ${String(error)}`}
}

void main();
