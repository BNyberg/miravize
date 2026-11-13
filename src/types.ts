export type WorkspaceRole = 'owner' | 'admin' | 'member'

export type Workspace = {
  id: string
  name: string
  created_by: string
  settings: Record<string, unknown>
  created_at: string
}

export type Membership = {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  workspace: Workspace
}

export type Client = {
  id: string
  workspace_id: string
  name: string
  default_billable: boolean
}

export type Project = {
  id: string
  workspace_id: string
  name: string
  color: string
  description: string
  hourly_rate: number | null
  currency: string
  billable: boolean
  archived: boolean
}

export type ProjectClient = {
  id: string
  workspace_id: string
  project_id: string
  client_id: string
  split_percent: number | null
  hourly_rate: number | null
  client?: Client
}

export type Activity = {
  id: string
  workspace_id: string
  project_id: string
  client_id: string | null
  name: string
}

export type Tag = {
  id: string
  workspace_id: string
  name: string
}

export type ProjectTag = {
  project_id: string
  tag_id: string
  workspace_id: string
}

export type ProjectAlias = {
  id: string
  workspace_id: string
  shortcut: string
  project_id: string
}

export type TimeEntry = {
  id: string
  workspace_id: string
  user_id: string
  project_id: string | null
  activity_id: string | null
  description: string
  started_at: string
  stopped_at: string | null
  duration_seconds: number | null
  billable: boolean
  source: 'manual' | 'quick_start'
  project?: Project
  activity?: Activity | null
  time_entry_clients?: { client_id: string }[]
  time_entry_tags?: { tag_id: string; tags?: Tag }[]
}

export type SupportRequest = {
  id: string
  workspace_id: string
  task_number: number
  logged_on: string
  requester: string
  request: string
  project_id: string
  website: string | null
  additional_notes: string | null
  screenshot_path: string | null
  submission_id: string
  project?: Project
}

export type WorkspaceInvite = {
  id: string
  workspace_id: string
  email: string
  role: WorkspaceRole
  token: string
  expires_at: string
  accepted_at: string | null
}
