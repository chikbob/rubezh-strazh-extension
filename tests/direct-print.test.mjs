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
  assert.match(source,/printButton\.disabled=busy\|\|!panels/);
  assert.doesNotMatch(source,/window\.print\s*\(/);
});

test('print preview requires explicit confirmation and offers cancellation',()=>{
  const html=fs.readFileSync(new URL('../src/print.html',import.meta.url),'utf8');
  assert.match(html,/id="confirm-print"[^>]*disabled/);
  assert.match(html,/id="cancel-print"/);
  assert.match(html,/Предпросмотр пропуска/);
});

test('photo passes require a validated local source image before printing',()=>{
  const source=fs.readFileSync(new URL('../extension-ts/print.ts',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../src/print.html',import.meta.url),'utf8');
  assert.match(source,/photo:undefined/);
  assert.match(source,/payload\.type==='employee'\|\|payload\.type==='mosn'/);
  assert.match(source,/ALLOWED_IMAGE_TYPES/);
  assert.match(source,/readAsDataURL\(file\)/);
  assert.match(source,/if\(isBusy\|\|!panels\)return/);
  assert.match(source,/renderCardPanels\(payload\.type,employee\)/);
  assert.match(html,/id="photo-file"[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp,image\/bmp,\.bmp"/);
  assert.match(html,/id="select-photo"/);
});

test('content buttons handle a reloaded extension context without an unhandled rejection',()=>{
  const source=fs.readFileSync(new URL('../extension-ts/content.ts',import.meta.url),'utf8');
  assert.match(source,/if\(!chrome\.runtime\?\.id\)throw new Error\('Extension context invalidated'\)/);
  assert.match(source,/const response=await chrome\.runtime\.sendMessage/);
  assert.match(source,/if\(!response\?\.ok\)throw new Error/);
  assert.match(source,/context invalidated\|receiving end does not exist/);
  assert.match(source,/Обновите страницу RUBEZH \(Ctrl\+R\)/);
});

test('Windows bridge uses the color panel and starts SmartComm printing',()=>{
  const source=fs.readFileSync(new URL('../bridge/RubezhPrintBridge.ps1',import.meta.url),'utf8');
  assert.match(source,/SmartCommEx_GetDeviceList2/);
  assert.match(source,/GetFirstDeviceDescription/);
  assert.match(source,/Format24bppRgb/);
  assert.match(source,/DrawImage\(\$handle, 0, 1,/);
  assert.match(source,/DrawImage\(\$handle, 0, 2,/);
  assert.match(source,/SetJobMainDensity\(\$handle, 30\)/);
  assert.match(source,/RestoreJobMainDensity\(\$handle, \$originalMainDensity\)/);
  assert.doesNotMatch(source,/SetPanelDensity|color-density\.txt/);
  assert.match(source,/SmartComm_GetRibbonInfo/);
  assert.match(source,/ribbonType=\$ribbonType/);
  assert.match(source,/bridge\.log/);
  assert.match(source,/\[SmartSdk\]::Print\(\$handle\)/);
});

test('card renderer uses requested Arial point sizes and regular weight',()=>{
  const source=fs.readFileSync(new URL('../extension-ts/renderer.ts',import.meta.url),'utf8');
  assert.match(source,/text\(ctx,ORGANIZATION,506,42,970,48\)/);
  assert.doesNotMatch(source,/fillText\(ORGANIZATION,506,42,970\)/);
  assert.match(source,/text\(ctx,e\.surname,x,134,w,46\)/);
  assert.match(source,/fontSize:40/);
  assert.match(source,/ctx\.font='400 46px Arial'/);
  assert.match(source,/COLOR_FILTER='brightness\(0\.95\) contrast\(1\.14\) saturate\(1\.07\)'/);
  assert.match(source,/TEXT_STROKE=0\.45/);
  assert.match(source,/ctx\.strokeText\(value,x,y\)/);
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
