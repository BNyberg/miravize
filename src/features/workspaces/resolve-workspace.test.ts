import { describe, expect, it } from 'vitest'

import { resolveWorkspaceSelection } from './resolve-workspace'

const memberships = [{ workspace_id: 'alpha' }, { workspace_id: 'beta' }]

describe('workspace selection', () => {
  it('keeps all and a known workspace', () => {
    expect(resolveWorkspaceSelection('all', memberships).isAll).toBe(true)
    expect(resolveWorkspaceSelection('beta', memberships).validId).toBe('beta')
  })

  it('falls back to the first membership when the stored id is gone', () => {
    expect(resolveWorkspaceSelection('missing', memberships).validId).toBe('alpha')
  })

  it('stays on all when there are no memberships', () => {
    expect(resolveWorkspaceSelection('missing', []).validId).toBe('all')
  })
})
