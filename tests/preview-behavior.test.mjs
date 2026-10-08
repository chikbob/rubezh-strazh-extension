import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
const employee={fullName:'Иван Иванов',surname:'Иванов',name:'Иван',employeeNumber:'01057',identifiers:['389369658']};
const code=ts.transpileModule(fs.readFileSync(new URL('../extension-ts/print.ts',import.meta.url),'utf8').replace(/\r?\n/g,'\r\n').replace(/^import[^\n]*(?:\n|$)/gm,'').replace('void main();','window.started=main();'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
async function preview(type='temporary'){
 const dom=new JSDOM(fs.readFileSync(new URL('../src/print.html',import.meta.url),'utf8'),{url:'https://extension.test/print.html?payload=printPayload-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',runScripts:'outside-only'});
 const w=dom.window,rendered=[],requests=[];
 let snapshot=structuredClone(employee),protocolVersion=2;
 w.HTMLImageElement.prototype.decode=async()=>{};
 w.renderCard=async(type,data)=>{rendered.push(structuredClone(data));return 'data:image/png;base64,AA=='};
 w.renderCardPanels=async()=>({colorImageDataUrl:'color',blackImageDataUrl:'black'});
 w.chrome={storage:{session:{get:async key=>({[key]:{employee:structuredClone(employee),type,sourceTabId:42}}),remove:async()=>{}}},tabs:{sendMessage:async id=>{assert.equal(id,42);return{ok:true,employee:structuredClone(snapshot)}}}};
 w.fetch=async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>url.endsWith('/health')?{protocolVersion}:{ok:true,printer:'SMART-51'}}};
 w.setInterval=fn=>{w.poll=fn};w.setTimeout=()=>{};
 w.eval(code);await w.started;
 return{dom,w,rendered,requests,setSnapshot(value){snapshot=value},setProtocol(value){protocolVersion=value}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
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
test('old bridge is never sent cropped panel data',async()=>{
 const p=await preview();p.setProtocol(1);p.w.document.querySelector('#confirm-print').click();await waitFor(()=>p.requests.length===1);await settle();
 assert.ok(p.requests[0].url.endsWith('/health'));assert.equal(p.w.document.querySelector('#confirm-print').disabled,true);p.dom.window.close();
});
