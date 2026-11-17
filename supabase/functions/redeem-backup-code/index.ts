import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Factor = { id?: string; status?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

    const body = (await req.json().catch(() => null)) as { code?: string } | null
    const code = body?.code?.trim() ?? ''
    if (!code) return json({ error: 'Enter a backup code.' }, 400)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const matched = await admin.rpc('match_mfa_recovery_code', {
      p_user_id: userData.user.id,
      p_code: code,
    })
    if (matched.error) return json({ error: matched.error.message }, 400)
    if (!matched.data) return json({ error: 'That backup code is not valid.' }, 400)

    const headers = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    }
    const listed = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userData.user.id}/factors`, { headers })
    const factors = (await listed.json().catch(() => null)) as Factor[] | { factors?: Factor[]; message?: string } | null
    if (!listed.ok) {
      const message = factors && !Array.isArray(factors) ? factors.message : null
      return json({ error: message || 'Could not remove the authenticator.' }, 400)
    }
    const rows = Array.isArray(factors) ? factors : (factors?.factors ?? [])
    for (const factor of rows) {
      if (!factor.id || factor.status !== 'verified') continue
      const removed = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userData.user.id}/factors/${factor.id}`, {
        method: 'DELETE',
        headers,
      })
      if (!removed.ok) return json({ error: 'Could not remove the authenticator.' }, 400)
    }

    const metadata = {
      ...(userData.user.user_metadata ?? {}),
      mfa_reenroll_required: true,
      mfa_setup_skipped: false,
      mfa_backup_pending: false,
    }
    const updated = await admin.auth.admin.updateUserById(userData.user.id, { user_metadata: metadata })
    if (updated.error) return json({ error: updated.error.message }, 400)

    const consumed = await admin.rpc('consume_mfa_recovery_code', { p_id: matched.data })
    if (consumed.error) return json({ error: consumed.error.message }, 400)

    return json({ ok: true })
  } catch (error) {
    console.error('redeem-backup-code', error)
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
