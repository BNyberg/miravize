import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Body = {
  workspace_id: string
  images: { media_type: string; data: string }[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization')

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
    const images = (body.images ?? []).filter((image) => image.data)
    if (images.length === 0) return json({ error: 'Attach a screenshot.' }, 400)

    const { data: member } = await userClient
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', body.workspace_id)
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (!member) throw new Error('Not allowed')

    if (!anthropicKey) {
      return json({ error: 'ANTHROPIC_API_KEY is not configured.', requester: '', task: '' }, 400)
    }

    const prompt = `You are a strict JSON extractor. You must return ONLY a single valid JSON object and nothing else — no markdown, no explanations, no preamble, no trailing text.

Schema:
{
  "requester": string,
  "task": string
}

Rules:
- requester = the human the work is for or who asked for it, not a bot or system message.
- task = the work to do, in your own short wording. Interpret the image: a ticket, chat, email, or note can all be a task. Ignore greetings, mentions, timestamps, and ids.
- Do not invent information that is not visible.
- Use an empty string only when that field is not in the image at all.

Output format example (do not copy the values, only the structure):
{"requester":"Sasha","task":"Fix the checkout 403 and confirm the order still saves"}

Now extract from the image.`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2026-10-21',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 400,
        thinking: { type: 'between_tools' },
        output_config: { effort: 'low' },
        messages: [
          {
            role: 'user',
            content: [
              ...images.map((image) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: image.media_type || 'image/png', data: image.data },
              })),
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    })
    if (!aiRes.ok) {
      const failed = await aiRes.json().catch(() => null) as { error?: { message?: string } } | null
      const message = failed?.error?.message || 'Vision extraction failed.'
      console.error('extract-task anthropic', aiRes.status, message)
      return json({ error: message, requester: '', task: '' }, 400)
    }
    const aiJson = await aiRes.json()
    const blocks = Array.isArray(aiJson.content) ? aiJson.content : []
    const textBlock = blocks.find((block: { type?: string }) => block.type === 'text') as { text?: string } | undefined
    const text: string = textBlock?.text ?? ''
    console.error('extract-task reply', {
      stop_reason: aiJson.stop_reason,
      types: blocks.map((block: { type?: string }) => block.type),
    })
    const extracted = JSON.parse(text.replace(/```json|```/g, '').trim() || '{}') as { requester?: string; task?: string }
    const requester = extracted.requester ?? ''
    const task = extracted.task ?? ''
    if (!requester || !task) console.error('extract-task empty')
    return json({ requester, task })
  } catch (error) {
    console.error('extract-task', error)
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
