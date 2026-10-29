import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) })
const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
const origin = process.env.TEST_URL ?? 'http://127.0.0.1:5173'
const user = { id: '10000000-0000-0000-0000-000000000001', email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {} }
let role = 'viewer'
let revoked = false, failMinistries = false
let saves=0, grants=0
const banners=[{id:'banner-1',title:'Encontro da igreja',image_alt:'Pessoas reunidas',image_path:'fixture/image.webp',button_text:'Saiba mais',button_url:'https://example.com/event',starts_at:new Date(Date.now()-3600000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),enabled:true},{id:'banner-2',title:'Segundo comunicado',image_alt:'Ensaio',image_path:'fixture/two.webp',button_text:'',button_url:'',starts_at:new Date(Date.now()-3600000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),enabled:true}]
const catalog = [{id:'ministry-1',name:'Celebração',functions:[{id:'function-1',name:'Vocalista'}]},{id:'ministry-2',name:'Comunicação',functions:[]}]
const profile = { ...user, name: 'Test Owner', initials: 'TO', is_admin: false, color: '#336699' }
const project = { ministry_id: 'ministry-1', id: 'project-1', name: 'Fixture project', color: '#336699', emoji: 'folder', suspended: false, created_by: user.id, created_at: user.created_at }
const initialTask = { id: 'task-1', title: 'Fixture task', description: '', status: 'todo', priority: 'none', project_id: project.id, due_date: '2026-10-30', tags: [], recurring: 'monthly', position: 0, assignee: null, created_at: user.created_at, lt_task_comments: [], lt_task_checklist: [{ id: 'check-1', task_id: 'task-1', text: 'Fixture item', done: false, position: 0, created_at: user.created_at }], lt_task_activity: [], lt_task_links: [] }
let tasks = [structuredClone(initialTask)]
let taskInserts = 0, taskReads = 0, activeReads = 0, maxReads = 0, sequence = 0
let failReads = false
const sockets = [], channels = new Map()
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
await context.addInitScript(({ user }) => {
  const payload = btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' }))
  localStorage.setItem('sb-hnplfnxlmkdxpvqqrden-auth-token', JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiJ9.'+payload+'.fixture', refresh_token: 'fixture', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user }))
}, { user })
await page.routeWebSocket(/supabase\.co/, ws => {
  sockets.push(ws)
  ws.onMessage(message => {
    const frame = JSON.parse(String(message))
    if (frame.event === 'phx_join') {
      channels.set(frame.topic, ws)
      ws.send(JSON.stringify({ topic: frame.topic, event: 'phx_reply', ref: frame.ref, payload: { status: 'ok', response: { postgres_changes: (frame.payload.config?.postgres_changes ?? []).map((c,i) => ({ ...c, id: i+1 })) } } }))
    } else if (frame.event === 'phx_leave') {
      channels.delete(frame.topic)
      ws.send(JSON.stringify({ topic: frame.topic, event: 'phx_reply', ref: frame.ref, payload: { status: 'ok', response: {} } }))
    } else if (frame.event === 'heartbeat') ws.send(JSON.stringify({ topic: 'phoenix', event: 'phx_reply', ref: frame.ref, payload: { status: 'ok', response: {} } }))
  })
})
await page.route('**/hnplfnxlmkdxpvqqrden.supabase.co/**', async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method()
  const table = url.pathname.split('/').at(-1)
  const single = (request.headers().accept ?? '').includes('vnd.pgrst.object')
  const body = request.postDataJSON()
  const answer = (value, status=200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value), headers: { 'access-control-allow-origin': '*' } })
  if (url.pathname.includes('/auth/')) return answer(url.pathname.endsWith('/user') ? user : {})
  if (url.pathname.includes('/storage/')) return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64')})
  if (table === 'announcement_portal') {
   if(body.op==='list')return answer({canManage:role==='admin',items:banners,nextChangeAt:null})
   if(body.op==='manage')return answer(banners)
   if(body.op==='editors')return answer([{id:'editor-1',name:'Pessoa Comunicação',enabled:grants>0}])
   if(body.op==='grant'){grants++;assert.equal(body.payload.enabled,true);return answer({ok:true})}
   if(body.op==='save'){saves++;assert.equal(body.payload.title,'Título revisado');return answer({id:'banner-1'})}
  }
  if (table === 'people_portal') {
    if (body.op === 'status') return answer({ready:true,consented:true,passwordRequired:false,isAdmin:role==='admin',isGeneralAdmin:role==='admin',isLeader:role==='leader',email:user.email,firstName:'Test',lastName:'Owner',phone:'11999999999',birthDate:'1990-01-01'})
    if (failMinistries && body.op === 'catalog') return answer({message:'fixture failure'},500)
    if (body.op === 'catalog') return answer(catalog)
    if (body.op === 'myMemberships') return answer(revoked ? [] : [{ministry_id:'ministry-1',active:true,leader:role==='leader',function_ids:['function-1']}])
    return answer([])
  }
  if (table === 'workspace_access') return answer({ministries:['leader','admin'].includes(role) ? [{id:'ministry-1',name:'Celebração'}] : [],projects:[{id:project.id,canManage:role === 'leader',canCreateTasks:role === 'leader' || role === 'delegate',eligibleMemberIds:[user.id]}]})
  if (table === 'profiles') return answer(single ? profile : [profile])
  if (table === 'lt_projects') return answer([project])
  if (table === 'lt_notifications' || table === 'lt_notes' || table === 'lt_project_members' || table === 'lt_project_files') return answer([])
  if (table === 'lt_tasks') {
    if (method === 'GET') {
      taskReads++; activeReads++; maxReads = Math.max(maxReads, activeReads)
      await new Promise(resolve => setTimeout(resolve, 40))
      activeReads--
      if (failReads) return answer({ message: 'fixture failure' }, 500)
      return answer(structuredClone(tasks))
    }
    if (method === 'POST') {
      taskInserts++
      const row = { ...structuredClone(initialTask), ...body, id: 'new-'+(++sequence), lt_task_comments: [], lt_task_checklist: [], lt_task_activity: [], lt_task_links: [] }
      tasks.push(row)
      return answer(single ? row : [row])
    }
    if (method === 'PATCH') {
      const id = url.searchParams.get('id')?.replace('eq.','')
      const row = tasks.find(t=>t.id===id)
      Object.assign(row, body)
      return answer(single ? row : [row])
    }
    if (method === 'DELETE') { tasks = tasks.filter(t=>!url.search.includes(t.id)); return answer([]) }
  }
  if (table === 'lt_task_activity' && method === 'GET') return answer(single ? null : [])
  if (['lt_task_comments','lt_task_activity','lt_task_checklist','lt_task_links'].includes(table) && method === 'POST') {
    const rows = (Array.isArray(body) ? body : [body]).map(data => ({ ...data, id: 'child-'+(++sequence), created_at: user.created_at }))
    for (const row of rows) tasks.find(t=>t.id===row.task_id)?.[table].push(row)
    return answer(single ? rows[0] : rows)
  }
  return answer([])
})
try {
 await page.goto(origin)
 await page.getByRole('heading',{name:'Início',exact:true}).waitFor()
 await page.getByRole('heading',{name:'Encontro da igreja',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Gerenciar banners'}).count(),0)
 await page.getByRole('button',{name:'Pausar banners'}).click()
 await page.getByRole('button',{name:'Próximo banner'}).click()
 await page.getByRole('heading',{name:'Segundo comunicado',exact:true}).waitFor()
 await page.getByRole('button',{name:'Banner anterior'}).click()
 assert.equal(await page.getByRole('link',{name:'Saiba mais'}).getAttribute('href'),'https://example.com/event')
 role='admin'
 await page.reload()
 await page.getByRole('button',{name:'Gerenciar banners'}).click()
 await page.getByRole('heading',{name:'Banners e comunicados',exact:true}).waitFor()
 await page.getByRole('button',{name:'Editar banner',exact:true}).first().click()
 await page.getByLabel('Título opcional',{exact:true}).fill('Título revisado')
 await page.getByRole('button',{name:'Salvar banner',exact:true}).click()
 await page.getByText('Banner salvo',{exact:true}).waitFor()
 assert.equal(saves,1)
 await page.getByRole('switch',{name:'Permitir banners para Pessoa Comunicação'}).check()
 assert.equal(grants,1)
 await page.getByRole('button',{name:'Voltar ao início'}).click()
 await page.setViewportSize({width:390,height:844})
 await page.getByRole('heading',{name:'Encontro da igreja',exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.screenshot({path:'../home-mobile.png',fullPage:true})
 banners[0].ends_at=new Date(Date.now()-1000).toISOString()
 banners[1].starts_at=new Date(Date.now()+3600000).toISOString()
 await page.evaluate(()=>dispatchEvent(new Event('focus')))
 await page.getByText('Nenhum comunicado publicado neste momento.',{exact:true}).waitFor()
 const imageCheck=await page.evaluate(async()=>{
  const {prepareBanner}=await import('/src/lib/announcements.ts')
  const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1200
  const original=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
  const result=await prepareBanner(new File([original],'test.png',{type:'image/png'}))
  const bitmap=await createImageBitmap(result)
  const valid=result.type==='image/webp' && result.size<=2*1024*1024 && bitmap.width===1920 && bitmap.height===960;bitmap.close();return valid
 })
 assert.equal(imageCheck,true,'image optimization')
 assert.deepEqual(errors,[])
 console.log('Homepage and banners: reader, carousel, admin edit, delegation, time filtering and mobile passed')
}finally{await browser.close()}
