import type{EmployeeData,PassType}from'./types.js';
chrome.runtime.onMessage.addListener((message:any,sender:any,reply:(value:any)=>void)=>{
 if(message.type!=='PRINT_PASS')return false;
 (async()=>{const key=`printPayload-${crypto.randomUUID()}`;const payload:{employee:EmployeeData;type:PassType;sourceTabId:number}={employee:message.employee,type:message.passType,sourceTabId:sender.tab.id};await chrome.storage.session.set({[key]:payload});try{await chrome.windows.create({url:chrome.runtime.getURL(`src/print.html?payload=${key}`),type:'popup',width:900,height:760})}catch(error){await chrome.storage.session.remove(key);throw error}return{ok:true}})().then(reply).catch(error=>reply({ok:false,error:String(error)}));
 return true;
});
