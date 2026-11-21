import { describe, expect, it } from 'vitest'

import { suggestWorkspaceIdCode, workspaceIdInput } from './workspace-id-code'

describe('workspace id codes', () => {
  it('uses the first letter of a single word', () => {
    expect(suggestWorkspaceIdCode('  miravize ')).toBe('M')
  })

  it('uses up to three initials', () => {
    expect(suggestWorkspaceIdCode('North Star Studio Extra')).toBe('NSS')
  })

  it('keeps only letters and three characters', () => {
    expect(workspaceIdInput('ab12c!')).toBe('ABC')
  })
})
