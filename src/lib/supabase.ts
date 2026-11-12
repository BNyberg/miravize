import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && publishableKey)

export const supabase: SupabaseClient = createClient(
  url ?? 'https://unavailable.supabase.co',
  publishableKey ?? 'sb_publishable_placeholder',
)
