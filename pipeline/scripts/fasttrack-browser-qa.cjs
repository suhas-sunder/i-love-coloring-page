const {chromium, webkit} = require('playwright');
const fs = require('node:fs/promises');
const sync = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const crypto = require('node:crypto');
const DIR = path.resolve('pipeline/review/fasttrack/after');
const RESULT_PATH = path.join(DIR,process.argv.includes('--tasks-only')?'task-results.json':'results.json');
const PRINTABLE = '/printables/animals/animals-alligator-4feec8505a';
const ROUTES = [['home','/'],['gallery','/coloring-pages'],['animals','/coloring-pages/animals'],['lotus','/coloring-pages/lotus'],['christmas','/coloring-pages/christmas'],['plushies','/coloring-pages/plushies'],['deep','/coloring-pages/plushies/page/36'],['printable',PRINTABLE]];
const results = {checks:[], outputs:[], errors:[], limitations:['Ad requests blocked; no claim of genuine AdSense rendering or policy acceptance.','Desktop Chromium and WebKit with touch simulation; physical mobile, assistive technology and printer remain manual.','LCP/CLS/interaction measurements are local lab observations, not field p75.']};
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.xml':'application/xml','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
async function main(){
 await fs.mkdir(DIR,{recursive:true});
 const server=process.env.FASTTRACK_BASE_URL ? null : http.createServer((req,res)=>{
  const root=path.resolve('out'); const url=new URL(req.url,'http://localhost');
  let file=path.join(root,decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
  if(sync.existsSync(file+'.html'))file+='.html';
  else if(sync.existsSync(file)&&sync.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!sync.existsSync(file)){res.statusCode=404;file=path.join(root,'404.html');}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');sync.createReadStream(file).pipe(res);
 });
 if(server)await new Promise(r=>server.listen(3005,'localhost',r));
 const base=process.env.FASTTRACK_BASE_URL||'http://localhost:3005';results.base=base;
 try{
 for(const [engine,launch] of [['chromium',()=>chromium.launch({channel:'chrome',headless:true})],['webkit',()=>webkit.launch({headless:true})]]){
  const browser=await launch();results[engine]=browser.version();
  try{
   const context=await browser.newContext();await blockAds(context);
   await context.addInitScript(()=>{
    window.__metrics={cls:0,lcp:0};
    try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__metrics.cls+=e.value;}).observe({type:'layout-shift',buffered:true});}catch{}
    try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__metrics.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
   });
   const page=await context.newPage();page.on('pageerror',e=>results.errors.push({engine,error:e.message}));
   for(const width of process.argv.includes('--tasks-only')?[]:[360,390,768,1280,1440]){
    await page.setViewportSize({width,height:900});
    for(const [id,route] of ROUTES)await check(`${engine}:${id}@${width}`,async()=>{
     await context.clearCookies();await page.goto(base+route,{waitUntil:'networkidle'});
     assert.equal(await page.locator('h1').count(),1);
     const before=await page.evaluate(()=>({height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,metrics:window.__metrics}));assert.equal(before.overflow,false);
     await page.screenshot({path:path.join(DIR,`${engine}-${id}-${width}.png`)});
     if(width===390||width===1440){
      await scrollAll(page);await page.screenshot({path:path.join(DIR,`${engine}-${id}-${width}-full.png`),fullPage:true});
      assert.equal(await page.locator('.asset-placeholder').count(),0);
     }
     const overlap=await page.evaluate(()=>{
      const ads=[...document.querySelectorAll('.ad-slot')].filter(e=>e.getBoundingClientRect().height>0);
      const controls=[...document.querySelectorAll('main button,main input,main select,main .gallery-item,main .pagination')];
      return ads.flatMap(a=>controls.filter(c=>{const x=a.getBoundingClientRect(),y=c.getBoundingClientRect();return y.width&&y.height&&x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top;}).map(c=>c.className));
     });assert.deepEqual(overlap,[]);
     return before;
    });
   }
   await check(`${engine}:library-continuation-and-return`,async()=>{
    await page.setViewportSize({width:390,height:844});await page.goto(base+'/coloring-pages');
    await page.evaluate(()=>sessionStorage.clear());await page.reload();
    assert.equal(await page.locator('.gallery-item').count(),48);
    await page.getByRole('button',{name:'Show more',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-item').length===96);
    const links=await page.locator('.gallery-item-media-link').evaluateAll(es=>es.map(e=>e.getAttribute('href')));assert.equal(new Set(links).size,96);
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.gallery-item').length===96);
    const search=page.getByRole('searchbox',{name:'Search this collection'});await search.fill('alligator');
    await page.waitForFunction(()=>document.querySelector('.gallery-control-summary').textContent.includes('matching'));
    await page.screenshot({path:path.join(DIR,`${engine}-search-390.png`)});
    const count=await page.locator('.gallery-item').count();assert.ok(count>0&&count<48);
    await page.locator('.gallery-item-media-link').first().click();await page.waitForURL('**/printables/**');await page.goBack();
    await page.waitForFunction(()=>document.querySelector('.gallery-search input')?.value==='alligator');
    await page.getByRole('button',{name:'Clear all',exact:true}).click();
    await page.getByRole('combobox',{name:'Sort by'}).selectOption('title-asc');
    await page.waitForFunction(()=>document.querySelector('.gallery-control-summary').textContent.includes('matching'));
    const titles=await page.locator('.item-title').allTextContents();assert.deepEqual(titles,[...titles].sort((a,b)=>a.localeCompare(b,'en',{numeric:true,sensitivity:'base'})));
    await search.fill('zzzz-no-match');await page.getByRole('heading',{name:'No matching coloring pages'}).waitFor();
    await page.screenshot({path:path.join(DIR,`${engine}-empty-390.png`),fullPage:true});
    await page.locator('.empty-state').getByRole('button',{name:'Clear all'}).click();await waitCount(page,'.gallery-item',48);
    assert.equal(await page.getByRole('combobox',{name:'Sort by'}).inputValue(),'recommended');return {expanded:96,alligatorResults:count};
   });
   await check(`${engine}:deep-collection-search`,async()=>{
    await page.goto(base+'/coloring-pages/plushies/page/36');assert.equal(await page.locator('.gallery-item').count(),24);
    assert.match(await page.locator('.gallery-control-summary').textContent(),/1,681-1,704/);
    await page.getByRole('searchbox',{name:'Search this collection'}).fill('plushie');
    await page.waitForFunction(()=>document.querySelectorAll('.gallery-item').length===48);
    assert.match(await page.locator('.gallery-control-summary').textContent(),/matching coloring pages/);
    assert.equal(await page.getByText(/1,681-1,704/).count(),0);
    assert.equal(await page.locator('.pagination').count(),0);
    await page.getByRole('button',{name:'Clear all',exact:true}).click();await waitCount(page,'.gallery-item',24);
    assert.equal(await page.getByRole('link',{name:'Page 1',exact:true}).getAttribute('href'),'/coloring-pages/plushies');
    assert.equal(await page.getByRole('link',{name:'Page 36',exact:true}).getAttribute('aria-current'),'page');
   });
   await check(`${engine}:filter-drafts-keyboard-and-chips`,async()=>{
    await page.goto(base+'/coloring-pages');await page.getByRole('button',{name:'Filters',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox').first().check();
    await dialog.getByRole('button',{name:'Close',exact:true}).click();await waitCount(page,'.gallery-active-filters button',0);
    await page.getByRole('button',{name:'Filters',exact:true}).click();await page.getByRole('checkbox').first().check();
    await page.screenshot({path:path.join(DIR,`${engine}-filters-390.png`)});
    await page.getByRole('button',{name:'Apply filters'}).click();
    await page.locator('.gallery-active-filters button').waitFor();await page.locator('.gallery-active-filters button').click();
    await waitCount(page,'.gallery-active-filters button',0);
    await page.setViewportSize({width:1280,height:900});await page.getByRole('button',{name:'Filters',exact:true}).click();await page.getByRole('button',{name:'Done',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.textContent==='Filters');
   });
   await check(`${engine}:preview-zoom-pdf-and-focus`,async()=>{
    await page.setViewportSize({width:390,height:844});await page.goto(base+PRINTABLE);await page.getByRole('button',{name:'Enlarge preview',exact:true}).click();
    await page.locator('.print-preview-media img').waitFor({timeout:30000});
    assert.ok(await page.locator('.print-preview-media img').evaluate(i=>i.naturalWidth>=1200));
    await page.screenshot({path:path.join(DIR,`${engine}-preview-390.png`)});
    await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.ok(await page.locator('.print-preview-media').evaluate(e=>e.scrollWidth>e.clientWidth));
    await page.getByRole('button',{name:'Fit preview',exact:true}).click();
    const downloadPromise=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'Download PDF',exact:true}).click();
    const download=await downloadPromise;const filename=path.join(DIR,`${engine}-preview.pdf`);await download.saveAs(filename);
    const bytes=await fs.readFile(filename);assert.equal(bytes.subarray(0,4).toString(),'%PDF');
    results.outputs.push({engine,format:'PDF',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),filename:download.suggestedFilename()});
    await page.keyboard.press('Escape');await waitCount(page,'[role=dialog]',0);
    await page.waitForFunction(()=>document.activeElement?.textContent==='Enlarge preview');
   });
   await check(`${engine}:actual-image-downloads`,async()=>{
    await page.goto(base+PRINTABLE);
    for(const format of ['PNG','JPG','WebP']){
     const button=page.getByRole('button',{name:`Download ${format} for Animals Alligator`,exact:true});
     if(await button.count()===0){results.outputs.push({engine,format,supported:false});continue;}
     const promise=page.waitForEvent('download');await button.click();const download=await promise;
     const filename=path.join(DIR,`${engine}-alligator.${format.toLowerCase()}`);await download.saveAs(filename);
     const metadata=await sharp(filename).metadata();assert.equal(metadata.format,format==='JPG'?'jpeg':format.toLowerCase());
     assert.equal(metadata.width,format==='WebP'?1600:2550);assert.equal(metadata.height,format==='WebP'?2400:3300);
     results.outputs.push({engine,format,bytes:(await fs.stat(filename)).size,width:metadata.width,height:metadata.height,filename:download.suggestedFilename()});
    }
   });
   await check(`${engine}:navigation-and-global-search`,async()=>{
    await page.setViewportSize({width:390,height:844});await page.goto(base+'/');
    await page.getByRole('button',{name:'Open navigation menu'}).click();await page.getByRole('dialog').waitFor();
    await page.screenshot({path:path.join(DIR,`${engine}-navigation-390.png`)});await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Open navigation menu');
    await page.getByRole('button',{name:'Search coloring pages',exact:true}).click();await page.getByRole('dialog').getByRole('searchbox').fill('lotus');
    await page.locator('.global-search-printable-results a').first().waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('.global-search-result-preview')].some(i=>i instanceof HTMLImageElement&&i.complete&&i.naturalWidth>0));
    await page.screenshot({path:path.join(DIR,`${engine}-global-search-390.png`)});
    await page.getByRole('link',{name:'See all printable matches'}).click();await page.waitForURL('**/coloring-pages');
    await page.waitForFunction(()=>document.querySelector('.gallery-search input')?.value==='lotus');
    await page.getByRole('button',{name:'Search coloring pages',exact:true}).click();await page.getByRole('dialog').getByRole('searchbox').fill('alligator');
    await page.getByRole('link',{name:'See all printable matches'}).click();
    await page.waitForFunction(()=>document.querySelector('.gallery-search input')?.value==='alligator');
    await page.setViewportSize({width:1280,height:900});await page.getByRole('button',{name:'Categories',exact:true}).click();await page.screenshot({path:path.join(DIR,`${engine}-categories-1280.png`)});await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.activeElement?.textContent?.trim()==='Categories');
   });
   await context.close();
   await check(`${engine}:featured-shelf-keyboard-reachability`,async()=>{
    const c=await browser.newContext({viewport:{width:360,height:800}});await blockAds(c);const p=await c.newPage();await p.goto(base+'/');
    const shelf=p.locator('.rotating-featured-grid').first();
    await shelf.locator('.asset-image[data-state=loaded]').first().waitFor();await shelf.focus();
    const controls=shelf.locator('a[href],button:not([disabled])');const count=await controls.count();assert.ok(count>8);
    for(let i=0;i<count;i++){
     // WebKit follows the platform's links-in-tab-order preference. Exercise
     // native Tab order in Chromium, and every native focus target in WebKit.
     if(engine==='webkit')await controls.nth(i).focus();else await p.keyboard.press('Tab');
     const position=await p.evaluate(()=>{const el=document.activeElement,s=el.closest('.rotating-featured-grid');if(!s)return null;const a=el.getBoundingClientRect(),b=s.getBoundingClientRect();return {left:a.left,right:a.right,min:b.left,max:b.right,pageOverflow:document.documentElement.scrollWidth>innerWidth};});
     assert.ok(position);assert.ok(position.left>=position.min-1&&position.right<=position.max+1);assert.equal(position.pageOverflow,false);
    }await c.close();
   });
   await check(`${engine}:no-js-real-artwork`,async()=>{
    const c=await browser.newContext({javaScriptEnabled:false});await blockAds(c);const p=await c.newPage();await p.goto(base+'/coloring-pages',{waitUntil:'networkidle'});
    const evidence=await p.locator('.asset-image').first().evaluate(i=>({complete:i.complete,width:i.naturalWidth,opacity:getComputedStyle(i).opacity,src:i.src}));assert.ok(evidence.complete&&evidence.width>0);assert.equal(evidence.opacity,'1');
    await p.screenshot({path:path.join(DIR,`${engine}-no-js.png`)});await c.close();return evidence;
   });
   await check(`${engine}:failed-media-and-search-retry`,async()=>{
    const c=await browser.newContext();await blockAds(c);await c.route('**/*.webp',r=>r.abort());let fail=true;
    await c.route('**/search-data/all.json',r=>fail?r.fulfill({status:503,body:'unavailable'}):r.continue());
    const p=await c.newPage();await p.goto(base+'/coloring-pages');await p.locator('.asset-placeholder').first().waitFor();
    await p.getByRole('searchbox',{name:'Search this collection'}).fill('alligator');await p.getByRole('alert').waitFor();assert.equal(await p.locator('.gallery-item').count(),48);
    await p.screenshot({path:path.join(DIR,`${engine}-failure.png`)});fail=false;await p.getByRole('button',{name:'Try again',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('.gallery-control-summary')?.textContent.includes('matching'));await waitCount(p,'[role=alert]',0);await c.close();
   });
   await check(`${engine}:touch-navigation`,async()=>{
    const c=await browser.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true});await blockAds(c);const p=await c.newPage();await p.goto(base+'/');await p.getByRole('button',{name:'Open navigation menu'}).tap();await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).tap();assert.equal(await p.getByRole('dialog').count(),0);await c.close();
   });
   await check(`${engine}:stalled-search-and-preview-recovery`,async()=>{
    const c=await browser.newContext({viewport:{width:390,height:844}});await blockAds(c);let stall=true,failPreview=true;
    await c.route('**/search-data/all.json',async r=>{if(stall){await new Promise(resolve=>setTimeout(resolve,9000));try{await r.abort();}catch{}}else await r.continue();});
    await c.route('**/*.svg',r=>failPreview?r.fulfill({status:503,body:'unavailable'}):r.continue());
    const p=await c.newPage();await p.goto(base+'/coloring-pages');await p.getByRole('searchbox',{name:'Search this collection'}).fill('alligator');
    await p.getByRole('alert').waitFor({timeout:15000});assert.equal(await p.locator('.gallery-item').count(),48);
    stall=false;await p.getByRole('button',{name:'Try again',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.gallery-control-summary')?.textContent.includes('matching'));
    await p.goto(base+PRINTABLE);await p.getByRole('button',{name:'Enlarge preview',exact:true}).click();await p.getByRole('button',{name:'Retry preview',exact:true}).waitFor();
    failPreview=false;await p.getByRole('button',{name:'Retry preview',exact:true}).click();await p.locator('.print-preview-media img').waitFor();await c.close();
   });
  }finally{await browser.close();}
 }
 }finally{if(server)await new Promise(r=>server.close(r));await fs.writeFile(RESULT_PATH,JSON.stringify(results,null,2));}
 const failures=results.checks.filter(x=>!x.passed);console.log(JSON.stringify({checks:results.checks.length,failures,errors:results.errors,outputs:results.outputs},null,2));if(failures.length||results.errors.length)process.exitCode=1;
}
async function blockAds(c){await c.route(/googlesyndication|doubleclick|googletagservices|googleadservices/i,r=>r.abort());}
async function waitCount(page,selector,count){await page.waitForFunction(({selector,count})=>document.querySelectorAll(selector).length===count,{selector,count});}
async function check(name,fn){try{const evidence=await fn();results.checks.push({name,passed:true,evidence});console.log('PASS',name);}catch(e){results.checks.push({name,passed:false,error:e.stack});console.log('FAIL',name,e.stack);}await fs.writeFile(RESULT_PATH,JSON.stringify(results,null,2));}
async function scrollAll(page){await page.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,30));}window.scrollTo(0,0);});await page.waitForTimeout(500);}
main().catch(async e=>{console.error(e);await fs.writeFile(RESULT_PATH,JSON.stringify({...results,fatal:e.message},null,2));process.exit(1)});
