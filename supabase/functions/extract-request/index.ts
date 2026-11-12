import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Body = {
  workspace_id: string
  screenshot_path: string
  note: string
  submission_id: string
}

function parseNote(note: string) {
  const parts = note.split('|').map((p) => p.trim())
  return {
    project: parts[0] ?? '',
    website: parts[1] ?? '',
    additional_notes: parts.slice(2).join(' | '),
  }
}

function normalize(raw: string, aliases: { shortcut: string; name: string }[]) {
  const value = raw.trim()
  const match = aliases.find((a) => a.shortcut.toLowerCase() === value.toLowerCase())
  return match ? match.name : value
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization')

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) throw new Error('Not authenticated')

    const body = (await req.json()) as Body
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: member } = await userClient
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', body.workspace_id)
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (!member) throw new Error('Not allowed')

    const { data: existing } = await userClient
      .from('requests')
      .select('*, project:projects(name)')
      .eq('workspace_id', body.workspace_id)
      .eq('submission_id', body.submission_id)
      .maybeSingle()
    if (existing) {
      return json({
        task_number: existing.task_number,
        requester: existing.requester,
        project: existing.project?.name,
        request: existing.request,
      })
    }

    const parsed = parseNote(body.note ?? '')
    const { data: file, error: dlErr } = await admin.storage.from('request-screenshots').download(body.screenshot_path)
    if (dlErr || !file) {
      return json({ error: 'Could not read screenshot.', ...parsed }, 400)
    }

    if (!anthropicKey) {
      return json({ error: 'ANTHROPIC_API_KEY is not configured.', ...parsed }, 400)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    const b64 = btoa(binary)
    const mediaType = file.type || 'image/png'

    const prompt = `You extract a support request from a screenshot.
Return ONLY JSON: {"requester": string, "request": string}
Requester is the person asking for support.
Request is a clear, concise summary preserving important details.
Do not invent missing information. Do not add status, priority, or due dates.
If a field cannot be determined, use an empty string.`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    })
    if (!aiRes.ok) {
      return json({ error: 'Vision extraction failed.', ...parsed }, 400)
    }
    const aiJson = await aiRes.json()
    const text: string = aiJson.content?.[0]?.text ?? '{}'
    const extracted = JSON.parse(text.replace(/```json|```/g, '').trim()) as { requester?: string; request?: string }

    const { data: aliasRows } = await userClient
      .from('project_aliases')
      .select('shortcut, project:projects(name, id)')
      .eq('workspace_id', body.workspace_id)
    const aliases = (aliasRows ?? []).map((row: { shortcut: string; project: { name: string; id: string } | { name: string; id: string }[] | null }) => {
      const project = Array.isArray(row.project) ? row.project[0] : row.project
      return { shortcut: row.shortcut, name: project?.name ?? row.shortcut, id: project?.id }
    })
    const official = normalize(parsed.project, aliases)

    const { data: projects } = await userClient.from('projects').select('id, name').eq('workspace_id', body.workspace_id)
    const project = (projects ?? []).find((p: { name: string }) => p.name.toLowerCase() === official.toLowerCase())
    if (!project) {
      return json({
        error: `Unknown project "${official || parsed.project}".`,
        requester: extracted.requester ?? '',
        request: extracted.request ?? '',
        project: official || parsed.project,
        website: parsed.website,
        additional_notes: parsed.additional_notes,
      }, 400)
    }

    const loggedOn = new Date().toISOString().slice(0, 10)
    const { data: saved, error: saveErr } = await userClient.rpc('log_support_request', {
      p_workspace_id: body.workspace_id,
      p_submission_id: body.submission_id,
      p_requester: extracted.requester || '',
      p_request: extracted.request || '',
      p_project_id: project.id,
      p_website: parsed.website,
      p_additional_notes: parsed.additional_notes,
      p_screenshot_path: body.screenshot_path,
      p_logged_on: loggedOn,
    })
    if (saveErr || !saved) {
      return json({ error: saveErr?.message ?? 'Could not save request.', ...parsed, requester: extracted.requester, request: extracted.request }, 400)
    }

    return json({
      task_number: saved.task_number,
      requester: saved.requester,
      project: project.name,
      request: saved.request,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
