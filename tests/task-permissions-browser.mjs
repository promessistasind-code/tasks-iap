import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) })
const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
const origin = process.env.TEST_URL ?? 'http://127.0.0.1:5173'
const user = { id: '10000000-0000-0000-0000-000000000001', email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {} }
let role = 'viewer'
const profile = { ...user, name: 'Test Owner', initials: 'TO', is_admin: false, color: '#336699' }
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
  if (table === 'people_portal') return answer(body.op === 'status' ? { ready: true, consented: true, passwordRequired: false, isAdmin: false, isGeneralAdmin: false, isLeader: role === 'leader', email: user.email, firstName: 'Test', lastName: 'Owner', phone: '11999999999', birthDate: '1990-01-01' } : [])
  if (table === 'workspace_access') return answer({ministries:role === 'leader' ? [{id:'ministry-1',name:'Celebração'}] : [],projects:[{id:project.id,canManage:role === 'leader',canCreateTasks:role === 'leader' || role === 'delegate',eligibleMemberIds:[user.id]}]})
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
function broadcast(table='lt_tasks') {
  for (const [topic,ws] of channels) if (topic.includes('task-data')) {
    const names = ['lt_tasks','lt_projects','lt_project_members','lt_task_comments','lt_task_checklist','lt_task_activity','lt_task_links']
    ws.send(JSON.stringify({ topic, event: 'postgres_changes', payload: { ids: [names.indexOf(table)+1], data: { schema: 'public', table, type: 'INSERT', commit_timestamp: user.created_at, new: {}, old: {}, errors: null } } }))
  }
}
try {
 for (role of ['viewer','team','responsible','delegate','leader']) {
  tasks = [{...structuredClone(initialTask),assignee_id:role === 'responsible' ? user.id : 'other-user',team_ids:role === 'team' ? [user.id] : []}]
  await page.goto(origin)
  await page.getByRole('button',{name:'Tarefas',exact:true}).first().click()
  await page.getByText('Fixture task',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Nova tarefa',exact:true}).isEnabled(),['delegate','leader'].includes(role),role+' creation button')
  if (['responsible','leader'].includes(role)) await page.getByRole('button',{name:'Abrir detalhes',exact:true}).click()
  else await page.getByText('Fixture task',{exact:true}).click()
  if (['responsible','leader'].includes(role)) {
   await page.getByPlaceholder('Título da tarefa',{exact:true}).waitFor()
   await page.getByLabel('Responsável',{exact:true}).waitFor()
  } else {
   await page.getByRole('heading',{name:'Fixture task',exact:true}).waitFor()
   assert.equal(await page.getByPlaceholder('Título da tarefa',{exact:true}).count(),0)
   assert.equal(await page.getByRole('button',{name:'Enviar comentário',exact:true}).count(),role === 'team' ? 1 : 0)
  }
 }
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({passed:true,checks:['viewer read-only','team comments only','responsible edit','delegated creation','ministry leader edit']}))
} finally {await browser.close()}
