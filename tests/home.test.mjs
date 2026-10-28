import {test} from 'node:test'
import assert from 'node:assert/strict'
import {homeStats} from '../src/lib/homeStats.ts'
test('home counts dates, excluding today from overdue and unknown completion dates',()=>{
 const now=new Date(2026,9,28,12)
 const stats=homeStats([
  {status:'todo',dueDate:'2026-10-28'}, {status:'todo',dueDate:'2026-10-27'},
  {status:'in-progress'}, {status:'done',completedAt:new Date(2026,9,28,9).toISOString()},
  {status:'done'}, {status:'done',completedAt:new Date(2026,9,27,9).toISOString()},
  {status:'todo',completedAt:new Date(2026,9,28,9).toISOString()}
 ],now)
 assert.deepEqual(stats,{total:7,done:3,inProgress:1,overdue:1,doneToday:1})
})
