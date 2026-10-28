import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upsertById } from '../src/store/tasks/state.ts'
import { withTimeout } from '../src/lib/async.ts'

test('an INSERT event followed by the insert response keeps one task and its activity', () => {
  const event = { id: 'new', activity: [] }
  const response = { id: 'new', activity: ['created'] }
  const items = upsertById(upsertById([{ id: 'old', activity: [] }], event), response)
  assert.equal(items.length, 2)
  assert.deepEqual(items[0], response)
})

test('upsert replaces a task without mutating the previous snapshot or changing order', () => {
  const snapshot = [{ id: 'a', status: 'todo' }, { id: 'b', status: 'todo' }]
  const next = upsertById(snapshot, { id: 'b', status: 'done' })
  assert.deepEqual(next.map(t => t.id), ['a','b'])
  assert.equal(snapshot[1].status, 'todo')
  assert.equal(next[1].status, 'done')
})

test('timeouts reject stalled operations and successful operations release their timer', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5), /timeout/)
  assert.equal(await withTimeout(Promise.resolve('ok'), 10000), 'ok')
  await assert.rejects(withTimeout(Promise.reject(new Error('network')), 10000), /network/)
  // A leaked 10 second timer would keep this test process alive after completion.
})
