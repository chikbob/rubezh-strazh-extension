import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('print page sends the rendered PNG to the local SmartComm bridge',()=>{
  const source=fs.readFileSync(new URL('../extension-ts/print.ts',import.meta.url),'utf8');
  assert.match(source,/127\.0\.0\.1:18451/);
  assert.match(source,/POST/);
  assert.match(source,/imageDataUrl/);
  assert.doesNotMatch(source,/window\.print\s*\(/);
});

test('Windows bridge uses the color panel and starts SmartComm printing',()=>{
  const source=fs.readFileSync(new URL('../bridge/RubezhPrintBridge.ps1',import.meta.url),'utf8');
  assert.match(source,/SmartCommEx_GetDeviceList2/);
  assert.match(source,/GetFirstDeviceDescription/);
  assert.match(source,/DrawImage\(\$handle, 0, 1,/);
  assert.match(source,/\[SmartSdk\]::Print\(\$handle\)/);
});

test('Windows PowerShell scripts remain ASCII-compatible',()=>{
  for(const file of ['../bridge/RubezhPrintBridge.ps1','../bridge/install.ps1']){
    const source=fs.readFileSync(new URL(file,import.meta.url));
    assert.equal(source.some(byte=>byte>127),false,`${file} contains non-ASCII bytes`);
  }
});
