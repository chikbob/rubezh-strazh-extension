import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../extension-ts/nativePosition.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {fitNativePosition,NATIVE_POSITION_FONT}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('long economic deputy title uses the abbreviation from the user template',()=>{
 const expected='Зам. глав. врача по экон. вопр.';
 const result=fitNativePosition('Заместитель главного врача по экономическим вопросам',value=>value===expected);
 assert.deepEqual(result,{text:expected,fits:true,changed:true});
});
test('short positions retain spelling and case; whitespace alone is normalized',()=>{
 for(const input of ['Электроник','Главный бухгалтер','Сторож (вахтер)'])assert.equal(fitNativePosition(input,()=>true).text,input);
 assert.equal(fitNativePosition('  Работник  месяца ',()=>true).text,'Работник месяца');
});
test('unknown long titles are never cut off or marked as fitting',()=>{
 const input='Очень длинная специальная должность без известных сокращений';
 const result=fitNativePosition(input,()=>false);
 assert.equal(result.text,input);assert.equal(result.fits,false);
 assert.equal(fitNativePosition('заместительский',()=>false).text,'заместительский');
});
test('text preparation preserves the CSD and its native font, image and printer settings',()=>{
 assert.equal(NATIVE_POSITION_FONT,'400 37.5px Arial');
 const master=fs.readFileSync(new URL('../bridge/employee-native.csd',import.meta.url));
 assert.equal(crypto.createHash('sha256').update(master).digest('hex'),'c812bfdec1cb11fbc5542b574996b758da84e02966e8d22c93846323a5b954da');
});
