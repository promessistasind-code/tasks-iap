import {test} from 'node:test'
import assert from 'node:assert/strict'
import {eventFallsOn,dateInput} from '../src/lib/eventDates.ts'
test('events span days but an exact midnight end excludes the following day',()=>{
 const event={starts_at:new Date(2026,9,29,23).toISOString(),ends_at:new Date(2026,9,31,0).toISOString()}
 assert.equal(eventFallsOn(event,new Date(2026,9,28)),false)
 assert.equal(eventFallsOn(event,new Date(2026,9,29)),true)
 assert.equal(eventFallsOn(event,new Date(2026,9,30)),true)
 assert.equal(eventFallsOn(event,new Date(2026,9,31)),false)
})
test('input preserves local wall-clock time across UTC offsets',()=>{
 const day=new Date(2026,9,29,23,35)
 assert.equal(dateInput(day.toISOString()),'2026-10-29T23:35')
 assert.equal(new Date(dateInput(day.toISOString())).getTime(),day.getTime())
})
