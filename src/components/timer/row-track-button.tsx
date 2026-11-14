import { ArrowPathIcon, PlayIcon, StopCircleIcon } from '@heroicons/react/24/outline'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function RowTrackButton({
  active,
  starting,
  stopping,
  canStart,
  blockedLabel,
  onStart,
  onStop,
}: {
  active: boolean
  starting: boolean
  stopping: boolean
  canStart: boolean
  blockedLabel?: string
  onStart: () => void
  onStop: () => void
}) {
  const busy = starting || stopping
  const label = active ? 'Stop tracking' : canStart ? 'Log and track' : blockedLabel || 'Choose a project first'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label={active ? 'Stop tracking' : 'Log and track'}
              disabled={busy || (!active && !canStart)}
              onClick={active ? onStop : onStart}
            >
              {busy ? (
                <ArrowPathIcon className="animate-spin" aria-hidden="true" />
              ) : active ? (
                <StopCircleIcon
                  aria-hidden="true"
                  className="[&_path:last-child]:fill-destructive [&_path:last-child]:stroke-destructive"
                />
              ) : (
                <PlayIcon aria-hidden="true" />
              )}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
