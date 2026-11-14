const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

// Read-only production baseline. Ad requests are blocked to avoid QA impressions.
const routes = [['home','/'],['gallery','/coloring-pages'],['animals','/coloring-pages/animals'],['lotus','/coloring-pages/lotus'],['christmas','/coloring-pages/christmas'],['plushies','/coloring-pages/plushies'],['deep','/coloring-pages/plushies/page/36'],['printable','/printables/animals/animals-alligator-4feec8505a']];
async function main() {
  const dir = path.resolve('pipeline/review/fasttrack/before');
  await fs.mkdir(dir,{recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext();
  await context.route(/googlesyndication|doubleclick|googletagservices|googleadservices/i,r=>r.abort());
  const page = await context.newPage();
  const records = [];
  for(const width of process.argv.includes('--states-only') ? [] : [360,390,768,1280,1440]) {
    await page.setViewportSize({width,height:900});
    for(const [id,route] of routes) {
      const errors=[]; const handler=e=>errors.push(e.message); page.on('pageerror',handler);
      const response=await page.goto('https://www.ilovecoloringpage.com'+route,{waitUntil:'networkidle'});
      await page.screenshot({path:path.join(dir,`${id}-${width}.png`),fullPage:true});
      const metrics=await page.evaluate(()=>({height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,images:[...document.images].map(i=>({src:i.currentSrc,complete:i.complete,width:i.naturalWidth,loading:i.loading})),cards:document.querySelectorAll('.gallery-item').length,search:!!document.querySelector('.gallery-search'),continuation:[...document.querySelectorAll('.pagination a,.gallery-show-more button')].map(e=>e.textContent),visibleLoading:[...document.querySelectorAll('.asset-image-fallback')].filter(e=>e.getBoundingClientRect().top<innerHeight).length}));
      records.push({id,route,width,status:response.status(),...metrics,errors});
      page.off('pageerror',handler);
      console.log(id,width,response.status(),metrics.cards,metrics.height,metrics.overflow);
    }
  }
  if(records.length) await fs.writeFile(path.join(dir,'baseline.json'),JSON.stringify(records,null,2));
  await page.setViewportSize({width:390,height:844});
  await page.goto('https://www.ilovecoloringpage.com/coloring-pages');
  await page.getByRole('searchbox',{name:'Search this collection'}).fill('alligator');
  await page.waitForTimeout(1500);
  await page.screenshot({path:path.join(dir,'search-390.png'),fullPage:true});
  await page.getByRole('searchbox',{name:'Search this collection'}).fill('zzzz-no-match');
  await page.waitForTimeout(300);
  await page.screenshot({path:path.join(dir,'empty-390.png'),fullPage:true});
  await page.getByRole('button',{name:'Filters',exact:true}).click();
  await page.screenshot({path:path.join(dir,'filters-390.png')});
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1)});
