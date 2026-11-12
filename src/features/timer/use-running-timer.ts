import { qk } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { TimeEntry } from '@/types'
import { useQuery } from '@tanstack/react-query'

export function useRunningTimer() {
  const { user } = useAuth()
  return useQuery({
    queryKey: qk.running,
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*, project:projects(*)')
        .is('stopped_at', null)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return (data as TimeEntry | null) ?? null
    },
    refetchInterval: 15_000,
  })
}
