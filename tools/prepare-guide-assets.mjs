// Reproducible code-native guide layouts built from the supplied screenshots.
// Private source PNGs stay in tmp/. Only flattened, redacted screenshots and
// SVG callouts enter the documentation. No printer or extension is operated.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
const chrome=process.env.GUIDE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const source=path.resolve('tmp/guide-source/archive');
const output=path.resolve('src/help-assets/screenshots');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'rubezh-guide-layout-'));
await fs.mkdir(output,{recursive:true});
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
async function render(args,png){
 const child=execFile(chrome,args,{maxBuffer:1024*1024});
 const closed=new Promise(resolve=>child.once('close',resolve));
 try{
  for(let i=0;i<200;i++){
   const bytes=await fs.readFile(png).catch(()=>null);
   if(bytes?.subarray(-8,-4).toString()==='IEND')return;
   if(child.exitCode!==null)throw Error('Chrome stopped before rendering '+png);
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Screenshot timeout: '+png);
 }finally{if(child.exitCode===null)child.kill('SIGTERM');await closed;}
}
const recipes=[
 ['install-release','Установка 1.png',[0,0,326,149],'1. Откройте последний релиз',[[155,71,305,110,'Откройте релиз с отметкой Latest',[22,58,278,29]]]],
 ['install-download','Установка 2.png',[0,372,1247,180],'2. Скачайте готовый ZIP',[[269,451,1000,410,'Выберите unpacked ZIP, не Source code',[60,430,370,38]]]],
 ['install-downloads','Установка 3.png',[0,0,362,123],'3. Найдите файл в загрузках',[[285,26,65,102,'Нажмите «Открыть папку»',[229,8,119,33]]]],
 ['install-extract','Установка 4.png',[0,0,246,89],'4. Полностью распакуйте архив',[[161,51,32,83,'Правой кнопкой по ZIP → «Извлечь файлы…»',[63,39,180,25]]]],
 ['install-bridge','Установка 5.png',[205,157,655,276],'5. Установите Print Bridge',[[279,308,760,275,'Дважды щёлкните install.cmd',[216,296,595,23]]]],
 ['install-ready','Установка 6.png',[0,25,979,92],'6. Дождитесь сообщения об успехе',[[304,55,915,83,'Строка installed and started successfully',[0,44,466,20]]]],
 ['install-developer','Установка 7.png',[1710,110,210,108],'7а. Включите режим разработчика',[[1894,132,1815,190,'Включите «Режим разработчика»',[1728,116,184,33]]]],
 ['install-browser','Установка 7.png',[0,110,600,110],'7б. Загрузите расширение из папки',[[158,188,520,139,'Нажмите «Загрузить распакованное расширение»',[20,166,274,43]]]],
 ['install-folder','Установка 8.png',[7,0,1248,504],'8. Выберите правильную папку',[[386,48,925,110,'Выберите корень rubezh-strazh-extension-unpacked',[295,34,224,27]],[1080,477,875,360,'Нажмите «Выбор папки»',[1024,464,113,28]]]],
 ['install-enabled','Установка 9.png',[408,306,405,212],'9. Проверьте, что расширение включено',[[777,491,650,393,'Переключатель должен быть включён',[758,476,39,27]],[736,491,547,450,'При обновлении перезагрузите расширение',[722,476,30,27]]]],
 ['work-card','Работа 1.png',[460,198,990,770],'1. Человек, идентификатор и тип пропуска',[[620,833,835,787,'Проверьте идентификатор текущего человека',[475,813,286,39]],[1280,227,1090,251,'Выберите С / М / В возле кнопки сохранения',[1220,207,128,39]]]],
 ['work-photo','Работа 2.png',[55,72,762,865],'2. Выберите код и исходное фото',[[770,626,800,570,'Если кодов несколько — выберите нужный',[207,602,586,46]],[155,683,450,685,'Нажмите «Выбрать фото»',[78,660,154,45]],[735,896,800,838,'Без фото С/М печатать нельзя',[671,873,124,48]]]],
 ['work-wait','Работа 3 (ожидаем).png',[55,72,762,865],'3. Подождите, пока макет готовится',[[235,850,450,855,'Дождитесь окончания добавления фотографии',[76,835,326,27]]]],
 ['work-ready','Работа 4 (перед запуском печати).png',[55,72,762,865],'4. Проверьте макет перед печатью',[[550,439,794,420,'Сверьте ФИО, фото, должность и номер',[398,195,248,379]],[730,897,800,835,'Нажмите «Печать» только один раз',[668,873,128,48]]]],
 ['work-position','Работа 4 (сменили должность на пропуске).png',[55,72,762,865],'5. Правка должности и две строки',[[335,767,400,694,'Измените текст; Enter задаёт перенос',[78,738,584,62]],[730,770,800,719,'Нажмите «Применить» и дождитесь обновления',[669,739,126,62]],[548,381,790,310,'Проверьте обе строки над табельным номером',[398,345,250,66]]]],
];
function block(x,y,w,h,text,size=16,fill='#fff') {
 return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/><text x="${x+6}" y="${y+h/2+size*.34}" font-family="Arial" font-size="${size}" fill="#26313a">${xml(text)}</text>`;
}
function avatar(x,y,w,h) {
 const cx=x+w/2, cy=y+h*.38;
 return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e5ebef"/><circle cx="${cx}" cy="${cy}" r="${w*.18}" fill="#a7b6c1"/><path d="M${x+w*.15} ${y+h*.8} Q${cx} ${y+h*.35} ${x+w*.85} ${y+h*.8}Z" fill="#a7b6c1"/><text x="${cx}" y="${y+h*.93}" text-anchor="middle" font-family="Arial" font-size="${w*.062}" fill="#455664">Учебное фото</text>`;
}
function redactions(file) {
 if(file.startsWith('Работа 1'))return block(920,276,507,32,'Фамилия')+block(889,318,538,32,'Имя')+block(907,360,520,32,'Отчество')+block(974,442,445,31,'00001')+block(477,816,230,32,'123456789 — уровень 1',14)+avatar(477,301,284,232);
 if(file.startsWith('Работа')){
  let masks=block(398,202,261,133,'',32)+block(402,206,250,34,'Фамилия',32)+block(402,254,250,34,'Имя',32)+block(402,301,250,34,'Отчество',32)+block(520,420,120,38,'00001',32)+block(401,532,245,42,'123456789',32)+block(219,610,210,29,'123456789',16)+block(240,674,170,24,file.startsWith('Работа 2')?'Фото не выбрано':'photo.png',12);
  if(!file.startsWith('Работа 2'))masks+=avatar(103,207,266,358);
  return masks;
 }
 if(file==='Установка 8.png')return block(9,177,152,178,'',12,'#fff');
 return '';
}
for(const [name,file,crop,title,marks]of recipes){
 const data=await fs.readFile(path.join(source,file));
 if(data.readUInt32BE(0)!==0x89504e47)throw Error('Only PNG screenshots are supported');
 const [x,y,w,h]=crop;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"><image width="${data.readUInt32BE(16)}" height="${data.readUInt32BE(20)}" href="data:image/png;base64,${data.toString('base64')}"/>${redactions(file)}</svg>`;
 const html=path.join(scratch,name+'.html');
 await fs.writeFile(html,`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}svg{display:block}</style>${svg}`);
 const png=path.join(scratch,name+'.png');
 await render(['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check','--force-device-scale-factor=1',`--user-data-dir=${path.join(scratch,'chrome-profile')}`,`--window-size=${w},${Math.max(h,600)}`,`--screenshot=${png}`,'--virtual-time-budget=500',`file://${html}`],png);
 // Chrome enforces a minimum viewport height; clip via the SVG viewport in
 // the public asset. The flattened PNG contains no private original pixels.
 const flattened=await fs.readFile(png);
 const s=Math.min(2,1200/w),imageW=w*s,imageH=h*s,W=Math.max(720,imageW),offset=(W-imageW)/2;
 const X=v=>offset+(v-x)*s,Y=v=>64+(v-y)*s;
 const H=64+imageH+marks.length*48+30;
 let annotations='';
 marks.forEach(([tx,ty,px,py,label,box],i)=>{
  const [bx,by,bw,bh]=box;
  annotations+=`<rect x="${X(bx)}" y="${Y(by)}" width="${bw*s}" height="${bh*s}" rx="4" fill="none" stroke="#bf1738" stroke-width="3"/><path d="M${X(px)} ${Y(py)} L${X(tx)} ${Y(ty)}" fill="none" stroke="#bf1738" stroke-width="3" marker-end="url(#arrow)"/><circle cx="${X(px)}" cy="${Y(py)}" r="17" fill="#bf1738"/><text x="${X(px)}" y="${Y(py)+6}" text-anchor="middle" font-size="19" font-weight="bold" fill="white">${i+1}</text><text x="24" y="${64+imageH+32+i*48}" font-size="20" fill="#26313a">${i+1}. ${xml(label)}</text>`;
 });
 const asset=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title"><title id="title">${xml(title)}</title><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#bf1738"/></marker><clipPath id="picture"><rect x="${offset}" y="64" width="${imageW}" height="${imageH}"/></clipPath></defs><rect width="${W}" height="${H}" rx="12" fill="#f1f5f8"/><g font-family="Arial,sans-serif"><text x="24" y="40" font-size="25" font-weight="bold" fill="#26313a">${xml(title)}</text><image x="${offset}" y="64" width="${flattened.readUInt32BE(16)*s}" height="${flattened.readUInt32BE(20)*s}" clip-path="url(#picture)" href="data:image/png;base64,${flattened.toString('base64')}"/>${annotations}</g></svg>`;
 await fs.writeFile(path.join(output,name+'.svg'),asset);
 console.log('Prepared',name);
}
console.log('Private source and rendering intermediates are NOT included in the release.',scratch);
