import{RubezhAdapter}from'./adapter.js';import type{PassType}from'./types.js';
const adapter=new RubezhAdapter(),MARK='data-rubezh-pass-button';
const passes:[PassType,string,string][]=[['employee','С','Печать пропуска сотрудника'],['mosn','М','Печать пропуска МОСН'],['temporary','В','Печать временного пропуска']];

function roots():ParentNode[]{const result:ParentNode[]=[document];for(const element of Array.from(document.querySelectorAll('*')))if(element.shadowRoot)result.push(element.shadowRoot);return result}
function clues(element:Element|null){return element?[element.getAttribute('title'),element.getAttribute('aria-label'),element.getAttribute('class'),element.innerHTML,element.textContent].filter(Boolean).join(' ').toLowerCase():''}
function isDelete(button:Element|null){return !!button&&/trash|delete|remove|удал|корзин|fa-trash|glyphicon-trash/.test(clues(button))}
function isSave(button:Element|null){return !!button&&/save|сохран|floppy|disk|fa-save|fa-floppy|glyphicon-floppy/.test(clues(button))}
function buttonsIn(root:ParentNode){return Array.from(root.querySelectorAll('button,input[type="button"],input[type="submit"]')) as HTMLElement[]}

function findSaveButton():HTMLElement|null{
 const exact=document.querySelector<HTMLElement>('button#save_employee_btn');if(exact)return exact;
 for(const root of roots())for(const button of buttonsIn(root))if(isSave(button))return button;
 for(const root of roots())for(const deleteButton of buttonsIn(root).filter(isDelete)){
  const previous=deleteButton.previousElementSibling;
  if(previous instanceof HTMLElement&&previous.matches('button,input[type="button"],input[type="submit"]'))return previous;
  const siblings=Array.from(deleteButton.parentElement?.children||[]);const index=siblings.indexOf(deleteButton);const candidate=siblings[index-1];if(candidate instanceof HTMLElement&&candidate.matches('button,input[type="button"],input[type="submit"]'))return candidate;
 }
 return null;
}

function makeButton(save:HTMLElement,type:PassType,letter:string,title:string){
 const button=document.createElement('button');button.type='button';button.className=save.className;button.setAttribute(MARK,type);button.title=title;button.setAttribute('aria-label',title);button.textContent=letter;
 const rect=save.getBoundingClientRect();const computed=getComputedStyle(save);Object.assign(button.style,{width:rect.width?`${rect.width}px`:computed.width,height:rect.height?`${rect.height}px`:computed.height,minWidth:rect.width?`${rect.width}px`:computed.minWidth,minHeight:rect.height?`${rect.height}px`:computed.minHeight,padding:computed.padding,margin:computed.margin,border:computed.border,borderRadius:computed.borderRadius,background:computed.background,color:computed.color,fontFamily:computed.fontFamily,fontSize:computed.fontSize,fontWeight:'700',lineHeight:computed.lineHeight,verticalAlign:computed.verticalAlign,cursor:'pointer'});
 button.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();const employee=await adapter.getEmployeeData();if(!employee.fullName){alert('Не удалось получить ФИО из карточки RUBEZH STRAZH.');return}await chrome.runtime.sendMessage({type:'PRINT_PASS',passType:type,employee})});return button;
}

function inject(){
 const existing=document.querySelectorAll(`[${MARK}]`);const save=findSaveButton();
 if(!save){existing.forEach(element=>element.remove());return}
 if(existing.length===passes.length&&existing[existing.length-1].nextElementSibling===save)return;
 existing.forEach(element=>element.remove());
 for(const[type,letter,title]of passes)save.parentElement?.insertBefore(makeButton(save,type,letter,title),save);
}

let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;inject()})}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});schedule();window.setInterval(schedule,1500);
