// The supplied CSD uses regular Arial 12 (iDesigner units: 1/96 inch).
// Measure at its 300-dpi preview size. Leave padding inside the native field;
// never change the CSD font, stretch it or silently clip/truncate the title.
export const NATIVE_POSITION_FONT='400 37.5px Arial';
export const NATIVE_POSITION_WIDTH=548;
const rules:[RegExp,string][]=[
 [/исполняющ(?:ий|ая) обязанности/giu,'и. о.'],
 [/заместитель главного врача по экономическим вопросам/giu,'зам. глав. врача по экон. вопр.'],
 [/заместитель/giu,'зам.'],[/главного/giu,'глав.'],
 [/экономическим/giu,'экон.'],[/вопросам/giu,'вопр.'],
 [/заведующ(?:ий|ая)/giu,'зав.'],
 [/медицинск(?:ая|ий|ой|ого|им)/giu,'мед.'],
 [/отделени(?:е|ем|я)/giu,'отд.'],[/отдел(?:а|ом)/giu,'отд.'],
 [/старш(?:ая|ий)/giu,'ст.'],[/младш(?:ая|ий)/giu,'мл.']
];
export function fitNativePosition(input:string,fits:(value:string)=>boolean){
 const raw=input.replace(/\s+/g,' ').trim();
 if(!raw||fits(raw))return{text:raw,fits:true,changed:false};
 let text=raw;
 for(const[pattern,replacement]of rules){
  const wordPattern=new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern.source})(?![\\p{L}\\p{N}])`,pattern.flags);
  text=text.replace(wordPattern,match=>match[0]===match[0].toUpperCase()?replacement[0].toUpperCase()+replacement.slice(1):replacement);
  if(fits(text))return{text,fits:true,changed:text!==raw};
 }
 return{text,fits:false,changed:text!==raw};
}
export function prepareNativePosition(input:string){
 const context=document.createElement('canvas').getContext('2d')!;
 context.font=NATIVE_POSITION_FONT;
 return fitNativePosition(input,text=>context.measureText(text).width<=NATIVE_POSITION_WIDTH);
}
