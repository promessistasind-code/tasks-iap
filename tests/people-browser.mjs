import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL??'msedge',headless:true})
const page = await browser.newPage({viewport:{width:1365,height:900}})
const user={id:'60000000-0000-0000-0000-000000000001',email:'admin@example.invalid',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}}
let status={ready:false,passwordRequired:false,resetInProgress:false,consented:false,firstName:'',lastName:'',phone:'',birthDate:null,email:user.email,isAdmin:true,isGeneralAdmin:true,isLeader:false}
const membership={person_id:'person-2',ministry_id:'ministry-1',function_ids:['function-1'],leader:false,can_add:false,can_edit_roles:false,can_remove:false,active:true,added_by:user.id}
const person={id:'person-2',userId:'60000000-0000-0000-0000-000000000002',firstName:'Maria',lastName:'Silva',email:'maria@example.invalid',phone:'11999999999',birthDate:'1990-01-01',consented:true,isAdmin:false,active:true,memberships:[membership]}
const catalog=[{id:'ministry-1',name:'Ministério de Celebração',functions:[{id:'function-1',name:'vocalista'},{id:'function-2',name:'baixista'}]}]
let taskReads=0,resetCalls=0,createCalls=0,memberWrites=0
const errors=[];page.on('pageerror',e=>errors.push(e.message))
await page.addInitScript(({user})=>{const payload=btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'}));localStorage.setItem('sb-hnplfnxlmkdxpvqqrden-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}))},{user})
await page.routeWebSocket(/supabase\.co/,()=>{})
await page.route('**/hnplfnxlmkdxpvqqrden.supabase.co/**',async route=>{
 const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1),body=req.postDataJSON()
 const answer=(data)=>route.fulfill({contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}})
 if(url.pathname.includes('/auth/')){if(req.method()==='PUT')status.passwordRequired=false;return answer(user)}
 if(table==='profiles')return answer((req.headers().accept??'').includes('vnd.pgrst.object')?{...user,name:'Admin User',color:'#336699',initials:'AU',is_admin:status.isAdmin}:[{...user,name:'Admin User',color:'#336699',initials:'AU'}])
 if(table==='people_portal'){
  if(body.op==='status')return answer(status)
  if(body.op==='complete'){assert.equal(body.payload.consent,true);status={...status,...body.payload,ready:true,consented:true};return answer({ok:true})}
  if(body.op==='directory')return answer([{...person,birthDate:undefined,birthdayMonth:new Date().getMonth()+1,birthdayDay:new Date().getDate()}])
  if(body.op==='management')return answer([person])
  if(body.op==='catalog')return answer(catalog)
  if(body.op==='myMemberships')return answer(status.isLeader?[{...membership,leader:true,can_add:true,can_edit_roles:true}]:[])
  if(body.op==='membership'){memberWrites++;assert.equal(body.payload.ministryId,'ministry-1');membership.function_ids=body.payload.functionIds;return answer({ok:true})}
  return answer([])
 }
 if(table==='admin-reset-password'){resetCalls++;assert.equal(body.userId,person.userId);return answer({ok:true})}
 if(table==='admin-create-user'){createCalls++;assert.equal(body.invitation,true);assert.equal(body.consent,false);return answer({ok:true})}
 if(table==='lt_tasks')taskReads++
 return answer([])
})
try{
 await page.goto(process.env.TEST_URL??'http://127.0.0.1:5174')
 await page.getByRole('heading',{name:'Complete seu cadastro'}).waitFor()
 assert.equal(taskReads,0,'onboarding must not mount business modules')
 assert.equal(await page.getByRole('button',{name:'Continuar',exact:true}).isEnabled(),false)
 await page.getByLabel('Nome',{exact:true}).fill('Admin')
 await page.getByLabel('Sobrenome',{exact:true}).fill('User')
 await page.getByLabel('Telefone',{exact:true}).fill('11999999999')
 await page.getByLabel('Data de nascimento',{exact:true}).fill('1990-01-01')
 await page.getByRole('checkbox').check()
 await page.getByRole('button',{name:'Continuar',exact:true}).click()
 await page.getByRole('button',{name:'Pessoas e usuários',exact:true}).click()
 await page.getByRole('heading',{name:'Pessoas e usuários'}).waitFor()
 await page.getByRole('switch',{name:'Redefinir senha',exact:true}).check()
 await page.getByLabel('Senha temporária',{exact:true}).fill('Temporary-test-123!')
 await page.getByRole('button',{name:'Confirmar redefinição'}).click()
 await page.getByRole('dialog').waitFor({state:'hidden'})
 assert.equal(resetCalls,1)
 assert.equal(await page.getByRole('switch',{name:'Redefinir senha',exact:true}).isChecked(),false)
 await page.getByRole('button',{name:'Funções e permissões'}).click()
 await page.getByRole('switch',{name:'baixista',exact:true}).check()
 await page.getByRole('button',{name:'Salvar permissões'}).click()
 await page.getByRole('dialog').waitFor({state:'hidden'})
 assert.equal(memberWrites,1);assert.deepEqual(membership.function_ids,['function-1','function-2'])
 await page.getByRole('button',{name:'Convidar usuário',exact:true}).click()
 await page.getByRole('switch',{name:'A pessoa preenche os próprios dados no primeiro acesso'}).check()
 await page.getByLabel('Email',{exact:true}).fill('invite@example.invalid')
 await page.getByLabel('Senha temporária',{exact:true}).fill('Temporary-test-123!')
 await page.getByRole('button',{name:'Salvar',exact:true}).click()
 await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(createCalls,1)
 await page.getByRole('button',{name:'Calendário',exact:true}).click()
 await page.getByText('🎂 Maria Silva',{exact:true}).waitFor()
 assert.ok(!(await page.locator('body').innerText()).includes('1990'))
 status={...status,isAdmin:false,isGeneralAdmin:false,isLeader:true}
 await page.reload();await page.getByRole('button',{name:'Pessoas e usuários',exact:true}).click()
 await page.getByRole('heading',{name:'Pessoas e usuários'}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Convidar usuário',exact:true}).count(),0)
 assert.equal(await page.getByRole('switch',{name:'Administrador',exact:true}).count(),0)
 assert.equal(await page.getByRole('switch',{name:'Redefinir senha',exact:true}).count(),0)
 await page.getByRole('button',{name:'Funções e permissões'}).click()
 assert.equal(await page.getByRole('switch',{name:'Líder deste ministério'}).count(),0)
 await page.getByRole('button',{name:'Close',exact:true}).click()
 await page.setViewportSize({width:390,height:844});await page.getByRole('heading',{name:'Pessoas e usuários'}).waitFor({state:'visible'})
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({passed:true,checks:['consent gates business modules','explicit consent','password reset toggle returns off','multiple ministry functions','administrator invitation','birthday without year','leader UI scope','mobile layout'],resetCalls,createCalls,memberWrites}))
}finally{await browser.close()}
