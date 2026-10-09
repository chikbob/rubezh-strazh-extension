import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {execFileSync} from 'node:child_process';
test('popup opens bundled working instructions in a new tab',()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../src/popup.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),calls=[];
 dom.window.chrome={runtime:{getURL:path=>'chrome-extension://test/'+path,openOptionsPage:()=>{}},tabs:{create:arg=>calls.push(arg)}};
 const source=fs.readFileSync(new URL('../extension-ts/popup.ts',import.meta.url),'utf8');
 dom.window.eval(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText);
 dom.window.document.querySelector('#instructions').click();
 assert.equal(calls.length,1);assert.equal(calls[0].url,'chrome-extension://test/src/help.html');dom.window.close();
});
test('both offline guides have working anchors, local screenshot illustrations and no runtime scripts',()=>{
 for(const name of ['help','install']){
  const file=new URL('../src/'+name+'.html',import.meta.url),html=fs.readFileSync(file,'utf8'),dom=new JSDOM(html);
  assert.equal(dom.window.document.querySelectorAll('script').length,0);
  assert.ok(dom.window.document.querySelectorAll('section').length>=6);
  for(const img of dom.window.document.querySelectorAll('img')){
   assert.ok(img.alt.length>12);assert.ok(fs.existsSync(new URL(img.getAttribute('src'),file)));
   assert.equal(img.parentElement.target,'_blank');assert.equal(img.parentElement.rel,'noopener');
  }
  for(const a of dom.window.document.querySelectorAll('a')){
   const href=a.getAttribute('href');if(href.startsWith('http'))continue;
   const target=new URL(href,file),hash=target.hash;target.hash='';
   assert.ok(fs.existsSync(target),'Missing guide link '+href);
   if(hash){const linked=new JSDOM(fs.readFileSync(target,'utf8'));assert.ok(linked.window.document.getElementById(hash.slice(1)),'Missing anchor '+href);linked.window.close();}
  }
  dom.window.close();
 }
});
test('all supplied screenshots have self-contained SVG callouts and flattened PNGs',()=>{
 const dir=new URL('../src/help-assets/screenshots/',import.meta.url),names=fs.readdirSync(dir);
 assert.equal(names.length,15);
 for(const name of names){
  const svg=fs.readFileSync(new URL(name,dir),'utf8'),dom=new JSDOM(svg,{contentType:'image/svg+xml'}),doc=dom.window.document;
  assert.equal(doc.documentElement.tagName,'svg');assert.ok(doc.querySelector('title').textContent.length>12);
  assert.ok(svg.includes('marker-end'));assert.equal(doc.querySelectorAll('image').length,1);
  const href=doc.querySelector('image').getAttribute('href');assert.ok(href.startsWith('data:image/png;base64,'));
  const png=Buffer.from(href.split(',')[1],'base64');assert.equal(png.readUInt32BE(0),0x89504e47);
  assert.equal(png.subarray(-8,-4).toString(),'IEND');assert.ok(doc.querySelector('clipPath'));
  for(const t of doc.querySelectorAll('text')){assert.ok(Number(t.getAttribute('y'))<Number(doc.documentElement.getAttribute('height')));}
  dom.window.close();
 }
 const readme=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');
 for(const name of names.filter(n=>n.startsWith('install-')))assert.ok(readme.includes('src/help-assets/screenshots/'+name),'Screenshot missing from README '+name);
});
test('installation HTML matches the README and distinguishes installation from operation',()=>{
 execFileSync(process.execPath,['tools/sync-install-guide.mjs','--check'],{cwd:new URL('..',import.meta.url)});
 const help=fs.readFileSync(new URL('../src/help.html',import.meta.url),'utf8');
 assert.ok(help.includes('Добавление фотографии в пропуск…'));assert.ok(help.includes('«Применить»'));
 assert.ok(help.includes('не меняются'));assert.ok(help.includes('bridge.log'));assert.ok(help.includes('Ribbon Seek Err'));
});
