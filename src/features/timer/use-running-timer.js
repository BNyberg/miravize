import { qk } from '@/lib/query-keys';
import { ENTRY_SELECT } from '@/lib/timer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/auth-context';
import { useQuery } from '@tanstack/react-query';
export function useRunningTimer() {
    const { user } = useAuth();
    return useQuery({
        queryKey: qk.running,
        enabled: Boolean(user),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('time_entries')
                .select(ENTRY_SELECT)
                .is('stopped_at', null)
                .eq('user_id', user.id)
                .maybeSingle();
            if (error)
                throw error;
            return data ?? null;
        },
        refetchInterval: 15_000,
    });
}
