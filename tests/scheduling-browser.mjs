import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) })
const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
const origin = process.env.TEST_URL ?? 'http://127.0.0.1:5173'
const user = { id: '10000000-0000-0000-0000-000000000001', email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {} }
const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(18,0,0,0)
let events=[{id:'event-1',ministry_id:'ministry-1',title:'Ensaio recorrente',description:'',location:'Templo',starts_at:tomorrow.toISOString(),ends_at:new Date(tomorrow.getTime()+3600000).toISOString(),shared_with:[],version:1,cancelled:false,series_id:null}]
let assignments=[{id:'assign-1',ministryId:'ministry-1',personId:'person-1',name:'Test Owner',functionId:'function-1',functionName:'Vocalista',response:'pending'}],eventSaves=0,eventDeletes=0
let periods=[],swaps=[],repeats=0,decisions=0
let role = 'viewer'
let revoked = false, failMinistries = false
let saves=0, grants=0
let reserved=false,removed=false,avatarWrites=0,brandWrites=0
let media={brand:{name:'Promessa Industrial',logo_path:null,favicon_path:null},avatars:{}}
const unused={id:'unused-1',bucket:'identity-images',path:user.id+'/old.webp',createdAt:'2025-01-01T00:00:00Z',size:100,used:false}
const used={...unused,id:'used-1',path:user.id+'/logo.webp',used:true}
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
  let body;try{body=request.postDataJSON()}catch{body={}}
  const answer = (value, status=200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value), headers: { 'access-control-allow-origin': '*' } })
  if (url.pathname.includes('/auth/')) return answer(url.pathname.endsWith('/user') ? user : {})
  if(table==='repertoire_portal') return answer({enabled:true,canEditScript:role==='leader',canEditSongs:role==='leader',canEdit:role==='leader',version:7,songs:[],script:'Roteiro'})
  if(table==='scheduling_portal') {
    const p=body.payload
    if(body.op==='availabilityList')return answer(periods)
    if(body.op==='availabilityAdd'){assert.equal(p.frequency,'weekly');assert.equal(p.count,2);periods=[{id:'period-1',starts_at:p.startsAt,ends_at:p.endsAt},{id:'period-2',starts_at:p.startsAt,ends_at:p.endsAt}];return answer({ok:true})}
    if(body.op==='availabilityCancel'){periods=periods.filter(x=>x.id!==p.id);return answer({ok:true})}
    if(body.op==='state')return answer({conflicts:[],swaps:swaps.map(s=>({...s,canDecide:role==='leader'&&s.status==='pending',canCancel:role==='viewer'&&s.status==='pending'}))})
    if(body.op==='swapCandidates')return answer([{id:'replacement-1',name:'Pessoa Substituta'}])
    if(body.op==='requestSwap'){assert.equal(p.replacementId,'replacement-1');swaps=[{id:'swap-1',assignmentId:'assign-1',personName:'Test Owner',replacementName:'Pessoa Substituta',status:'pending'}];return answer({ok:true})}
    if(body.op==='decideSwap'){assert.equal(role,'leader');assert.equal(p.decision,'approve');decisions++;swaps[0].status='approved';assignments=[{...assignments[0],id:'assign-2',personId:'replacement-1',name:'Pessoa Substituta',response:'pending'}];return answer({ok:true})}
    if(body.op==='repeatPreview'){assert.equal(p.count,3);return answer([0,1,2].map(i=>({startsAt:new Date(tomorrow.getTime()+i*7*86400000).toISOString(),endsAt:new Date(tomorrow.getTime()+i*7*86400000+3600000).toISOString()})))}
    if(body.op==='repeat'){assert.equal(p.confirmed,true);assert.equal(p.copyRepertoire,true);assert.equal(p.repertoireVersion,7);repeats++;events[0].series_id='series-1';return answer({count:3})}
    if(body.op==='cancelSeries'){assert.equal(p.confirmed,true);events[0].cancelled=true;return answer({ok:true})}
    throw new Error('Unexpected scheduling operation '+body.op)
  }
  if(table==='delete_event_safely') {
    assert.equal(role,'admin')
    if(body.op==='preview')return answer({event:events[0],assignments})
    assert.equal(body.payload.confirmed,true);assert.deepEqual(body.payload.snapshot,{event:events[0],assignments});eventDeletes++;events=[];assignments=[];return answer({ok:true,backupId:1})
  }
  if(table==='event_portal') {
    const canManage=role==='leader';const own=[{id:'ministry-1',name:'Celebração'}]
    if(body.op==='list')return answer({items:events.map(e=>({...e,canManage})),creatableMinistries:canManage?own:[]})
    if(body.op==='detail')return answer({event:{...events.find(e=>e.id===body.payload.eventId),canManage},assignments:assignments.map(a=>({...a,canManage,canRespond:!canManage})),scheduleMinistries:canManage?own:[]})
    if(body.op==='candidates')return answer([{id:'person-1',name:'Test Owner',functionIds:['function-1']}])
    if(body.op==='save') {assert.equal(canManage,true);eventSaves++;const p=body.payload;const e={id:p.id??'event-1',title:p.title,description:p.description,location:p.location,starts_at:p.startsAt,ends_at:p.endsAt,ministry_id:p.ministryId,shared_with:p.sharedWith,cancelled:p.cancelled,version:1};events=[e];return answer({id:e.id})}
    if(body.op==='assign'){assignments=[{id:'assign-1',ministryId:body.payload.ministryId,personId:body.payload.personId,name:'Test Owner',functionId:body.payload.functionId,functionName:'Vocalista',response:'pending'}];return answer({id:body.payload.eventId})}
    if(body.op==='respond'){assert.equal(role,'viewer');assignments[0].response=body.payload.response;return answer({id:body.payload.eventId})}
    if(body.op==='unassign'){assert.equal(canManage,true);assignments=[];return answer({id:body.payload.eventId})}
    throw new Error('Unexpected event operation '+body.op)
  }
  if(table==='media_portal'){
   if(body.op==='read')return answer(media)
   if(body.op==='avatar'){avatarWrites++;assert.ok(body.payload.path.startsWith(user.id+'/'));media.avatars[user.id]=body.payload.path;return answer({ok:true})}
   if(body.op==='brand'){brandWrites++;media.brand=body.payload;return answer({ok:true})}
   if(body.op==='inventory')return answer({items:removed?[used]:[used,unused],count:removed?1:2,bytes:200})
   if(body.op==='reserveDeletion'){assert.equal(body.payload.confirmed,true);assert.equal(body.payload.items.length,1);assert.match(body.payload.items[0].sha256,/^[a-f0-9]{64}$/);reserved=true;return answer({ok:true})}
   if(body.op==='finishDeletion'){assert.equal(removed,true);return answer({ok:true})}
  }
  if(url.pathname.includes('/storage/')){
   if(url.pathname.includes('/object/sign/')&&method==='POST')return answer(body.paths.map(path=>({path,signedURL:'/object/sign/identity-images/'+path+'?token=fixture',error:null})))
   if(method==='DELETE'){assert.equal(reserved,true);assert.deepEqual(body.prefixes,[unused.path]);removed=true;return answer([{name:unused.path}])}
   if(method==='POST')return answer({Key:table,Id:'uploaded'})
   return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64')})
  }
  if (table === 'announcement_portal') {
   if(body.op==='list')return answer({canManage:role==='admin',items:banners,nextChangeAt:null})
   if(body.op==='manage')return answer(banners)
   if(body.op==='editors')return answer([{id:'editor-1',name:'Pessoa Comunicação',enabled:false}])
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
 await page.getByRole('button',{name:'Calendário',exact:true}).click()
 await page.getByRole('button',{name:'Minhas indisponibilidades',exact:true}).click()
 const local=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)
 await page.getByLabel('Início da indisponibilidade',{exact:true}).fill(local(tomorrow))
 await page.getByLabel('Término da indisponibilidade',{exact:true}).fill(local(new Date(tomorrow.getTime()+3600000)))
 await page.getByLabel('Repetir indisponibilidade',{exact:true}).selectOption('weekly')
 await page.getByLabel('Quantidade de períodos',{exact:true}).fill('2')
 await page.getByRole('button',{name:'Salvar indisponibilidade',exact:true}).click()
 await page.getByRole('button',{name:'Retirar indisponibilidade',exact:true}).first().waitFor()
 assert.equal(periods.length,2)
 await page.getByRole('button',{name:'Retirar indisponibilidade',exact:true}).first().click()
 await page.waitForFunction(()=>document.querySelectorAll('button').length>0)
 await page.getByRole('button',{name:'Close',exact:true}).click()
 assert.equal(periods.length,1)
 await page.getByRole('button',{name:/18:00 · Ensaio recorrente/}).click()
 await page.getByLabel('Minha atribuição',{exact:true}).selectOption('assign-1')
 await page.getByRole('option',{name:'Pessoa Substituta',exact:true}).waitFor({state:'attached'})
 await page.getByLabel('Substituto elegível',{exact:true}).selectOption('replacement-1')
 await page.getByRole('button',{name:'Enviar solicitação de troca',exact:true}).click()
 await page.getByText('Test Owner → Pessoa Substituta · Pendente',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Aprovar troca',exact:true}).count(),0)
 assert.equal(await page.getByRole('heading',{name:'Repetir evento',exact:true}).count(),0)
 await page.getByRole('button',{name:'Close',exact:true}).click()
 role='leader';await page.reload()
 await page.getByRole('button',{name:'Calendário',exact:true}).click()
 await page.getByRole('button',{name:/18:00 · Ensaio recorrente/}).click()
 await page.getByRole('button',{name:'Aprovar troca',exact:true}).click()
 await page.getByRole('alertdialog').getByRole('button',{name:'Aprovar troca',exact:true}).click()
 await page.getByText('Test Owner → Pessoa Substituta · Aprovada',{exact:true}).waitFor()
 await page.getByText('Pessoa Substituta · Vocalista',{exact:true}).waitFor()
 assert.equal(decisions,1)
 await page.getByLabel('Quantidade de eventos',{exact:true}).fill('3')
 await page.getByLabel('Copiar repertório e roteiro para cada ocorrência',{exact:true}).check()
 await page.getByRole('button',{name:'Conferir datas da série',exact:true}).click()
 await page.getByRole('button',{name:'Confirmar criação da série',exact:true}).waitFor()
 assert.equal(repeats,0)
 await page.getByRole('button',{name:'Confirmar criação da série',exact:true}).click()
 await page.getByRole('button',{name:'Cancelar esta e as próximas ocorrências',exact:true}).waitFor()
 assert.equal(repeats,1)
 await page.setViewportSize({width:390,height:844})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.screenshot({path:'test-results/scheduling-mobile.png',fullPage:true})
 await page.getByRole('button',{name:'Cancelar esta e as próximas ocorrências',exact:true}).click()
 await page.getByRole('alertdialog').getByRole('button',{name:'Cancelar ocorrências',exact:true}).click()
 await page.getByText('Celebração · Cancelado',{exact:true}).waitFor()
 assert.deepEqual(errors,[])
 console.log('Scheduling browser passed: personal recurring unavailability, withdrawal, swap request/approval and pending substitute, preview/confirm series, cancellation, role limits and mobile.')
} finally {await browser.close()}
