import { describe, expect, it } from 'vitest'

import { allocateSeconds, formatDuration, formatHours, splitsTotal } from './splits'

describe('duration formatting', () => {
  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toBe('01:01:01')
    expect(formatDuration(-4)).toBe('00:00:00')
  })

  it('formats decimal hours', () => {
    expect(formatHours(5400)).toBe('1.50')
  })
})

describe('client splits', () => {
  it('gives leftover seconds to the largest share', () => {
    const allocated = allocateSeconds(100, [
      { clientId: 'a', percent: 33 },
      { clientId: 'b', percent: 33 },
      { clientId: 'c', percent: 34 },
    ])
    expect(allocated.map((share) => share.seconds).sort((left, right) => left - right)).toEqual([33, 33, 34])
    expect(allocated.reduce((sum, share) => sum + share.seconds, 0)).toBe(100)
  })

  it('rounds the percent total', () => {
    expect(splitsTotal([{ clientId: 'a', percent: 33.333 }, { clientId: 'b', percent: 66.667 }])).toBe(100)
  })
})
