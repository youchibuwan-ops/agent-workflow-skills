import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
const root = process.cwd();
process.env.TEMP = process.env.TMP = path.join(root, '.tools/tmp');
const {default:PDFDocument}=await import('pdfkit');
const {load}=await import('cheerio');
const $=load(fs.readFileSync('report.html','utf8'));
const expected=$('tbody tr').toArray().map(r=>$(r).find('td').toArray().map(c=>$(c).text().trim()));
assert.equal(expected.length,36);
const doc=new PDFDocument({size:'A4',margin:45,info:{Title:$('title').text()}});
const output=fs.createWriteStream('report.pdf');
doc.pipe(output);
doc.registerFont('CJK','.tools/NotoSansCJKsc-Regular.otf');
doc.font('CJK').fontSize(20).text($('h1').text(),45,45,{width:505});
doc.moveDown(0.7).fontSize(10).text($('p').first().text());
let y=doc.y+18;
const xs=[45,160,445,550];
function row(cells,heading=false){
 const height=42;
 if(heading)doc.rect(45,y,505,height).fill('#dddddd');
 doc.lineWidth(0.6).strokeColor('#888888').rect(45,y,505,height).stroke();
 for(const x of xs.slice(1,-1))doc.moveTo(x,y).lineTo(x,y+height).stroke();
 cells.forEach((cell,i)=>doc.fillColor('#111111').fontSize(10).text(cell,xs[i]+10,y+12,{width:xs[i+1]-xs[i]-20,lineBreak:false}));
 y+=height;
}
const headings=$('thead th').toArray().map(c=>$(c).text());
row(headings,true);
for(const cells of expected){
 if(y+42>doc.page.height-45){doc.addPage();y=45;row(headings,true);}
 row(cells);
}
if(y+35>doc.page.height-45){doc.addPage();y=45;}
doc.fontSize(10).text($('p').last().text(),45,y+16);
doc.end();
await new Promise((resolve,reject)=>{output.on('finish',resolve);output.on('error',reject)});
const {getDocument} = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdf = await getDocument({data:new Uint8Array(fs.readFileSync('report.pdf')),useSystemFonts:false}).promise;
fs.mkdirSync('verification',{recursive:true});
const pages=[];
for(let n=1;n<=pdf.numPages;n++) {
 const page=await pdf.getPage(n);
 const content=await page.getTextContent();
 const items=content.items.filter(i=>i.str?.trim());
 const text=items.map(i=>i.str).join(' ');
 for(const heading of ['Record ID','说明','Description','Amount']) assert(text.includes(heading),`Page ${n}: missing heading ${heading}`);
 const viewport=page.getViewport({scale:1.5});
 const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
 await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
 fs.writeFileSync(`verification/page-${n}.png`,canvas.toBuffer('image/png'));
 for(const i of items) {
  assert(i.transform[4]>=0 && i.transform[4]+i.width<=page.view[2]+1,`Horizontal overflow page ${n}: ${i.str}`);
  assert(i.transform[5]>0 && i.transform[5]+i.height<page.view[3],`Vertical overflow page ${n}: ${i.str}`);
 }
 pages.push({page:n,text,items});
}
const normalize=s=>s.replace(/\s/g,'');
const all=normalize(pages.map(p=>p.text).join(' '));
for(const row of expected) {
 assert.equal(all.split(row[0]).length-1,1,`Duplicate/missing ${row[0]}`);
 const p=pages.find(p=>p.text.includes(row[0]));
 const id=p.items.find(i=>i.str===row[0]);
 const line=p.items.filter(i=>Math.abs(i.transform[5]-id.transform[5])<2).sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join('');
 assert.equal(normalize(line),normalize(row.join('')),`Row mismatch ${row[0]}`);
}
for(const phrase of ['季度交付报告','Quarterly delivery report','报告结束','End of report']) assert(all.includes(normalize(phrase)),`Missing ${phrase}`);
fs.writeFileSync('verification/text.txt',pages.map(p=>`PAGE ${p.page}\n${p.text}`).join('\n\n'));
fs.writeFileSync('verification/checks.json',JSON.stringify({pages:pdf.numPages,rows:expected.length,checks:['Every source row matched on one PDF text baseline, including ID, Chinese/English description and exact amount','Each ID occurs exactly once','All pages contain bilingual table heading','Title and closing text extracted','All text bounds inside page'],pageRows:pages.map(p=>({page:p.page,rows:p.text.match(/ROW-\d+/g)}))},null,2));
console.log(fs.readFileSync('verification/checks.json','utf8'));
