import { ESLint } from 'eslint'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
const eslint = new ESLint()
const files = execFileSync('git',['ls-files','src'],{encoding:'utf8'}).trim().split('\n').filter(f=>/\.tsx?$/.test(f))
const summarize = results => results.flatMap(result=>result.messages.map(m=>({file:path.relative(process.cwd(),result.filePath).replaceAll('\\','/'),rule:m.ruleId,severity:m.severity})))
const baseline = []
for(const file of files) baseline.push(...await eslint.lintText(execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}),{filePath:path.resolve(file)}))
const current = await eslint.lintFiles(['src'])
const before=summarize(baseline),after=summarize(current)
const count = list => list.reduce((map,m)=>{const k=m.file+':'+m.rule+':'+m.severity;map[k]=(map[k]??0)+1;return map},{})
const a=count(before),b=count(after)
const regressions=Object.entries(b).filter(([key,value])=>value>(a[key]??0))
const report={baselineErrors:before.filter(m=>m.severity===2).length,currentErrors:after.filter(m=>m.severity===2).length,regressions}
fs.mkdirSync('test-results',{recursive:true})
fs.writeFileSync('test-results/lint-comparison.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
if(regressions.length)process.exitCode=1
