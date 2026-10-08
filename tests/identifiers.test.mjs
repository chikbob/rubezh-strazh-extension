import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync(new URL('../extension-ts/identifiers.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {currentIdentifiers}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function view(ids,person='сотрудника'){
 return `<section class="view"><div class="panel"><h4>Управление картами</h4>${ids.map(id=>`<div><a>${id} - уровень 1 (Новая)</a><button></button></div>`).join('')}</div><div class="panel"><h4>Личные данные ${person}</h4></div></section>`;
}
function setup(html){
 const dom=new JSDOM(html);
 globalThis.document=dom.window.document;
 globalThis.getComputedStyle=dom.window.getComputedStyle;
 dom.window.Element.prototype.getClientRects=function(){return [{}]};
 return dom;
}
test('only current visible card codes, not cached cards or arbitrary page text',()=>{
 const dom=setup(`<aside>999999999 - уровень 1</aside><div hidden>${view(['111111111'])}</div><div style="display:none">${view(['222222222'])}</div>${view(['389369658'])}`);
 assert.deepEqual(currentIdentifiers(),['389369658']);dom.window.close();
});
test('new and deleted identifiers are read fresh without navigation',()=>{
 const dom=setup(view([]));assert.deepEqual(currentIdentifiers(),[]);
 document.querySelector('.panel').insertAdjacentHTML('beforeend','<div><a>389369658 - уровень 1 (Новая)</a><button></button></div>');
 assert.deepEqual(currentIdentifiers(),['389369658']);
 document.querySelector('a').remove();assert.deepEqual(currentIdentifiers(),[]);dom.window.close();
});
test('multiple visitor identifiers are distinct; inputs and hidden rows excluded',()=>{
 const dom=setup(view(['123456789','123456789','987654321'],'посетителя'));
 document.querySelector('.panel').insertAdjacentHTML('beforeend','<div hidden><a>777777777 - уровень 1</a></div><input value="888888888"><span>12345 - уровень 1</span>');
 assert.deepEqual(currentIdentifiers(),['123456789','987654321']);dom.window.close();
});
test('missing or ambiguous management panel never falls back to body codes',()=>{
 const dom=setup('<h4>Личные данные сотрудника</h4><p>999999999 - уровень 1</p>');
 assert.deepEqual(currentIdentifiers(),[]);dom.window.close();
 const other=setup(view(['123456789']).replace('</section>','<div class="panel"><h4>Управление картами</h4><a>777777777 - уровень 1</a></div></section>'));
 assert.deepEqual(currentIdentifiers(),[]);other.window.close();
});
