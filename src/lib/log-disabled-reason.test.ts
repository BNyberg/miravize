import { describe, expect, it } from 'vitest'

import { logDisabledReason } from './log-disabled-reason'

const ready = {
  pending: false,
  track: true,
  hasWorkspace: true,
  hasText: true,
  hasProject: true,
  textLabel: 'request' as const,
}

describe('log disabled reasons', () => {
  it('stays quiet while a save is in flight or the form is complete', () => {
    expect(logDisabledReason({ ...ready, pending: true })).toBeNull()
    expect(logDisabledReason(ready)).toBeNull()
  })

  it('names the missing request text', () => {
    expect(logDisabledReason({ ...ready, hasText: false })).toContain('Add a request')
  })

  it('asks for a project when tracking still needs one', () => {
    expect(logDisabledReason({ ...ready, hasProject: false })).toBe('Choose a project.')
  })
})
