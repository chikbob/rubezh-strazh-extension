import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
const employee={fullName:'Иван Иванов',surname:'Иванов',name:'Иван',employeeNumber:'01057',identifiers:['389369658']};
const code=ts.transpileModule(fs.readFileSync(new URL('../extension-ts/print.ts',import.meta.url),'utf8').replace(/\r?\n/g,'\r\n').replace(/^import[^\n]*(?:\n|$)/gm,'').replace('void main();','window.started=main();'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
async function preview(type='temporary',extra={}){
 const dom=new JSDOM(fs.readFileSync(new URL('../src/print.html',import.meta.url),'utf8'),{url:'https://extension.test/print.html?payload=printPayload-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',runScripts:'outside-only'});
 const w=dom.window,rendered=[],requests=[];
 const person={...structuredClone(employee),...extra};
 let snapshot=structuredClone(person),protocolVersion=9,previewError=false,locked=false,recoveryFails=false;
 w.FileReader=class{readAsDataURL(){this.result='data:image/png;base64,AA==';this.onload()}};
 w.Image=class{naturalWidth=386;naturalHeight=502;set src(value){this.onload()}};
 w.HTMLImageElement.prototype.decode=async()=>{};
 w.renderCard=async(type,data)=>{rendered.push(structuredClone(data));return 'data:image/png;base64,AA=='};
 w.renderCardObjects=async()=>({objects:[{kind:'text',text:'Иванов'}]});
 w.renderNativePhoto=async()=> 'data:image/png;base64,AA==';
 w.prepareNativePosition=input=>({text:input,fits:input.length<60,changed:false});
 w.chrome={storage:{session:{get:async key=>({[key]:{employee:structuredClone(person),type,sourceTabId:42}}),remove:async()=>{}}},tabs:{sendMessage:async id=>{assert.equal(id,42);return{ok:true,employee:structuredClone(snapshot)}}}};
 w.fetch=async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>{if(url.endsWith('/health'))return{protocolVersion,recoverySupported:true};if(url.endsWith('/recover')){if(recoveryFails)return{ok:false,error:'Printer busy'};locked=false;return{ok:true}}if(locked)return{ok:false,error:'Previous print was not confirmed.'};return url.endsWith('/preview')?(previewError?{ok:false,error:'Invalid CSD'}:{ok:true,previewDataUrl:'data:image/png;base64,U0RL'}):{ok:true,printer:'SMART-51'}}};};
 w.setInterval=fn=>{w.poll=fn};w.setTimeout=()=>{};
 w.eval(code);await w.started;
 return{dom,w,rendered,requests,setSnapshot(value){snapshot=value},setProtocol(value){protocolVersion=value},failPreview(){previewError=true},lock(value=true){locked=value},failRecovery(){recoveryFails=true}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('operator recovery after Cancel rebuilds preview but never sends a print',async()=>{
 const p=await preview('employee');p.lock();await attachPhoto(p);
 const button=p.w.document.querySelector('#check-printer'),ack=p.w.document.querySelector('#recovery-ack');
 assert.equal(button.parentElement.hidden,false);assert.equal(button.disabled,true);
 button.click();await settle();assert.equal(p.requests.some(r=>r.url.endsWith('/recover')),false);
 ack.checked=true;ack.dispatchEvent(new p.w.Event('change'));button.click();
 await waitFor(()=>!p.w.document.querySelector('#confirm-print').disabled);
 assert.equal(p.requests.filter(r=>r.url.endsWith('/recover')).length,1);
 assert.deepEqual(JSON.parse(p.requests.find(r=>r.url.endsWith('/recover')).options.body),{confirmedCardRemoved:true});
 assert.equal(p.requests.filter(r=>r.url.endsWith('/print')).length,0);p.dom.window.close();
});
test('busy printer recovery cannot unlock printing or resend a failed job',async()=>{
 const p=await preview('employee');await attachPhoto(p);p.lock();
 p.w.document.querySelector('#confirm-print').click();await waitFor(()=>p.w.document.querySelector('#check-printer').parentElement.hidden===false);await settle();
 p.failRecovery();const ack=p.w.document.querySelector('#recovery-ack');ack.checked=true;ack.dispatchEvent(new p.w.Event('change'));p.w.document.querySelector('#check-printer').click();
 await waitFor(()=>p.w.document.querySelector('#status').textContent.includes('Printer busy'));
 assert.equal(p.w.document.querySelector('#confirm-print').disabled,true);
 assert.equal(p.requests.filter(r=>r.url.endsWith('/print')).length,1);p.dom.window.close();
});
test('successful recovery also keeps the old attempted job permanently disabled',async()=>{
 const p=await preview('employee');await attachPhoto(p);p.lock();
 p.w.document.querySelector('#confirm-print').click();await waitFor(()=>!p.w.document.querySelector('#check-printer').parentElement.hidden);await settle();
 const ack=p.w.document.querySelector('#recovery-ack');ack.checked=true;ack.dispatchEvent(new p.w.Event('change'));p.w.document.querySelector('#check-printer').click();
 await waitFor(()=>p.w.document.querySelector('#status').textContent.includes('Старое задание не повторяется'));
 p.w.document.querySelector('#confirm-print').click();await settle();
 assert.equal(p.w.document.querySelector('#confirm-print').disabled,true);
 assert.equal(p.requests.filter(r=>r.url.endsWith('/print')).length,1);p.dom.window.close();
});
async function waitFor(condition){for(let i=0;i<30;i++){if(condition())return;await settle()}assert.ok(condition())}
test('new code refreshes an open preview and is sent only after confirmation',async()=>{
 const p=await preview();const button=p.w.document.querySelector('#confirm-print');
 assert.equal(button.disabled,false);assert.equal(p.requests.length,0);
 p.setSnapshot({...employee,identifiers:['123456789','987654321']});p.w.poll();
 await waitFor(()=>p.rendered.at(-1).passNumber==='123456789');await settle();
 const select=p.w.document.querySelector('#identifier-select');assert.equal(select.options.length,2);
 select.value='987654321';select.dispatchEvent(new p.w.Event('change'));await settle();
 button.click();await waitFor(()=>p.requests.length===2);
 assert.equal(p.rendered.at(-1).passNumber,'987654321');
 assert.equal(JSON.parse(p.requests[1].options.body).jobId,'printPayload-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
 assert.equal(/[\u0080-\uffff]/.test(p.requests[1].options.body),false,'HTTP body must have byte-safe escaped Cyrillic');
 assert.equal(JSON.parse(p.requests[1].options.body).objects[0].text,'Иванов');
 button.click();await settle();assert.equal(p.requests.length,2);p.dom.window.close();
});
test('missing code and changed person block printing without using stale passNumber',async()=>{
 const p=await preview();p.setSnapshot({...employee,identifiers:[],passNumber:'999999999'});p.w.poll();
 await waitFor(()=>p.w.document.querySelector('#confirm-print').disabled);
 assert.equal(p.w.document.querySelector('#identifier-select').value,'');
 p.setSnapshot({...employee,fullName:'Другой человек'});p.w.poll();await settle();
 p.w.document.querySelector('#confirm-print').click();assert.equal(p.requests.length,0);p.dom.window.close();
});
test('employee and MOSN require a source photo; temporary does not',async()=>{
 for(const type of ['employee','mosn','temporary']){
  const p=await preview(type);assert.equal(p.w.document.querySelector('#confirm-print').disabled,type!=='temporary');
  assert.equal(p.w.document.querySelector('#select-photo').hidden,type==='temporary');
  assert.equal(p.rendered.every(data=>!data.photo),true);p.dom.window.close();
 }
});
test('old bridge is never sent incompatible full-card panel data',async()=>{
 const p=await preview();p.setProtocol(2);p.w.document.querySelector('#confirm-print').click();await waitFor(()=>p.requests.length===1);await settle();
 assert.ok(p.requests[0].url.endsWith('/health'));assert.equal(p.w.document.querySelector('#confirm-print').disabled,true);p.dom.window.close();
});
async function attachPhoto(p){
 const input=p.w.document.querySelector('#photo-file');
 Object.defineProperty(input,'files',{value:[new p.w.File(['photo'],'source.png',{type:'image/png'})],configurable:true});
 input.dispatchEvent(new p.w.Event('change'));
 await waitFor(()=>p.requests.some(r=>r.url.endsWith('/preview')));await settle();
}
test('C/M show the SDK CSD preview before enabling a single explicit print',async()=>{
 for(const type of ['employee','mosn']){
  const p=await preview(type);await attachPhoto(p);
  const button=p.w.document.querySelector('#confirm-print');assert.equal(button.disabled,false);
  assert.equal(p.w.document.querySelector('#card').src,'data:image/png;base64,U0RL');
  assert.equal(p.requests.filter(r=>r.url.endsWith('/print')).length,0);
  const prepared=JSON.parse(p.requests.find(r=>r.url.endsWith('/preview')).options.body);
  assert.equal(prepared.passType,type);assert.equal(prepared.passNumber,employee.identifiers[0]);
  assert.equal(prepared.photoDataUrl,'data:image/png;base64,AA==');assert.equal(prepared.objects,undefined);
  button.click();await waitFor(()=>p.requests.some(r=>r.url.endsWith('/print')));await settle();
  const printed=JSON.parse(p.requests.find(r=>r.url.endsWith('/print')).options.body);
  delete printed.jobId;assert.deepEqual(printed,prepared);
  button.click();await settle();assert.equal(p.requests.filter(r=>r.url.endsWith('/print')).length,1);p.dom.window.close();
 }
});
test('failed native CSD preview leaves printing disabled and sends no print',async()=>{
 const p=await preview('employee');p.failPreview();await attachPhoto(p);
 assert.equal(p.w.document.querySelector('#confirm-print').disabled,true);
 p.w.document.querySelector('#confirm-print').click();await settle();
 assert.equal(p.requests.filter(r=>r.url.endsWith('/print')).length,0);p.dom.window.close();
});
test('position edits invalidate the old preview and apply without changing source data',async()=>{
 const p=await preview('employee');await attachPhoto(p);
 const input=p.w.document.querySelector('#position-text'),button=p.w.document.querySelector('#confirm-print');
 input.value='Зам. глав. врача по экон. вопр.';input.dispatchEvent(new p.w.Event('input'));
 assert.equal(button.disabled,true);button.click();await settle();
 assert.equal(p.requests.filter(r=>r.url.endsWith('/print')).length,0);
 p.w.document.querySelector('#apply-position').click();
 await waitFor(()=>p.requests.filter(r=>r.url.endsWith('/preview')).length===2);await settle();
 assert.equal(button.disabled,false);
 assert.equal(JSON.parse(p.requests.filter(r=>r.url.endsWith('/preview')).at(-1).options.body).position,input.value);
 assert.equal(employee.position,undefined);
 input.value='Очень длинная неизвестная должность '.repeat(5);input.dispatchEvent(new p.w.Event('input'));
 p.w.document.querySelector('#apply-position').click();await settle();
 assert.equal(button.disabled,true);assert.equal(p.requests.filter(r=>r.url.endsWith('/preview')).length,2);
 assert.match(p.w.document.querySelector('#status').textContent,/не помещается/);p.dom.window.close();
});
test('MOSN uses the editable comment and sends two lines unchanged to native preview/print',async()=>{
 const p=await preview('mosn',{comment:'Комментарий\nПродолжение',position:'Должность сотрудника'});await attachPhoto(p);
 assert.equal(p.w.document.querySelector('label[for="position-text"]').textContent,'Комментарий на пропуске МОСН');
 assert.equal(p.w.document.querySelector('#position-text').tagName,'TEXTAREA');
 assert.equal(JSON.parse(p.requests.find(r=>r.url.endsWith('/preview')).options.body).position,'Комментарий\nПродолжение');
 p.w.document.querySelector('#confirm-print').click();await waitFor(()=>p.requests.some(r=>r.url.endsWith('/print')));
 assert.equal(JSON.parse(p.requests.find(r=>r.url.endsWith('/print')).options.body).position,'Комментарий\nПродолжение');p.dom.window.close();
});
