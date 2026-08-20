import type{EmployeeData,PassType}from'./types.js';import{normalizePosition}from'./positionNormalizer.js';
export const CARD={widthPx:1012,heightPx:638,widthMm:85.6,heightMm:54,dpi:300};
const asset=(name:string)=>chrome.runtime.getURL(`src/assets/${name}`),ORGANIZATION='ММЦ ФГБУЗ ЮОМЦ ФМБА России';
// Keep source colors intact. Physical YMCK density is applied by SmartComm for
// the duration of one job; stacking a CSS filter on top clips skin tones.
const COLOR_FILTER='none';
const load=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src});
function cover(ctx:CanvasRenderingContext2D,image:HTMLImageElement,x:number,y:number,w:number,h:number){const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight),sw=w/scale,sh=h/scale;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,(image.naturalWidth-sw)/2,(image.naturalHeight-sh)/2,sw,sh,x,y,w,h)}
function text(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,maxWidth:number,size:number,weight=400){let px=size;while(px>18){ctx.font=`${weight} ${px}px Arial`;if(ctx.measureText(value).width<=maxWidth)break;px--}ctx.fillText(value,x,y)}
type Layer='composite'|'color'|'black';
async function base(layer:Layer){const canvas=document.createElement('canvas');canvas.width=CARD.widthPx;canvas.height=CARD.heightPx;const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillStyle='#fff';ctx.fillRect(0,0,1012,638);if(layer!=='black'){const background=await load(asset('medical-background.jpg'));ctx.save();ctx.filter=COLOR_FILTER;ctx.drawImage(background,0,84,440,554);ctx.restore()}ctx.fillStyle='#000';ctx.textAlign='left';ctx.textBaseline='alphabetic';if(layer!=='color'){ctx.textAlign='center';ctx.textBaseline='middle';text(ctx,ORGANIZATION,506,42,970,48);ctx.textAlign='left';ctx.textBaseline='alphabetic'}return{canvas,ctx}}
function photoFrame(ctx:CanvasRenderingContext2D,photo:HTMLImageElement){ctx.save();ctx.filter=COLOR_FILTER;cover(ctx,photo,33,117,375,484);ctx.restore()}
function contain(ctx:CanvasRenderingContext2D,image:HTMLImageElement,x:number,y:number,w:number,h:number){const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight),dw=image.naturalWidth*scale,dh=image.naturalHeight*scale;ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}

async function renderLayer(type:PassType,e:EmployeeData,layer:Layer){const{canvas,ctx}=await base(layer);
 if(type==='temporary'){
  if(layer!=='black'){const color=await load(asset('emblem-color.png'));contain(ctx,color,32,96,375,505)}if(layer!=='color'){ctx.font='400 72px Arial';ctx.fillText('ВРЕМЕННЫЙ',466,216);ctx.font='400 104px Arial';ctx.fillText('ПРОПУСК',466,392);ctx.font='400 37px Arial';ctx.fillText('№ Пропуска',466,548);ctx.font='400 39px Arial';ctx.fillText(e.passNumber||'',466,611);ctx.font='700 39px Arial';ctx.fillText('МО',914,609)}return canvas.toDataURL('image/png')
 }
 if(layer!=='black'&&e.photo?.dataUrl){try{photoFrame(ctx,await load(e.photo.dataUrl))}catch{}}if(layer!=='color'){const black=await load(asset('emblem-black-v2.png'));contain(ctx,black,800,410,205,228)}
 if(layer==='color')return canvas.toDataURL('image/png');
 const x=456,w=540;ctx.fillStyle='#000';text(ctx,e.surname,x,134,w,46);text(ctx,e.name,x,196,w,46);text(ctx,e.patronymic||'',x,258,w,46);
 const fit=normalizePosition(ctx,e.position||'',{fontFamily:'Arial',fontSize:40,minScale:.72,maxWidth:w,maxLines:2,lineHeight:44},true);ctx.font=`400 ${fit.fontSize}px Arial`;fit.lines.forEach((line,index)=>ctx.fillText(line,x,324+index*44));
 if(type==='mosn'){ctx.font='400 46px Arial';ctx.fillText('МОСН',x,437);ctx.fillText('№ Пропуска',x,546);ctx.fillText(e.passNumber||'',x,608)}else{ctx.font='400 46px Arial';const tabLabel='Таб. №';ctx.fillText(tabLabel,x,429);const tabX=x+ctx.measureText(tabLabel).width+10;ctx.fillText(e.employeeNumber||'',tabX,429);ctx.fillText('№ Пропуска',x,528);ctx.fillText(e.passNumber||'',x,590)}
 return canvas.toDataURL('image/png')
}
export async function renderCard(type:PassType,e:EmployeeData){return renderLayer(type,e,'composite')}
export async function renderCardPanels(type:PassType,e:EmployeeData){const[colorImageDataUrl,blackImageDataUrl]=await Promise.all([renderLayer(type,e,'color'),renderLayer(type,e,'black')]);return{colorImageDataUrl,blackImageDataUrl}}
