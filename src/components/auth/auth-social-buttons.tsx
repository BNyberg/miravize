import { AppleLogo, GithubLogo, GoogleLogo } from '@phosphor-icons/react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const PROVIDERS = [
  { id: 'google', label: 'Google', Icon: GoogleLogo },
  { id: 'github', label: 'GitHub', Icon: GithubLogo },
  { id: 'apple', label: 'Apple', Icon: AppleLogo },
] as const

export function AuthSocialButtons() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 text-xs text-[#8a8780]">
        <span className="h-px flex-1 bg-[#e4e0d8]" />
        Or
        <span className="h-px flex-1 bg-[#e4e0d8]" />
      </div>
      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map(({ id, label, Icon }) => (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  role="button"
                  aria-disabled="true"
                  title="Coming soon"
                  aria-label={`${label} — coming soon`}
                  className="inline-flex h-10 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-[#ddd9d2] bg-white px-1.5 text-xs text-[#1c1b19] opacity-50"
                >
                  <Icon weight="fill" className="size-4 shrink-0" />
                  {label}
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming soon</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  )
}
