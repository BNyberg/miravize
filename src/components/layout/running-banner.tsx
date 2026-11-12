import { Pause } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/features/workspaces/workspace-context'
import { useNow } from '@/features/timer/use-now'
import { useRunningTimer } from '@/features/timer/use-running-timer'
import { qk } from '@/lib/query-keys'
import { formatDuration } from '@/lib/splits'
import { supabase } from '@/lib/supabase'

export function RunningBanner() {
  const { data: running } = useRunningTimer()
  const { workspaceId, isAll } = useWorkspace()
  const now = useNow(Boolean(running))
  const qc = useQueryClient()

  const stop = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('stop_running_timer')
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.running })
      void qc.invalidateQueries({ queryKey: ['entries'] })
    },
  })

  if (!running) return null

  const elapsed = Math.floor((now - new Date(running.started_at).getTime()) / 1000)
  const otherWorkspace = !isAll && running.workspace_id !== workspaceId

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-accent px-4 py-2 text-sm">
      <p>
        Tracking <span className="font-medium">{running.project?.name ?? 'project'}</span>
        {running.description ? ` — ${running.description}` : ''}
        {otherWorkspace ? ' (another workspace)' : ''}
        <span className="tabular ml-2 font-semibold">{formatDuration(elapsed)}</span>
      </p>
      <Button size="sm" variant="outline" onClick={() => stop.mutate()} disabled={stop.isPending}>
        <Pause aria-hidden="true" />
        Stop
      </Button>
    </div>
  )
}
