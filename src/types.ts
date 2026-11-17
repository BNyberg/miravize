export type WorkspaceRole = 'owner' | 'admin' | 'member'

export type Workspace = {
  id: string
  name: string
  created_by: string
  settings: Record<string, unknown>
  icon: string | null
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
  is_default: boolean
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
  time_entry_requests?: {
    request_id: string
    request?: {
      id: string
      task_number: number
      request: string
      requester?: string | null
      project_id: string | null
      activity_id?: string | null
      project?: { name: string } | null
      request_clients?: { client_id: string }[]
    } | null
  }[]
  time_entry_tasks?: {
    task_id: string
    task?: {
      id: string
      task_number: number
      task: string
      requester?: string | null
      project_id: string | null
      activity_id?: string | null
      project?: { name: string } | null
      task_clients?: { client_id: string }[]
    } | null
  }[]
}

export type TaskStatus = 'todo' | 'doing' | 'done'

export type Task = {
  id: string
  workspace_id: string
  task_number: number
  logged_on: string
  requester: string
  task: string
  project_id: string | null
  activity_id: string | null
  website: string | null
  additional_notes: string | null
  screenshot_path: string | null
  screenshot_paths: string[]
  submission_id: string
  status: TaskStatus
  completed_at: string | null
  created_at: string
  project?: Project | null
  activity?: Activity | null
  task_clients?: { client_id: string }[]
}

export type SupportRequest = {
  id: string
  workspace_id: string
  task_number: number
  logged_on: string
  requester: string
  request: string
  project_id: string | null
  activity_id: string | null
  website: string | null
  additional_notes: string | null
  screenshot_path: string | null
  screenshot_paths: string[]
  submission_id: string
  status: TaskStatus
  completed_at: string | null
  created_at: string
  project?: Project | null
  activity?: Activity | null
  request_clients?: { client_id: string }[]
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
