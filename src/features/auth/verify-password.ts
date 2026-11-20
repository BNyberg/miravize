import { createClient } from '@supabase/supabase-js'

import { supabasePublishableKey, supabaseUrl } from '@/lib/supabase'

function currentPasswordMessage(error: { message: string; code?: string }) {
  if (error.code === 'invalid_credentials' || error.message === 'Invalid login credentials') {
    return 'Current password is incorrect.'
  }
  return error.message
}

function createVerifier() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sb-password-verify',
    },
  })
}

function invalidPassword(error: { message: string; code?: string }) {
  return error.code === 'invalid_credentials' || error.message === 'Invalid login credentials'
}

async function checkCurrentPassword(email: string, password: string) {
  const verifier = createVerifier()
  const signedIn = await verifier.auth.signInWithPassword({ email, password })
  if (signedIn.error) return signedIn.error
  const signedOut = await verifier.auth.signOut({ scope: 'local' })
  if (signedOut.error) throw new Error(signedOut.error.message)
  return null
}

export async function verifyCurrentPassword(email: string, password: string) {
  const error = await checkCurrentPassword(email, password)
  if (error) throw new Error(currentPasswordMessage(error))
}

export async function passwordMatchesCurrent(email: string, password: string) {
  const error = await checkCurrentPassword(email, password)
  if (!error) return true
  if (invalidPassword(error)) return false
  throw new Error(error.message)
}
