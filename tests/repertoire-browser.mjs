import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({headless:true,channel:'msedge'})
const page=await browser.newPage()
let value={enabled:false,canConfigure:true,canEdit:false,version:0,songs:[],script:''}
let saves=0
let library=[]
try {
 await page.route('**/hnplfnxlmkdxpvqqrden.supabase.co/**',async route=>{
  const p=route.request().postDataJSON()
  if(route.request().url().includes('repertoire_library_portal')) {
   if(p.op==='save') library=[{id:'song-1',song:p.payload.song}]
   if(p.op==='archive') library=[]
   return route.fulfill({json:p.op==='list'?library:library[0]??{ok:true}})
  }
  if(p?.op==='configure')value={...value,enabled:p.payload.enabled,canEdit:p.payload.enabled}
  if(p?.op==='save'){saves++;value={...value,...p.payload,version:value.version+1}}
  await route.fulfill({json:value})
 })
 await page.goto('http://127.0.0.1:5174')
 await page.evaluate(async()=>{
  const reactModule=await import('/node_modules/.vite/deps/react.js')
  const React=reactModule.default??reactModule
  const dom=await import('/node_modules/.vite/deps/react-dom_client.js')
  const {createRoot}=dom.default??dom
  const {EventRepertoire}=await import('/src/components/EventRepertoire.tsx')
  const el=document.createElement('div');document.body.replaceChildren(el)
  createRoot(el).render(React.createElement(EventRepertoire,{eventId:'fixture'}))
 })
 await page.getByText('Habilitar repertório neste ministério',{exact:true}).click()
 await page.getByText('Editar repertório',{exact:true}).click()
 await page.getByText('Adicionar música',{exact:true}).click()
 assert.equal(await page.getByText('Salvar repertório',{exact:true}).isEnabled(),false)
 await page.getByLabel('Título',{exact:true}).fill('Canção de teste')
 await page.getByLabel('Tom',{exact:true}).fill('D')
 await page.getByText('Salvar música na biblioteca',{exact:true}).click()
 await page.getByText('Abrir biblioteca',{exact:true}).click()
 await page.getByText('Adicionar ao repertório',{exact:true}).click()
 assert.equal(await page.getByLabel('Título',{exact:true}).count(),2)
 await page.getByLabel('Título',{exact:true}).nth(1).fill('Versão do evento')
 assert.equal(library[0].song.title,'Canção de teste')
 await page.getByLabel('Roteiro do culto',{exact:true}).fill('Abertura e oração')
 await page.getByText('Salvar repertório',{exact:true}).click()
 await page.getByText('1. Canção de teste',{exact:true}).waitFor()
 assert.equal(saves,1)
 assert.equal(value.script,'Abertura e oração')
 await page.getByText('Editar repertório',{exact:true}).click()
 await page.getByLabel('Título',{exact:true}).first().fill('Não salvar')
 await page.getByText('Cancelar edição',{exact:true}).click()
 await page.getByText('1. Canção de teste',{exact:true}).waitFor()
 assert.equal(saves,1)
 console.log('Repertoire browser passed: enable, required title, edit, save, read and cancel.')
} finally {await browser.close()}
