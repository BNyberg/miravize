import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM = 'Miravize <noreply@miravize.com>'

type Body = { invite_id?: string; origin?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization')
    if (!resendKey) return json({ error: 'RESEND_API_KEY is not configured.' }, 400)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) throw new Error('Not authenticated')
    const { data: assurance, error: assuranceErr } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceErr) throw new Error(assuranceErr.message)
    if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
      return json({ error: 'Two-factor authentication is required.' }, 403)
    }

    const body = (await req.json()) as Body
    if (!body.invite_id) return json({ error: 'Missing invite.' }, 400)
    let origin: URL
    try {
      origin = new URL(body.origin ?? '')
    } catch {
      return json({ error: 'Missing app origin.' }, 400)
    }
    if (origin.protocol !== 'https:' && origin.protocol !== 'http:') {
      return json({ error: 'Missing app origin.' }, 400)
    }

    const { data: invite, error: inviteErr } = await userClient
      .from('workspace_invites')
      .select('id, email, token, accepted_at, workspace_label, workspace:workspaces(name, id_code)')
      .eq('id', body.invite_id)
      .maybeSingle()
    if (inviteErr) throw new Error(inviteErr.message)
    if (!invite) throw new Error('Invite not found')
    if (invite.accepted_at) return json({ error: 'Invite already accepted.' }, 400)

    const workspace = Array.isArray(invite.workspace) ? invite.workspace[0] : invite.workspace
    const workspaceName =
      invite.workspace_label?.trim() || workspace?.id_code?.trim() || workspace?.name?.trim() || 'a workspace'
    const link = `${origin.origin}/invite/${invite.token}`
    const subject = `You've been invited to ${workspaceName}`
    const html = `<p>You've been invited to <strong>${escapeHtml(workspaceName)}</strong> on Miravize.</p><p><a href="${escapeHtml(link)}">Open the invite</a></p><p>This link expires in 14 days. Sign in with ${escapeHtml(invite.email)}.</p>`

    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': invite.id,
      },
      body: JSON.stringify({
        from: FROM,
        to: [invite.email],
        subject,
        html,
      }),
    })
    const payload = (await sent.json().catch(() => null)) as { id?: string; message?: string } | null
    if (!sent.ok) {
      return json({ error: payload?.message || 'Could not send invite email.' }, 400)
    }
    return json({ id: payload?.id ?? null })
  } catch (error) {
    console.error('send-invite', error)
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400)
  }
})

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
