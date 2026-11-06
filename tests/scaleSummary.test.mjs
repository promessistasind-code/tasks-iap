import {test} from 'node:test'
import assert from 'node:assert/strict'
import {scaleSummary} from '../src/lib/scaleSummary.ts'

test('summary counts people per indicator and respects ministry scope', () => {
  const detail = {event:{canManage:false}, scheduleMinistries:[{id:'mine'}], assignments:[
    {personId:'a',response:'confirmed',canManage:true,swapPending:true},
    {personId:'a',response:'confirmed',canManage:true,swapPending:true},
    {personId:'b',response:'pending',canManage:true},
    {personId:'c',response:'declined',canManage:false},
  ]}
  assert.deepEqual(scaleSummary(detail),{confirmed:1,pending:1,declined:0,swaps:1})
  assert.deepEqual(scaleSummary({...detail,event:{canManage:true}}),{confirmed:1,pending:1,declined:1,swaps:1})
  assert.equal(scaleSummary({...detail,scheduleMinistries:[],assignments:[detail.assignments[3]]}),null)
})
