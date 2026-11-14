import type { Activity, Client, Project, ProjectAlias, ProjectClient } from '@/types'

function clientMode(links: ProjectClient[]) {
  if (links.length === 0) return 'none' as const
  if (links.every((row) => row.split_percent == null)) return 'manual' as const
  return 'auto' as const
}

function projectLinks(catalog: RequestCatalog, projectId: string) {
  return catalog.projectClients.filter((row) => row.project_id === projectId)
}

function splitClientIds(catalog: RequestCatalog, projectId: string) {
  const links = projectLinks(catalog, projectId)
  if (clientMode(links) !== 'auto') return []
  return [...new Set(links.map((row) => row.client_id))]
}

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

export type RequestAssignment = {
  projectId: string
  activityId: string
  clientIds: string[]
}

export type RequestCatalog = {
  projects: Project[]
  activities: Activity[]
  clients: Client[]
  projectClients: ProjectClient[]
  aliases: ProjectAlias[]
}

export const emptyAssignment = (): RequestAssignment => ({
  projectId: '',
  activityId: '',
  clientIds: [],
})

export function displayClientIds(
  row: {
    project_id: string | null
    request_clients?: { client_id: string }[]
    task_clients?: { client_id: string }[]
  },
  catalog: RequestCatalog,
) {
  const stored = (row.request_clients ?? row.task_clients)?.map((item) => item.client_id) ?? []
  if (stored.length > 0) return stored
  if (!row.project_id) return []
  return splitClientIds(catalog, row.project_id)
}

export function assignmentClientMode(catalog: RequestCatalog, projectId: string) {
  if (!projectId) return 'none' as const
  return clientMode(projectLinks(catalog, projectId))
}

export function applyProject(
  current: RequestAssignment,
  nextProjectId: string,
  catalog: RequestCatalog,
): RequestAssignment {
  if (!nextProjectId) return emptyAssignment()
  const nextLinks = projectLinks(catalog, nextProjectId)
  const nextMode = clientMode(nextLinks)
  const keptActivity = catalog.activities.find(
    (row) => row.id === current.activityId && row.project_id === nextProjectId,
  )
  const allowed = new Set(nextLinks.map((row) => row.client_id))
  return {
    projectId: nextProjectId,
    activityId: keptActivity?.id ?? '',
    clientIds:
      nextMode === 'auto'
        ? [...allowed]
        : nextMode === 'manual'
          ? current.clientIds.filter((id) => allowed.has(id))
          : [],
  }
}

export function applyActivity(
  current: RequestAssignment,
  nextActivityId: string,
  catalog: RequestCatalog,
): RequestAssignment {
  const nextActivity = catalog.activities.find((row) => row.id === nextActivityId)
  if (!nextActivity) {
    return { ...current, activityId: '' }
  }
  let next = current
  if (nextActivity.project_id !== current.projectId) {
    next = applyProject(current, nextActivity.project_id, catalog)
  }
  let nextClients = next.clientIds
  if (nextActivity.client_id && !nextClients.includes(nextActivity.client_id)) {
    nextClients = [...nextClients, nextActivity.client_id]
  }
  return {
    ...next,
    activityId: nextActivityId,
    clientIds: nextClients,
  }
}

export function applyClients(
  current: RequestAssignment,
  clientIds: string[],
  catalog: RequestCatalog,
): RequestAssignment {
  if (!current.projectId) return { ...current, clientIds }
  const required = splitClientIds(catalog, current.projectId)
  if (required.length === 0 || sameIds(required, clientIds)) {
    return { ...current, clientIds }
  }
  return { ...current, projectId: '', activityId: '', clientIds }
}


export type MentionHit = {
  kind: 'project' | 'activity' | 'client'
  id: string
  token: string
  label: string
  color?: string
}

function same(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}

function compact(value: string) {
  return value.replace(/\s+/g, '')
}

export function resolveMention(value: string, catalog: RequestCatalog): MentionHit | null {
  const alias = catalog.aliases.find((row) => same(row.shortcut, value) || same(compact(row.shortcut), value))
  if (alias) {
    const project = catalog.projects.find((row) => row.id === alias.project_id)
    if (project) return { kind: 'project', id: project.id, token: value, label: project.name, color: project.color }
  }
  const activity = catalog.activities.find((row) => same(row.name, value) || same(compact(row.name), value))
  if (activity) return { kind: 'activity', id: activity.id, token: value, label: activity.name }
  const project = catalog.projects.find((row) => same(row.name, value) || same(compact(row.name), value))
  if (project) return { kind: 'project', id: project.id, token: value, label: project.name, color: project.color }
  const client = catalog.clients.find((row) => same(row.name, value) || same(compact(row.name), value))
  if (client) return { kind: 'client', id: client.id, token: value, label: client.name }
  return null
}

export type NoteChip = {
  kind: 'project' | 'activity' | 'client'
  id: string
}

export type NotePart = { type: 'text'; text: string } | { type: 'chip'; chip: NoteChip }

export function notesFromParts(parts: NotePart[]) {
  return parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

export function chipsFromParts(parts: NotePart[]) {
  return parts.filter((part): part is { type: 'chip'; chip: NoteChip } => part.type === 'chip').map((part) => part.chip)
}

export function assignmentFromChips(chips: NoteChip[], catalog: RequestCatalog): RequestAssignment {
  let next = emptyAssignment()
  for (const chip of chips) {
    if (chip.kind === 'project') next = applyProject(next, chip.id, catalog)
    else if (chip.kind === 'activity') next = applyActivity(next, chip.id, catalog)
    else if (!next.clientIds.includes(chip.id)) next = { ...next, clientIds: [...next.clientIds, chip.id] }
  }
  if (!next.projectId) return next
  const required = splitClientIds(catalog, next.projectId)
  if (required.length === 0) return next
  const present = new Set(chips.filter((chip) => chip.kind === 'client').map((chip) => chip.id))
  if (required.every((id) => present.has(id))) return next
  return {
    ...next,
    projectId: '',
    activityId: '',
    clientIds: chips.filter((chip) => chip.kind === 'client').map((chip) => chip.id),
  }
}

export function chipsImpliedByHit(hit: MentionHit, catalog: RequestCatalog, existing: NoteChip[]): NoteChip[] {
  const has = (kind: NoteChip['kind'], id: string) => existing.some((chip) => chip.kind === kind && chip.id === id)
  const withSplitClients = (projectId: string, chips: NoteChip[]) => {
    for (const id of splitClientIds(catalog, projectId)) {
      if (!has('client', id) && !chips.some((chip) => chip.kind === 'client' && chip.id === id)) {
        chips.push({ kind: 'client', id })
      }
    }
    return chips
  }
  if (hit.kind === 'activity') {
    const activity = catalog.activities.find((row) => row.id === hit.id)
    const chips: NoteChip[] = []
    if (activity && !has('project', activity.project_id)) chips.push({ kind: 'project', id: activity.project_id })
    if (!has('activity', hit.id)) chips.push({ kind: 'activity', id: hit.id })
    if (activity?.client_id && !has('client', activity.client_id)) chips.push({ kind: 'client', id: activity.client_id })
    return activity ? withSplitClients(activity.project_id, chips) : chips
  }
  if (hit.kind === 'project') {
    const chips: NoteChip[] = []
    if (!has('project', hit.id)) chips.push({ kind: 'project', id: hit.id })
    return withSplitClients(hit.id, chips)
  }
  if (has(hit.kind, hit.id)) return []
  return [{ kind: hit.kind, id: hit.id }]
}

export function syncPartsToAssignment(parts: NotePart[], assignment: RequestAssignment, catalog: RequestCatalog): NotePart[] {
  const kept = parts.filter((part) => {
    if (part.type !== 'chip') return true
    const chip = part.chip
    if (chip.kind === 'project') return chip.id === assignment.projectId
    if (chip.kind === 'activity') return chip.id === assignment.activityId
    return assignment.clientIds.includes(chip.id)
  })
  const chips = chipsFromParts(kept)
  const missing: NoteChip[] = []
  if (assignment.projectId && !chips.some((chip) => chip.kind === 'project' && chip.id === assignment.projectId)) {
    missing.push({ kind: 'project', id: assignment.projectId })
  }
  if (assignment.activityId && !chips.some((chip) => chip.kind === 'activity' && chip.id === assignment.activityId)) {
    missing.push({ kind: 'activity', id: assignment.activityId })
  }
  for (const id of assignment.clientIds) {
    if (!chips.some((chip) => chip.kind === 'client' && chip.id === id)) missing.push({ kind: 'client', id })
  }
  if (missing.length === 0) return kept
  return [...missing.map((chip) => ({ type: 'chip' as const, chip })), ...kept]
}

export function mentionChoices(
  query: string,
  catalog: RequestCatalog,
  workspaceId: string,
  assignment: RequestAssignment = emptyAssignment(),
) {
  const q = query.toLowerCase()
  const items: MentionHit[] = []
  const scoped = Boolean(assignment.projectId)

  if (!scoped) {
    const inWorkspace = (id: string) => !workspaceId || id === workspaceId
    const projects = catalog.projects.filter((row) => inWorkspace(row.workspace_id))
    for (const alias of catalog.aliases.filter((row) => inWorkspace(row.workspace_id))) {
      const project = projects.find((row) => row.id === alias.project_id)
      if (!project) continue
      if (q && !alias.shortcut.toLowerCase().includes(q) && !project.name.toLowerCase().includes(q)) continue
      items.push({ kind: 'project', id: project.id, token: alias.shortcut, label: `${alias.shortcut} · ${project.name}`, color: project.color })
    }
    for (const project of projects) {
      if (q && !project.name.toLowerCase().includes(q)) continue
      if (items.some((item) => item.kind === 'project' && item.id === project.id && item.token.toLowerCase() === project.name.toLowerCase())) {
        continue
      }
      items.push({ kind: 'project', id: project.id, token: project.name.replace(/\s+/g, ''), label: project.name, color: project.color })
    }
    for (const activity of catalog.activities.filter((row) => inWorkspace(row.workspace_id))) {
      if (q && !activity.name.toLowerCase().includes(q)) continue
      const project = projects.find((row) => row.id === activity.project_id)
      items.push({
        kind: 'activity',
        id: activity.id,
        token: activity.name.replace(/\s+/g, ''),
        label: activity.name,
        color: project?.color,
      })
    }
    for (const client of catalog.clients.filter((row) => inWorkspace(row.workspace_id))) {
      if (q && !client.name.toLowerCase().includes(q)) continue
      items.push({ kind: 'client', id: client.id, token: client.name.replace(/\s+/g, ''), label: client.name })
    }
  } else {
    const project = catalog.projects.find((row) => row.id === assignment.projectId)
    for (const activity of catalog.activities.filter((row) => row.project_id === assignment.projectId)) {
      if (activity.id === assignment.activityId) continue
      if (q && !activity.name.toLowerCase().includes(q)) continue
      items.push({
        kind: 'activity',
        id: activity.id,
        token: activity.name.replace(/\s+/g, ''),
        label: activity.name,
        color: project?.color,
      })
    }
    const allowed = new Set(
      catalog.projectClients.filter((row) => row.project_id === assignment.projectId).map((row) => row.client_id),
    )
    for (const client of catalog.clients.filter((row) => allowed.has(row.id))) {
      if (assignment.clientIds.includes(client.id)) continue
      if (q && !client.name.toLowerCase().includes(q)) continue
      items.push({ kind: 'client', id: client.id, token: client.name.replace(/\s+/g, ''), label: client.name })
    }
  }
  return items
}
