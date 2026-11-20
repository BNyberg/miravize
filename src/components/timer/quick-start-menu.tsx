import { ChevronDownIcon } from '@heroicons/react/24/outline'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { activityGroups } from '@/components/timer/activity-groups'
import { clientMode } from '@/components/timer/entry-editor'
import type { Activity, Client, Project, ProjectClient } from '@/types'

export type QuickStartInput = {
  workspaceId: string
  projectId: string | null
  billable: boolean
  description: string
  activityId?: string | null
  clientIds?: string[]
}

export function QuickStartMenu({
  projects,
  activities,
  clients,
  projectClients,
  pending,
  variant = 'default',
  label,
  onSelect,
}: {
  projects: Project[]
  activities: Activity[]
  clients: Client[]
  projectClients: ProjectClient[]
  pending?: boolean
  variant?: 'default' | 'outline'
  label: string
  onSelect: (input: QuickStartInput) => void
}) {
  const groups = activityGroups(projects, activities, clients)
  const showActivitySection = groups.length > 0
  const chevronClass =
    variant === 'outline'
      ? 'rounded-l-none border-l-0 px-2'
      : 'rounded-l-none border-l border-primary-foreground/30 px-2'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={chevronClass} variant={variant} aria-label={label} disabled={pending}>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {projects.length === 0 ? (
          <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
        ) : (
          projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() =>
                onSelect({
                  workspaceId: project.workspace_id,
                  projectId: project.id,
                  billable: project.billable,
                  description: '',
                })
              }
            >
              <span className="size-2 shrink-0" style={{ background: project.color }} aria-hidden="true" />
              {project.name}
            </DropdownMenuItem>
          ))
        )}
        {showActivitySection ? (
          <>
            <DropdownMenuSeparator />
            {groups.map((group) => (
              <DropdownMenuGroup key={group.id}>
                {group.name ? <DropdownMenuLabel>{group.name}</DropdownMenuLabel> : null}
                {group.rows.map(({ activity, project }) => (
                  <DropdownMenuItem
                    key={activity.id}
                    onSelect={() => {
                      const links = projectClients.filter((row) => row.project_id === project.id)
                      const clientIds =
                        clientMode(links) === 'manual' && activity.client_id ? [activity.client_id] : []
                      onSelect({
                        workspaceId: project.workspace_id,
                        projectId: project.id,
                        billable: project.billable,
                        description: '',
                        activityId: activity.id,
                        clientIds,
                      })
                    }}
                  >
                    <span className="size-2 shrink-0" style={{ background: project.color }} aria-hidden="true" />
                    <span className="min-w-0 truncate">{activity.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
