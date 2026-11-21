import { describe, expect, it } from 'vitest'

import { functionError } from './function-error'

describe('edge function errors', () => {
  it('uses the error string from the function body', async () => {
    const error = {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => ({ error: 'Invite expired' }) },
    }
    await expect(functionError(error)).resolves.toBe('Invite expired')
  })

  it('keeps a specific client error', async () => {
    await expect(functionError(new Error('Not signed in'))).resolves.toBe('Not signed in')
  })

  it('falls back when the body has no error string', async () => {
    const error = {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => ({}) },
    }
    await expect(functionError(error, 'Try again.')).resolves.toBe('Try again.')
  })
})
