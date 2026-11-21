import { describe, expect, it } from 'vitest'

import { isValidEmail } from './email'

describe('email validation', () => {
  it('accepts a normal address and rejects a blank one', () => {
    expect(isValidEmail('  person@example.com ')).toBe(true)
    expect(isValidEmail('person@example')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
})
