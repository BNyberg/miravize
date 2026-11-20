import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DISCLOSURES } from './disclosures.ts'
import { onboardingIndex, resumeOnboarding } from './progress.ts'
import { recoveryGroupMatches, recoveryGroups } from './recovery-check.ts'

describe('resumeOnboarding', () => {
  const base = {
    emailConfirmed: true,
    mfaChoice: null,
    cryptoStatus: null,
    recoveryConfirmed: false,
    completed: false,
  } as const

  it('stops at the first unfinished requirement', () => {
    assert.equal(resumeOnboarding({ ...base, emailConfirmed: false }), 'verify')
    assert.equal(resumeOnboarding(base), 'mfa')
    assert.equal(resumeOnboarding({ ...base, mfaChoice: 'skipped' }), 'recovery')
    assert.equal(
      resumeOnboarding({ ...base, mfaChoice: 'enrolled', cryptoStatus: 'ready', recoveryConfirmed: false }),
      'recovery',
    )
    assert.equal(
      resumeOnboarding({ ...base, mfaChoice: 'skipped', cryptoStatus: 'ready', recoveryConfirmed: true }),
      'workspace',
    )
    assert.equal(
      resumeOnboarding({
        ...base,
        mfaChoice: 'skipped',
        cryptoStatus: 'ready',
        recoveryConfirmed: true,
        completed: true,
      }),
      'done',
    )
  })

  it('keeps six visible steps', () => {
    assert.equal(onboardingIndex('workspace'), 5)
  })
})

describe('recovery confirmation', () => {
  it('matches one group and ignores the others', () => {
    const formatted = 'abcd efgh ijkl'
    assert.deepEqual(recoveryGroups(formatted), ['abcd', 'efgh', 'ijkl'])
    assert.equal(recoveryGroupMatches(formatted, 1, 'efgh'), true)
    assert.equal(recoveryGroupMatches(formatted, 1, ' efgh '), true)
    assert.equal(recoveryGroupMatches(formatted, 1, 'abcd'), false)
  })
})

describe('disclosures', () => {
  it('uses a separate key and version for each page', () => {
    const keys = Object.values(DISCLOSURES).map((item) => item.key)
    assert.equal(new Set(keys).size, keys.length)
    for (const item of Object.values(DISCLOSURES)) {
      assert.equal(item.version, 1)
    }
  })
})
