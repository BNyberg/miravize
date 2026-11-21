import { ShieldCheck } from '@phosphor-icons/react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-context'
import type { DisclosureCopy } from '@/features/onboarding/disclosures'
import { supabase } from '@/lib/supabase'

function disclosureQueryKey(userId: string | undefined, disclosure: DisclosureCopy) {
  return ['disclosure', userId, disclosure.key, disclosure.version] as const
}

export function DisclosureGate({ disclosure, children }: { disclosure: DisclosureCopy; children: ReactNode }) {
  const { user } = useAuth()
  const client = useQueryClient()
  const [pending, setPending] = useState(false)
  const query = useQuery({
    queryKey: disclosureQueryKey(user?.id, disclosure),
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_disclosure_acknowledgements')
        .select('disclosure_key')
        .eq('user_id', user!.id)
        .eq('disclosure_key', disclosure.key)
        .eq('disclosure_version', disclosure.version)
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
  })

  const blocked = query.isLoading || query.isError || !query.data
  const open = (query.isSuccess && !query.data) || query.isError

  async function acknowledge() {
    if (!user || pending) return
    setPending(true)
    const inserted = await supabase.from('user_disclosure_acknowledgements').insert({
      user_id: user.id,
      disclosure_key: disclosure.key,
      disclosure_version: disclosure.version,
    })
    setPending(false)
    if (inserted.error && inserted.error.code !== '23505') {
      toast.error("Couldn't save your acknowledgement", { description: inserted.error.message })
      return
    }
    client.setQueryData(disclosureQueryKey(user.id, disclosure), true)
  }

  return (
    <>
      <div inert={blocked ? true : undefined} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </div>
      <DialogPrimitive.Root open={open}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            aria-describedby="disclosure-body"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-6 shrink-0 text-primary" aria-hidden="true" />
                <DialogPrimitive.Title className="text-lg font-semibold leading-tight">{disclosure.title}</DialogPrimitive.Title>
              </div>
              <p id="disclosure-body" className="text-sm text-muted-foreground">
                {disclosure.body.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
                  const bold = part.match(/^\*\*([^*]+)\*\*$/)
                  if (!bold) return part
                  return (
                    <strong key={index} className="font-semibold text-foreground">
                      {bold[1]}
                    </strong>
                  )
                })}
              </p>
              {query.isError ? (
                <Button type="button" variant="outline" className="h-10" onClick={() => void query.refetch()}>
                  Try again
                </Button>
              ) : (
                <Button type="button" className="h-10" autoFocus onClick={() => void acknowledge()} loading={pending} disabled={pending}>
                  I understand
                </Button>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
