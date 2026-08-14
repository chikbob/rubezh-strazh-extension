import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const source=await readFile(new URL('../extension-ts/content.ts',import.meta.url),'utf8');
const adapter=await readFile(new URL('../extension-ts/adapter.ts',import.meta.url),'utf8');

test('print buttons are anchored to employee and visitor Save buttons',()=>{
 assert.match(source,/button#save_employee_btn,button#save_visitor_btn/);
 assert.match(source,/личные данные \(\?:сотрудника\|посетителя\)/);
 assert.match(source,/saveButtonInHeader/);
});

test('visitor position falls back to the Comment field',()=>{
 assert.match(adapter,/position=value\('position'\)\|\|\(isVisitorPage\(\)\?comment:''\)/);
});

test('print buttons do not use generic action or Delete-neighbour fallbacks',()=>{
 assert.doesNotMatch(source,/button\[type=["']submit/);
 assert.doesNotMatch(source,/previousElementSibling/);
 assert.doesNotMatch(source,/isDelete\(/);
});
