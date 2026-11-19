import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://unavailable.supabase.co'
export const supabasePublishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? 'sb_publishable_placeholder'

export const isSupabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)

export const supabase: SupabaseClient = createClient(supabaseUrl, supabasePublishableKey)
