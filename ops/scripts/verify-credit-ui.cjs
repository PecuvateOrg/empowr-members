// Real React components in a browser with mocked network responses. The SQL
// transaction suite is separate; this checks form contracts and interactions.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'../../src');
const webpack = require(path.join(root,'node_modules/next/dist/compiled/webpack/webpack'));
webpack.init();
const { chromium } = require(process.env.CREDIT_PLAYWRIGHT_MODULE);
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'empowr-credit-ui-'));
const loader = path.join(temp,'loader.cjs');
fs.writeFileSync(loader,`const ts=require(${JSON.stringify(path.join(root,'node_modules/typescript'))});module.exports=function(s){return ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText}`);
const entry = path.join(temp,'entry.tsx');
const linkStub = path.join(temp,'link.tsx');
fs.writeFileSync(linkStub,"import React from 'react';export default function Link(props){return <a {...props}/>}");
fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';
import {CreditManager} from '@/components/admin/CreditManager';import {BookingForm} from '@/components/booking/BookingForm';
const form=<BookingForm target={{occurrence_id:'00000000-0000-4000-8000-000000000020'}} creditAvailable={2000} pricePence={1200} ageLabel="Adults" participants={[{id:'00000000-0000-4000-8000-000000000030',name:'Alex',age:30,eligible:true,waiverSigned:true,isMinor:false,defaultTravelMethod:null,coveredByPlan:null}]} />;
createRoot(document.getElementById('root')!).render(location.pathname==='/booking'?form:<CreditManager/>);`);
(async()=>{
  await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:temp,filename:'bundle.js'},
    resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root,'next/link':linkStub},modules:[path.join(root,'node_modules'),'node_modules']},
    module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]},
  },(err,stats)=>err||stats.hasErrors()?reject(err||new Error(stats.toString({all:false,errors:true}))):resolve()));
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'application/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(temp,'bundle.js')):'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="root"></main><script src="/bundle.js"></script>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CREDIT_BROWSER,headless:true});
  try {
    const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message);});
    let submitted=null;let count=0;const account='00000000-0000-4000-8000-000000000001';
    await page.route('**/api/admin/credits**',async route=>{
      if(route.request().method()==='POST') {submitted=route.request().postDataJSON();count++;return route.fulfill({json:{credit:{id:'credit-1',amount_pence:submitted.amount_pence,expires_at:'2027-09-18'}}});}
      return route.fulfill({json:route.request().url().includes('account_id=')?{bookings:[],credits:[],refunds:[]}:{members:[{id:account,name:'Alex Morgan',phone:'07000000000'}]}});
    });
    const base=`http://127.0.0.1:${server.address().port}`;
    await page.goto(base);await page.getByLabel('Find the member by account holder name').fill('Alex');await page.getByRole('button',{name:'Search members'}).click();
    await page.getByRole('button',{name:/Alex Morgan/}).click();
    // General credit is the default: amount + reason only, no old-platform fields sent.
    await page.getByLabel('Credit amount').fill('12');await page.getByLabel('Reference (optional)').fill('pi_123');await page.getByLabel('Reason for credit').fill('Took credit instead of a refund');
    await page.getByRole('button',{name:'Apply credit'}).click();assert.equal(count,0,'unverified submission blocked');
    await page.getByLabel(/I have confirmed who the member is/).check();await page.getByLabel(/member has agreed/).check();await page.getByRole('button',{name:'Apply credit'}).click();
    await page.getByRole('button',{name:'Apply more credit'}).waitFor();assert.equal(submitted.kind,'general');assert.equal(submitted.amount_pence,1200);assert.equal(submitted.reference,'pi_123');
    assert.equal(submitted.platform,undefined);assert.equal(submitted.session,undefined);assert.equal(submitted.session_date,undefined);assert.equal(count,1);
    // Old-platform credit is still available and still sends every detail.
    await page.getByRole('button',{name:'Apply more credit'}).click();await page.getByLabel('What is the credit for?').selectOption('legacy');
    await page.getByLabel('Original booking or payment reference').fill('WIX-4821');await page.getByLabel('Original session',{exact:true}).fill('Sk8 Skool');
    await page.getByLabel('Original session date').fill('2026-08-01');await page.getByLabel('Credit amount').fill('25.50');await page.getByLabel('Reason for credit').fill('Agreed credit');
    await page.getByLabel(/I have confirmed who the member is/).check();await page.getByLabel(/member has agreed/).check();await page.getByRole('button',{name:'Apply credit'}).click();
    await page.getByRole('button',{name:'Apply more credit'}).waitFor();assert.equal(submitted.kind,'legacy');assert.equal(submitted.amount_pence,2550);assert.equal(submitted.reference,'WIX-4821');assert.equal(submitted.account_id,account);assert.ok(submitted.request_id);assert.equal(count,2);
    await page.route('**/api/bookings',route=>{submitted=route.request().postDataJSON();return route.fulfill({status:409,json:{error:'Credit or availability changed. Refresh the page and try again.'}});});
    await page.goto(base+'/booking');await page.getByLabel(/Alex/).check();await page.getByLabel('Use credit towards this booking').check();
    await page.getByRole('button',{name:'Confirm using credit'}).click();await page.getByText('Credit or availability changed. Refresh the page and try again.').waitFor();assert.equal(submitted.expected_credit_pence,1200);assert.equal(submitted.use_credit,true);
    await page.getByLabel('Use credit towards this booking').uncheck();await page.getByRole('button',{name:'Book and pay'}).click();assert.equal(submitted.use_credit,false);assert.equal(submitted.expected_credit_pence,0);
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);console.log('PASS: staff lookup, general credit payload, legacy credit validation, exact pence payload, single issue, member credit opt-in/out, stale balance error and mobile width');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
