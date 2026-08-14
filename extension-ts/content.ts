import{RubezhAdapter}from'./adapter.js';import type{PassType}from'./types.js';
const adapter=new RubezhAdapter(),MARK='data-rubezh-pass-button';
const passes:[PassType,string,string][]=[['employee','С','Печать пропуска сотрудника'],['mosn','М','Печать пропуска МОСН'],['temporary','В','Печать временного пропуска']];

function roots():ParentNode[]{const result:ParentNode[]=[document];for(const element of Array.from(document.querySelectorAll('*')))if(element.shadowRoot)result.push(element.shadowRoot);return result}
function isPersonalDataTitle(element:Element){return /^личные данные (?:сотрудника|посетителя)$/iu.test((element.textContent||'').replace(/\s+/g,' ').trim())}
function saveButtonInHeader(header:Element){return Array.from(header.querySelectorAll<HTMLElement>('button')).find(button=>/сохран|save|floppy|disk|fa-save|fa-floppy|glyphicon-floppy/iu.test([button.id,button.title,button.getAttribute('aria-label'),button.className,button.innerHTML].filter(Boolean).join(' ')))||null}
function findSaveButton():HTMLElement|null{
 // RUBEZH uses stable ids only for the employee/visitor card Save actions.
 // Heuristics based on a neighbouring Delete button are unsafe: the same
 // action pattern occurs in tables, identifier lists and biometric controls.
 for(const root of roots()){
  const exact=root.querySelector<HTMLElement>('button#save_employee_btn,button#save_visitor_btn');
  if(exact)return exact;
  for(const title of Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'))){
   if(!isPersonalDataTitle(title))continue;
   const header=title.closest('.card-header,.panel-heading,header')||title.parentElement;
   const contextual=header&&saveButtonInHeader(header);
   if(contextual)return contextual;
  }
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
