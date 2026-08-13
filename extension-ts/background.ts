import type{EmployeeData,PassType}from'./types.js';
chrome.runtime.onMessage.addListener((message:any,_sender:any,reply:(value:any)=>void)=>{
 if(message.type!=='PRINT_PASS')return false;
 (async()=>{const payload:{employee:EmployeeData;type:PassType}={employee:message.employee,type:message.passType};await chrome.storage.session.set({printPayload:payload});await chrome.windows.create({url:chrome.runtime.getURL('src/print.html'),type:'popup',width:900,height:760});return{ok:true}})().then(reply).catch(error=>reply({ok:false,error:String(error)}));
 return true;
});
