import { describe, expect, it } from 'vitest'

import { requestCode } from './request-code'

describe('request codes', () => {
  it('pads the number after the workspace code', () => {
    expect(requestCode(3, 'AB')).toBe('R-AB03')
  })
})
