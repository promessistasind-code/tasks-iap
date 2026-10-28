import { test } from 'node:test'
import assert from 'node:assert/strict'
import { birthdayFallsOn } from '../src/lib/birthdays.ts'
test('birthday reminders repeat annually without storing or exposing birth year',()=>{
 assert.equal(birthdayFallsOn(6,15,new Date(2026,5,15)),true)
 assert.equal(birthdayFallsOn(6,15,new Date(2027,5,15)),true)
 assert.equal(birthdayFallsOn(6,15,new Date(2027,5,14)),false)
 assert.equal(birthdayFallsOn(undefined,undefined,new Date()),false)
})
test('February 29 occurs once in leap and ordinary years',()=>{
 assert.equal(birthdayFallsOn(2,29,new Date(2028,1,29)),true)
 assert.equal(birthdayFallsOn(2,29,new Date(2028,1,28)),false)
 assert.equal(birthdayFallsOn(2,29,new Date(2027,1,28)),true)
 assert.equal(birthdayFallsOn(2,29,new Date(2027,2,1)),false)
})
