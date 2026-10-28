import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) })
const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
const origin = process.env.TEST_URL ?? 'http://127.0.0.1:5173'
const user = { id: '10000000-0000-0000-0000-000000000001', email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {} }
const profile = { ...user, name: 'Test Owner', initials: 'TO', is_admin: true, color: '#336699' }
const project = { id: 'project-1', name: 'Fixture project', color: '#336699', emoji: 'folder', suspended: false, created_by: user.id, created_at: user.created_at }
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
  if (['lt_task_comments','lt_task_activity','lt_task_checklist','lt_task_links'].includes(table) && method === 'POST') {
    const rows = (Array.isArray(body) ? body : [body]).map(data => ({ ...data, id: 'child-'+(++sequence), created_at: user.created_at }))
    for (const row of rows) tasks.find(t=>t.id===row.task_id)?.[table].push(row)
    return answer(single ? rows[0] : rows)
  }
  return answer([])
})
function broadcast(table='lt_tasks') {
  for (const [topic,ws] of channels) if (topic.includes('task-data')) {
    const names = ['lt_tasks','lt_projects','lt_project_members','lt_task_comments','lt_task_checklist','lt_task_activity','lt_task_links']
    ws.send(JSON.stringify({ topic, event: 'postgres_changes', payload: { ids: [names.indexOf(table)+1], data: { schema: 'public', table, type: 'INSERT', commit_timestamp: user.created_at, new: {}, old: {}, errors: null } } }))
  }
}
try {
  // Exercise the real hook in StrictMode without product-only test switches.
  await page.route(origin+'/__foundation-test', route => route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}))
  await page.goto(origin+'/__foundation-test')
  await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js')
    const React = reactModule.default ?? reactModule
    const domModule = await import('/node_modules/.vite/deps/react-dom_client.js')
    const { createRoot } = domModule.default ?? domModule
    const { useTaskStore } = await import('/src/store/useTaskStore.ts')
    document.getElementById('root').remove()
    const container = document.createElement('div'); document.body.appendChild(container)
    window.testRoot = createRoot(container)
    function Harness() { const store = useTaskStore(); React.useEffect(() => { window.testStore=store }); return null }
    window.testRoot.render(React.createElement(React.StrictMode, null, React.createElement(Harness)))
  })
  await page.waitForFunction(() => window.testStore?.tasks.length===1 && !window.testStore.loading)
  await page.evaluate(() => window.testStore.addTask({ title: 'Added once', description: '', status: 'todo', priority: 'none', projectId: 'project-1', dueDate: null, tags: [], recurring: null, position: 0, assignee: null }))
  broadcast()
  await page.waitForFunction(() => window.testStore.tasks.length===2)
  assert.equal(await page.evaluate(() => new Set(window.testStore.tasks.map(t=>t.id)).size),2)
  await page.evaluate(() => window.testStore.addComment('task-1','Keep this comment'))
  broadcast()
  await page.waitForFunction(() => window.testStore.tasks.find(t=>t.id==='task-1').comments.length===1)
  const insertsBeforeMove = taskInserts
  await page.evaluate(() => Promise.all([window.testStore.moveTask('task-1','done'),window.testStore.moveTask('task-1','done')]))
  assert.equal(taskInserts,insertsBeforeMove,'completion must not insert recurrence from React')
  await page.evaluate(() => window.testStore.duplicateTask('task-1'))
  await page.waitForFunction(() => window.testStore.tasks.some(t=>t.title==='Cópia de Fixture task' && t.checklist.length===1))
  assert.notEqual(await page.evaluate(() => window.testStore.tasks.find(t=>t.title==='Cópia de Fixture task').checklist[0].id),'check-1')
  await new Promise(resolve=>setTimeout(resolve,500))
  const readsBeforeBurst=taskReads
  for(let i=0;i<20;i++)broadcast()
  await new Promise(resolve=>setTimeout(resolve,500))
  assert.ok(taskReads-readsBeforeBurst<=2,'Realtime events should be batched')
  const previous=await page.evaluate(()=>window.testStore.tasks.length)
  failReads=true
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.waitForFunction(()=>window.testStore.loadError?.includes('últimos dados'))
  assert.equal(await page.evaluate(()=>window.testStore.tasks.length),previous)
  failReads=false
  const beforeUnmount=taskReads
  await page.evaluate(()=>window.testRoot.unmount())
  await new Promise(resolve=>setTimeout(resolve,200))
  for(let i=0;i<5;i++)broadcast()
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await new Promise(resolve=>setTimeout(resolve,300))
  assert.equal(taskReads,beforeUnmount,'unmounted hooks must not reload')

  // Smoke-test the actual application and each preserved page with fixtures.
  tasks=[structuredClone(initialTask)]
  await page.goto(origin)
  await page.waitForFunction(()=>document.body.innerText.includes('Promessa Industrial'))
  for(const name of ['Tarefas','Projetos','Notas','Calendário','Dashboard','Usuários','Configurações']) {
    await page.getByRole('button',{name:new RegExp('^'+name+'(?:\\s|$)')}).first().click()
    await page.waitForTimeout(150)
    assert.ok(!(await page.locator('body').innerText()).includes('Cannot read'))
  }
  assert.equal(await page.getByText('Canto',{exact:true}).count(),0)
  assert.equal(await page.getByText('Inbox',{exact:true}).count(),0)
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'Notas',exact:true}).last().click()
  assert.ok(await page.getByRole('button',{name:'Buscar',exact:true}).last().isVisible())
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({passed:true,checks:['StrictMode','insert deduplication','comment preservation','server recurrence','duplicate checklist IDs','batched Realtime','load errors preserve state','unmount cleanup','seven preserved pages','mobile navigation'],taskReads,maxReads}))
} finally { await browser.close() }
