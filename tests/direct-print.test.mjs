import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('print page sends the rendered PNG to the local SmartComm bridge',()=>{
  const source=fs.readFileSync(new URL('../extension-ts/print.ts',import.meta.url),'utf8');
  assert.match(source,/127\.0\.0\.1:18451/);
  assert.match(source,/POST/);
  assert.match(source,/colorImageDataUrl/);
  assert.match(source,/blackImageDataUrl/);
  assert.match(source,/printButton\.addEventListener\('click'/);
  assert.match(source,/printButton\.disabled=true/);
  assert.doesNotMatch(source,/window\.print\s*\(/);
});

test('print preview requires explicit confirmation and offers cancellation',()=>{
  const html=fs.readFileSync(new URL('../src/print.html',import.meta.url),'utf8');
  assert.match(html,/id="confirm-print"[^>]*disabled/);
  assert.match(html,/id="cancel-print"/);
  assert.match(html,/Предпросмотр пропуска/);
});

test('Windows bridge uses the color panel and starts SmartComm printing',()=>{
  const source=fs.readFileSync(new URL('../bridge/RubezhPrintBridge.ps1',import.meta.url),'utf8');
  assert.match(source,/SmartCommEx_GetDeviceList2/);
  assert.match(source,/GetFirstDeviceDescription/);
  assert.match(source,/Format24bppRgb/);
  assert.match(source,/DrawImage\(\$handle, 0, 1,/);
  assert.match(source,/DrawImage\(\$handle, 0, 2,/);
  assert.doesNotMatch(source,/GetPrinterSettings2|SetPrinterSettings2|SetJobColorDensity|color-density/);
  assert.match(source,/bridge\.log/);
  assert.match(source,/\[SmartSdk\]::Print\(\$handle\)/);
});

test('card renderer uses requested Arial point sizes and regular weight',()=>{
  const source=fs.readFileSync(new URL('../extension-ts/renderer.ts',import.meta.url),'utf8');
  assert.match(source,/text\(ctx,ORGANIZATION,506,42,970,48\)/);
  assert.doesNotMatch(source,/fillText\(ORGANIZATION,506,42,970\)/);
  assert.match(source,/text\(ctx,e\.surname,x,119,w,46\)/);
  assert.match(source,/fontSize:40/);
  assert.match(source,/ctx\.font='400 46px Arial'/);
  assert.match(source,/brightness\(0\.96\) contrast\(1\.10\) saturate\(1\.08\)/);
  assert.match(source,/imageSmoothingQuality='high'/);
});

test('Windows PowerShell scripts remain ASCII-compatible',()=>{
  for(const file of ['../bridge/RubezhPrintBridge.ps1','../bridge/install.ps1','../bridge/autostart.ps1']){
    const source=fs.readFileSync(new URL(file,import.meta.url));
    assert.equal(source.some(byte=>byte>127),false,`${file} contains non-ASCII bytes`);
  }
});

test('bridge installer enables autostart and ships opt-out controls',()=>{
  const installer=fs.readFileSync(new URL('../bridge/install.ps1',import.meta.url),'utf8');
  const manager=fs.readFileSync(new URL('../bridge/autostart.ps1',import.meta.url),'utf8');
  assert.match(installer,/autostart\.ps1'\) -Action Enable/);
  assert.match(manager,/Rubezh Print Bridge\.lnk/);
  assert.match(manager,/Remove-Item \$shortcutPath/);
  assert.equal(fs.existsSync(new URL('../bridge/enable-autostart.cmd',import.meta.url)),true);
  assert.equal(fs.existsSync(new URL('../bridge/disable-autostart.cmd',import.meta.url)),true);
});
