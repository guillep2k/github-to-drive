import {decodeAction, gitAction} from '../src/git-tasks'
import {expect, test} from '@jest/globals'

// Not really using tests
test('returns gitAction.A', () => {
  expect(decodeAction('A') === gitAction.A)
})

test('returns undefined', () => {
  expect(decodeAction('X') === undefined)
})
