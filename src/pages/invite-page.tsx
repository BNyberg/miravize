import { useMutation } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

export function InvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('accept_workspace_invite', { p_token: token })
      if (error) throw error
    },
    onSuccess: () => navigate('/timer'),
  })

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Workspace invite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {accept.error ? (
            <div role="alert" className="text-sm text-destructive">
              {(accept.error as Error).message}
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Accepting this invite adds you to the workspace. Your account email must match the invite.
          </p>
          <Button onClick={() => accept.mutate()} disabled={accept.isPending || !token}>
            Accept invite
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
