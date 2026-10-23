// Thin Playwright wrapper. Apache-2.0 dependency; no generative model calls.
import {chromium} from 'playwright';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const [input,output]=process.argv.slice(2);
if(!input||!output) throw new Error('usage: capture.mjs INPUT.html NEW_OUTPUT_DIR');
const folder=resolve(output);await mkdir(folder,{recursive:false});
const report={input:resolve(input),viewport:{width:1200,height:900},pageErrors:[],consoleErrors:[],blockedRequests:[],frames:[],clock:'real browser wall time; no seeking or retiming'};
let browser,context;
try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],env:{...process.env,LD_LIBRARY_PATH:fileURLToPath(new URL('./sysdeps/usr/lib/x86_64-linux-gnu',import.meta.url))}});
  context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,recordVideo:{dir:folder,size:report.viewport},reducedMotion:'no-preference'});
  await context.route(/^https?:\/\//,route=>{report.blockedRequests.push(route.request().url());return route.abort();});
  const page=await context.newPage();
  page.on('pageerror',e=>report.pageErrors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  await page.goto(pathToFileURL(resolve(input)).href,{waitUntil:'load',timeout:20000});
  const start=performance.now();
  report.timeOrigin=await page.evaluate(()=>performance.now());
  for(let i=0;i<=12;i++){
    const target=i*500;
    await new Promise(r=>setTimeout(r,Math.max(0,target-(performance.now()-start))));
    const meta=await page.evaluate(()=>({pageTime:performance.now(),svgCount:document.querySelectorAll('svg').length,animations:document.getAnimations().map(a=>({currentTime:a.currentTime,playState:a.playState,timing:a.effect?.getComputedTiming()}))}));
    const file=`frame-${String(i).padStart(2,'0')}.png`;
    await page.screenshot({path:resolve(folder,file),animations:'allow',timeout:15000});
    report.frames.push({file,targetMilliseconds:target,actualMilliseconds:performance.now()-start,...meta});
  }
  await new Promise(r=>setTimeout(r,Math.max(0,12500-(performance.now()-start))));
  report.actualRecordedMilliseconds=performance.now()-start;
  const video=page.video();
  await context.close();context=null;
  await rename(await video.path(),resolve(folder,'animation.webm'));
  report.browserVersion=browser.version();
} catch(error){report.captureError=String(error);process.exitCode=1;}
finally{
  if(context)await context.close();
  if(browser)await browser.close();
  await writeFile(resolve(folder,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({frames:report.frames.length,pageErrors:report.pageErrors,blockedRequests:report.blockedRequests,captureError:report.captureError??null}));
