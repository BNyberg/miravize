import { describe, expect, it } from 'vitest'

import { isSamePasswordError, passwordDiffersFromCurrent, passwordIsStrong } from './password'

describe('password rules', () => {
  it('requires every strength rule', () => {
    expect(passwordIsStrong('short')).toBe(false)
    expect(passwordIsStrong('Password1!')).toBe(true)
  })

  it('rejects an unchanged password', () => {
    expect(passwordDiffersFromCurrent('Password1!', 'Password1!')).toBe(false)
    expect(passwordDiffersFromCurrent('Password1!', 'Password2!')).toBe(true)
  })

  it('recognizes the same-password error', () => {
    expect(isSamePasswordError({ code: 'same_password' })).toBe(true)
    expect(isSamePasswordError({ message: 'New password should be different from the old password.' })).toBe(true)
    expect(isSamePasswordError({ message: 'Invalid login' })).toBe(false)
  })
})
