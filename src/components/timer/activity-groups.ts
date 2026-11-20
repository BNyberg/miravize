import type { Activity, Client, Project } from '@/types'

export function activityGroups(projects: Project[], activities: Activity[], clients: Client[]) {
  const rows = activities.flatMap((activity) => {
    const project = projects.find((item) => item.id === activity.project_id)
    if (!project) return []
    const client = activity.client_id ? clients.find((item) => item.id === activity.client_id) : null
    return [{ activity, project, client }]
  })
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  rows.sort((a, b) => byName(a.project.name, b.project.name) || byName(a.activity.name, b.activity.name))
  const named = new Map<string, { id: string; name: string; rows: typeof rows }>()
  const unassigned: typeof rows = []
  for (const row of rows) {
    if (!row.client) {
      unassigned.push(row)
      continue
    }
    const group = named.get(row.client.id) ?? { id: row.client.id, name: row.client.name, rows: [] }
    group.rows.push(row)
    named.set(row.client.id, group)
  }
  const groups = [...named.values()].sort((a, b) => byName(a.name, b.name))
  if (unassigned.length > 0) groups.push({ id: 'unassigned', name: '', rows: unassigned })
  return groups
}
