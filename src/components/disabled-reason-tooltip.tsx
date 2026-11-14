import { useState, type ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function DisabledReasonTooltip({ reason, children }: { reason: string | null; children: ReactNode }) {
  const [hovering, setHovering] = useState(false)

  return (
    <Tooltip open={Boolean(reason) && hovering}>
      <TooltipTrigger asChild>
        <span
          tabIndex={-1}
          className="inline-flex"
          onPointerEnter={() => setHovering(true)}
          onPointerLeave={() => setHovering(false)}
        >
          {children}
        </span>
      </TooltipTrigger>
      {reason ? <TooltipContent>{reason}</TooltipContent> : null}
    </Tooltip>
  )
}
