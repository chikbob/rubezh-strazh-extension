import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('color panel is cropped to the half-card ink region; black and preview stay full-card',async()=>{
 const canvases=[];
 const context=vm.createContext({
  chrome:{runtime:{getURL:path=>path}},
  normalizePosition:(_ctx,value)=>({fontSize:40,lines:[value]}),
  Image:class{naturalWidth=400;naturalHeight=600;set src(value){this.source=value;queueMicrotask(()=>this.onload())}},
  document:{createElement:()=>{
   const canvas={width:0,height:0,calls:[],getContext(){return this.ctx},toDataURL(){return `panel:${this.width}x${this.height}`}};
   canvas.ctx={save(){},restore(){},fillRect(){},strokeText(...args){canvas.calls.push(['text',...args])},fillText(){},measureText(value){return{width:value.length*15}},drawImage(...args){canvas.calls.push(['image',...args])}};
   canvases.push(canvas);return canvas;
  }}
 });
 const source=fs.readFileSync(new URL('../extension-ts/renderer.ts',import.meta.url),'utf8').replace(/import.*?;/g,'').replace(/export /g,'');
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
 const employee={surname:'Иванов',name:'Иван',patronymic:'Иванович',position:'Врач',passNumber:'389369658',photo:{dataUrl:'source-photo'}};
 for(const type of ['employee','mosn','temporary']){
  context.kind=type;context.employee=employee;
  const panels=await vm.runInContext('renderCardPanels(kind,employee)',context);
  assert.equal(panels.colorImageDataUrl,'panel:440x554');
  assert.equal(panels.blackImageDataUrl,'panel:1012x638');
  const cropped=canvases.at(-1);assert.deepEqual(cropped.calls[0].slice(2),[0,84,440,554,0,0,440,554]);
  assert.equal(canvases.at(-3).calls.some(call=>call[0]==='text'),false,'YMC must not contain black text');
  assert.ok(canvases.at(-2).calls.some(call=>call[0]==='text'&&call[1]==='389369658'));
  assert.equal(await vm.runInContext('renderCard(kind,employee)',context),'panel:1012x638');
 }
});
