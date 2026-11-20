import { qk } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import { revealList } from '@/features/crypto/read-copy'
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context'
import type { Activity, Client, Project, ProjectAlias, ProjectClient, ProjectTag, Tag } from '@/types'
import { useQuery } from '@tanstack/react-query'

function applyWorkspace<T extends { workspace_id: string }>(rows: T[], workspaceId: string) {
  if (workspaceId === ALL_WORKSPACES) return rows
  return rows.filter((r) => r.workspace_id === workspaceId)
}

export function useCatalog() {
  const { workspaceId } = useWorkspace()

  const clients = useQuery({
    queryKey: qk.clients(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('name')
      if (error) throw error
      return revealList('clients', applyWorkspace((data ?? []) as Client[], workspaceId))
    },
  })

  const projects = useQuery({
    queryKey: qk.projects(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('name')
      if (error) throw error
      return revealList('projects', applyWorkspace((data ?? []) as Project[], workspaceId))
    },
  })

  const tags = useQuery({
    queryKey: qk.tags(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').order('name')
      if (error) throw error
      return revealList('tags', applyWorkspace((data ?? []) as Tag[], workspaceId))
    },
  })

  const projectClients = useQuery({
    queryKey: qk.projectClients(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('project_clients').select('*, client:clients(*)')
      if (error) throw error
      return revealList(null, applyWorkspace((data ?? []) as ProjectClient[], workspaceId))
    },
  })

  const projectTags = useQuery({
    queryKey: qk.projectTags(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('project_tags').select('*')
      if (error) throw error
      return applyWorkspace((data ?? []) as ProjectTag[], workspaceId)
    },
  })

  const activities = useQuery({
    queryKey: qk.activities(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select('*').order('name')
      if (error) throw error
      return revealList('activities', applyWorkspace((data ?? []) as Activity[], workspaceId))
    },
  })

  const aliases = useQuery({
    queryKey: qk.aliases(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('project_aliases').select('*')
      if (error) throw error
      return revealList('project_aliases', applyWorkspace((data ?? []) as ProjectAlias[], workspaceId))
    },
  })

  return {
    clients: clients.data ?? [],
    projects: (projects.data ?? []).filter((p) => !p.archived),
    allProjects: projects.data ?? [],
    tags: tags.data ?? [],
    projectClients: projectClients.data ?? [],
    projectTags: projectTags.data ?? [],
    activities: activities.data ?? [],
    aliases: aliases.data ?? [],
    loading:
      clients.isLoading ||
      projects.isLoading ||
      tags.isLoading ||
      projectClients.isLoading ||
      projectTags.isLoading ||
      activities.isLoading ||
      aliases.isLoading,
  }
}
