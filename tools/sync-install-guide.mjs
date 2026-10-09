// Keep the offline installation page in sync with the README installation
// section. Only the small, audited Markdown subset used by that section is
// supported: paragraphs, headings, links, images, code and flat lists.
import fs from 'node:fs';
const readme=fs.readFileSync('README.md','utf8').replace(/\r\n/g,'\n');
const start=readme.indexOf('## Установка в Яндекс Браузер');
const end=readme.indexOf('## Релиз ',start);
if(start<0||end<0)throw Error('Installation section is missing');
const markdown=readme.slice(start,end).split('\n### Работа после установки')[0];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const url=s=>esc(s.replace(/^src\//,''));
const inline=s=>esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,href)=>`<a href="${url(href)}">${label}</a>`);
const sections=markdown.split(/^### /m);
function render(text){
 const lines=text.trim().split('\n'),out=[];
 for(let i=0;i<lines.length;){
  const line=lines[i];
  if(!line.trim()){i++;continue;}
  const image=line.match(/^!\[([^\]]+)\]\(([^)]+)\)$/);
  if(image){const[,label,href]=image;out.push(`<figure><a href="${url(href)}" target="_blank" rel="noopener"><img src="${url(href)}" alt="${esc(label)}" loading="lazy"></a><figcaption>${esc(label)}. Нажмите для увеличения.</figcaption></figure>`);i++;continue;}
  if(/^(\d+\. |- )/.test(line)){
   const ordered=/^\d+\./.test(line),tag=ordered?'ol':'ul';
   out.push(ordered?`<ol start="${parseInt(line)}">`:'<ul>');
   while(i<lines.length&&(ordered?/^\d+\. /:/^- /).test(lines[i]))out.push('<li>'+inline(lines[i++].replace(ordered?/^\d+\. /:/^- /,''))+'</li>');
   out.push(`</${tag}>`);continue;
  }
  const p=[];while(i<lines.length&&lines[i].trim()&&!/^(\d+\. |- |!\[)/.test(lines[i]))p.push(lines[i++]);
  out.push('<p>'+inline(p.join(' '))+'</p>');
 }
 return out.join('\n');
}
const nav=['Подготовка','Скачать ZIP','Распаковать','Мост','Яндекс Браузер','Адрес RUBEZH','Проверка связи','Обновление','Ошибки'];
const ids=nav.map((_,i)=>i===6?'check':'step-'+(i+1));
if(sections.length!==10)throw Error('Expected nine installation sections');
const intro=sections[0].replace(/^## .*\n/,'');
const content=sections.slice(1).map((s,i)=>{
 const at=s.indexOf('\n'),title=s.slice(0,at);
 return `<section id="${ids[i]}"><h2>${esc(title)}</h2>\n${render(s.slice(at+1))}\n</section>`;
}).join('\n');
const page=`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Установка в Яндекс Браузер — RUBEZH STRAZH</title><link rel="stylesheet" href="help.css"></head>
<body><main><header><p class="eyebrow">RUBEZH STRAZH · установка · 2.8</p><h1>Установка в Яндекс Браузер</h1>${render(intro)}<p>Уже установлено? Перейдите к <a href="help.html">инструкции по работе с пропусками</a>.</p></header>
<nav aria-label="Содержание">${nav.map((label,i)=>`<a href="#${ids[i]}">${i+1}. ${label}</a>`).join('')}</nav>
${content}
<footer><a href="help.html">Как пользоваться расширением</a> · Эта страница доступна из распакованного комплекта без интернета. Для скачивания релиза нужен интернет. Пароли и служебные настройки не вводятся по чужим примерам.</footer></main></body></html>
`;
if(process.argv.includes('--check')){
 if(fs.readFileSync('src/install.html','utf8').replace(/\r\n/g,'\n')!==page)throw Error('Installation HTML is out of sync with README');
 console.log('Offline installation guide matches README.');
}else{
 fs.writeFileSync('src/install.html',page);
 console.log('Offline installation guide synchronized with README.');
}
