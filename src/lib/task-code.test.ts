import { describe, expect, it } from 'vitest'

import { taskCode } from './task-code'

describe('task codes', () => {
  it('pads the number after the workspace code', () => {
    expect(taskCode(12, 'M')).toBe('T-M12')
  })
})
