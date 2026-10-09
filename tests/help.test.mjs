import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
test('popup opens bundled working instructions in a new tab',()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../src/popup.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),calls=[];
 dom.window.chrome={runtime:{getURL:path=>'chrome-extension://test/'+path,openOptionsPage:()=>{}},tabs:{create:arg=>calls.push(arg)}};
 const source=fs.readFileSync(new URL('../extension-ts/popup.ts',import.meta.url),'utf8');
 dom.window.eval(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText);
 dom.window.document.querySelector('#instructions').click();
 assert.equal(calls.length,1);assert.equal(calls[0].url,'chrome-extension://test/src/help.html');dom.window.close();
});
test('working guide and README illustrations are bundled, valid SVGs with arrows',()=>{
 const html=fs.readFileSync(new URL('../src/help.html',import.meta.url),'utf8');
 const dom=new JSDOM(html);
 assert.ok(dom.window.document.querySelectorAll('section').length>=5);
 for(const img of dom.window.document.querySelectorAll('img'))assert.ok(fs.existsSync(new URL('../src/'+img.getAttribute('src'),import.meta.url)));
 for(const name of ['work-card','work-preview','install-browser','install-bridge']){
  const svg=fs.readFileSync(new URL('../src/help-assets/'+name+'.svg',import.meta.url),'utf8');
  const doc=new JSDOM(svg,{contentType:'image/svg+xml'});assert.equal(doc.window.document.documentElement.tagName,'svg');
  assert.ok(svg.includes('marker-end'));assert.ok(svg.includes('Схема интерфейса'));doc.window.close();
 }
 const readme=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');
 assert.ok(readme.includes('src/help-assets/install-browser.svg'));assert.ok(readme.includes('src/help-assets/install-bridge.svg'));dom.window.close();
});
