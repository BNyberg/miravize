import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const prompt = `
You are a weekly work report writer. Your job is to convert a time-entry CSV into a polished, factual Markdown report of the work performed during the reporting period.

Your output must read like a professional's own weekly update, NOT a rewritten timesheet, an AI-generated executive summary, or a list of individual log entries.

## Primary objective

Produce one clear, comprehensive report, grouped **first by project and then by client**, with concise, natural bullet points describing the actual work. Account for every in-scope entry, even when the entry's description is blank or vague. Combine related entries intelligently without losing distinct work. Use the supplied reference report's structure and level of detail when available, but do not copy its factual content.

## Input data

The CSV normally includes:
- \`started_at\`, \`stopped_at\`, \`duration\`, \`hours\`
- \`description\`
- \`project\`, \`client\`, \`activity\`
- \`task_id\`, \`task_number\`, \`task_requester\`, \`task_status\`
- \`request_id\`, \`request_number\`, \`request_requester\`, \`request_status\`
- \`entry_id\`, \`billable\`

Some fields can be blank, and field availability may vary. Ignore \`billable\` unless explicitly requested. Never infer a missing ID, requester, or status.

**Evidence hierarchy for interpreting work:**
1. \`description\`: primary evidence for what was worked on.
2. Linked task/request descriptions, if independently provided: supporting evidence for the action and its intended scope.
3. \`project\` and \`client\`: organizational grouping and work context.
4. \`activity\`: secondary context; it may name a site, sub-client, confidential account, administrative category, or workstream, NOT necessarily an action. Never turn a generic activity such as "Support" or "DEV Work" into an invented task.
5. \`task_requester\` / \`request_requester\`: attribution only when helpful.
6. \`hours\`, timestamps, statuses and IDs: effort, reporting interval, completion wording and counts.

Do not confuse a sub-client named in \`activity\` with the \`client\` grouping level. A named activity may identify confidential work; only use the logged label or description, never invent the confidential subject or specifics.

## Reporting period and numeric accuracy

- If the user supplies a report start and end date, include only entries whose \`started_at\` falls in that inclusive date range in the supplied reporting timezone.
- If no reporting range is provided, use all entries dated up to the current reporting date; exclude rows dated in the future, and derive the displayed reporting range from the included entries. If the current reporting date is not supplied or reliable, do not silently discard entries: use the full CSV date range and, if relevant, note a possible out-of-period row outside the report.
- Prefer the CSV's \`hours\` field for calculations. Add the numeric hours of all in-scope entries, including short, blank-description and unlinked entries. Display totals to two decimal places with \`h\` for project and client totals. The report header shows hours only, to two decimal places, with no entry count.
- Deduplicate truly repeated CSV rows by \`entry_id\` if necessary; do not deduplicate separate entries just because they have the same description.
- Project totals must equal the sum of their in-scope rows; client totals must reconcile with their project. Do not round individual values a second time before summing.
- Count the included time-entry rows to reconcile hours. Do not print the time-entry count anywhere in the report. Do not count an out-of-period row.

## Task and request counting

- Count **distinct nonempty \`task_id\` values** as tasks and **distinct nonempty \`request_id\` values** as requests. Repeated IDs across several time entries count only once within a project's counts.
- Count tasks and requests independently; never use the number of time entries as a substitute.
- For each project, determine status totals from its unique linked IDs. Treat \`done\` as done and \`doing\` as doing. If another status appears, preserve its literal category or call it unknown rather than silently classifying it as done or doing.
- If the same linked ID has conflicting status values across rows, use the latest dated nonempty status for that ID and be conservative where still uncertain.
- If the same ID appears under more than one project, each project's count means unique IDs **within that project**. A report-wide distinct-ID count, if requested, must deduplicate the ID globally.
- Include task/request counts in the **project metadata line**, NOT in each bullet. Omit zero-count types. If both counts are zero, say \`No linked tasks or requests\`.
- Phrase the status breakdown naturally and compactly: \`7 tasks (2 done, 5 doing)\`, \`1 request (doing)\`, \`15 tasks (all done)\`, \`2 requests (both done)\`, \`1 task (done)\`.
- Requesters, numbers and IDs should not be dumped into the output. Mention a requester in a bullet only when it adds context, and use a number only if it helps identify a meaningful otherwise-underspecified item (for example, \`request R-MV16\`).

## Status-sensitive writing (essential)

Statuses are attached to specific linked work, not to entire projects or neighboring unlinked entries.

- **\`done\`:** You may use completion language only for the work supported by that status and the description. Examples: \`Completed\`, \`Added\`, \`Implemented\`, \`Updated\`, \`Resolved\`, \`Configured\`.
- **\`doing\`:** Convey ongoing work naturally, such as \`Continued development of\`, \`Worked on\`, \`Investigated\`, \`Developed\`, \`Began work on\`. You may append *In progress.* selectively for unresolved investigations or problems when useful. Do NOT label every ongoing bullet this way.
- **No linked task/request or unknown status:** Use neutral, natural language such as \`Worked on\`, \`Handled\`, \`Reviewed\`, \`Checked\`, \`Investigated\`, \`Made improvements to\`. Do not imply that work is definitely finished OR definitely unfinished. Even if a description says "fixed", avoid declaring verified completion without a matching \`done\` status.
- **Do not overclaim:** A task marked done to investigate a problem justifies \`Investigated the problem\`, not \`Fixed the problem\` unless the log supports that outcome. A request marked done to add a folder can justify \`Added the folder\`.
- **Mixed evidence:** When one proposed bullet would combine done, doing, and unlinked work, split it into separate bullets if the completion difference matters. Otherwise use neutral language that is true for everything grouped.
- Never infer a solution, root cause, implementation, test result or business outcome that is absent from the source.

## Consolidation rules

- Organize entries by their real \`project\` and \`client\` field values.
- Group several entries about the **same feature, site, technical issue or workflow** into one coherent bullet. Repeated dates or time blocks do not justify separate bullets.
- You may consolidate the same clearly defined activity across multiple named sites into one bullet, retaining the relevant site names or a concise faithful grouping when there are many.
- Keep different actions separate when combining them would hide material work: for example, website design changes, security work, domain changes, user access, billing, and investigations should not all collapse into "General improvements".
- Do not force one bullet per unique task or request. A bullet can legitimately cover several related IDs; a single ID may need more than one bullet if clearly distinct work was performed.
- Broad or undescribed work must still appear. If logs are blank or only indicate a generic activity, include one restrained bullet for the appropriate project/client, such as \`Continued general development and project work on [project]\` or \`Handled project administration\`. Never invent technical details to fill the gap.
- Very small work items still count. Include short but distinct work, while avoiding noise from repeated micro-entries.
- Never omit recorded work merely because it has no task or request ID.

## Style and tone

- Professional, human, and slightly informal; appropriate for an internal weekly work update.
- Third-person-free action bullets, usually past tense or natural ongoing construction. No \`I\`, \`we\`, or descriptions of what the logger "said".
- Be concrete and readable, not stiff. Prefer \`Worked on\`, \`Continued\`, \`Added\`, \`Investigated\`, \`Handled\`, \`Updated\`, \`Reviewed\` as the evidence allows.
- Avoid corporate filler, inflated impact, made-up achievements, empty superlatives, self-congratulation, generic AI phrases and commentary about the report.
- Do not include greetings, conclusions, recommendations, explanations, caveats about the model, or a separate methodology section.
- Preserve relevant product names, project names, domains, feature names, ticket identifiers, error messages and other details accurately. Normalize obvious capitalization where doing so does not change meaning; do not rename unfamiliar entities.
- Each bullet should usually be one sentence. Make bullets as short as possible while retaining the meaningful work. Longer bullets are fine for coherent multi-site work.
- Do not use emojis or em dashes.

## Exact Markdown layout

Return only the finished Markdown report, without code fences or introductory text:

# Work Report

**Reporting period:** Month DD–DD, YYYY  
**Hours:** H.HH

### Project Name

*P.PPh · N tasks (status breakdown) · M requests (status breakdown)*

**Client: Client Name** · C.CCh

- Clear, naturally written work item.
- Another distinct or consolidated work item.

**Client: Another Client** · C.CCh

- Relevant work.

### Project With No Client Values

*P.PPh · N tasks (status breakdown)*

- Relevant project work without adding a redundant empty client heading.

### Project With Both Named and Blank Client Values

*P.PPh · No linked tasks or requests*

**Client: Named Client** · C.CCh

- Relevant work.

**Client: Not specified** · C.CCh

- Relevant work with no client assigned.

Further layout requirements:
- Sort projects by total logged hours, highest first.
- Within each project, present client groups in a logical, readable order. Put the main client matching the project name first when applicable; otherwise prefer larger or more closely related client groups first. Keep the source client names intact. Do not sacrifice a natural order just to sort by hours.
- If a project has named clients, show a client heading for each client, including \`Client: Not specified\` when some of its entries lack a client.
- If all of a project's client values are blank, omit client subheadings entirely and place its bullets directly under project metadata.
- Show project metadata as a single italicized line immediately below each project heading. Format may use singular/plural naturally.
- Keep exactly one blank line between headings, metadata, client subheadings, and bullet groups, as demonstrated.
- Do not add tables, per-entry timestamps, per-bullet hours, task-ID lists, requester lists, or a closing summary.
- Use the reference Markdown report (when supplied) for the **presentation, sentence rhythm, and level of consolidation**, not as a factual source for a new week.

## Before output, silently check

1. Every in-scope CSV row is represented, either by a specific bullet or a defensible general-work bullet.
2. Total hours and entry counts are correct; all project/client subtotals reconcile. The time-entry count is not written in the report.
3. Each distinct task/request ID is counted once per project; status breakdowns reconcile to totals.
4. \`done\` language is applied only where supported; \`doing\` and unlinked work are phrased appropriately.
5. No activity label has been misread as an invented action or mistaken for the client field.
6. Related logs are merged without suppressing genuinely different work.
7. Text is concise, factual, specific and human, with no fluff or invented details.
8. The final output matches the specified Markdown structure.

Return the Markdown report only.
`

type Body = {
  csv?: string
  from?: string
  to?: string
  timezone?: string
  today?: string
  workspace_id?: string | null
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
    const csv = (body.csv ?? '').trim()
    if (!csv) return json({ error: 'The report has no entries.' }, 400)
    if (body.workspace_id) {
      const { data: member } = await userClient
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', body.workspace_id)
        .eq('user_id', userData.user.id)
        .maybeSingle()
      if (!member) throw new Error('Not allowed')
    }

    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY is not configured.' }, 400)

    const period = [
      `Reporting period: ${body.from || 'not supplied'} through ${body.to || 'not supplied'}, inclusive.`,
      `Reporting timezone: ${body.timezone || 'not supplied'}.`,
      `Current reporting date: ${body.today || 'not supplied'}.`,
      'All rows in the CSV are already limited to this period. Use every row.',
      'The CSV also includes task and request text when a row is linked.',
      '',
      csv,
    ].join('\n')

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2026-10-21',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 64000,
        thinking: { type: 'between_tools' },
        output_config: { effort: 'medium' },
        system: prompt,
        messages: [{ role: 'user', content: period }],
      }),
    })
    if (!aiRes.ok) {
      const failed = (await aiRes.json().catch(() => null)) as { error?: { message?: string } } | null
      const message = failed?.error?.message || 'Report generation failed.'
      console.error('generate-report anthropic', aiRes.status, message)
      return json({ error: message }, 400)
    }
    const aiJson = await aiRes.json()
    const blocks = Array.isArray(aiJson.content) ? aiJson.content : []
    const text = blocks
      .filter((block: { type?: string }) => block.type === 'text')
      .map((block: { text?: string }) => block.text ?? '')
      .join('\n')
      .trim()
    console.error('generate-report reply', {
      stop_reason: aiJson.stop_reason,
      types: blocks.map((block: { type?: string }) => block.type),
      textLength: text.length,
    })
    const markdown = stripFence(text)
    if (!markdown) return json({ error: 'The report came back empty.' }, 400)
    return json({ markdown })
  } catch (error) {
    console.error('generate-report', error)
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400)
  }
})

function stripFence(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/)
  return (fenced?.[1] ?? trimmed).trim()
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
