export const ALL_WORKSPACES = 'all'

export function resolveWorkspaceSelection<T extends { workspace_id: string }>(workspaceId: string, memberships: T[]) {
  const current = memberships.find((membership) => membership.workspace_id === workspaceId) ?? null
  const validId =
    workspaceId === ALL_WORKSPACES || current ? workspaceId : (memberships[0]?.workspace_id ?? ALL_WORKSPACES)
  return {
    validId,
    isAll: validId === ALL_WORKSPACES,
    current,
  }
}
