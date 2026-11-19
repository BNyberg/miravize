import { createClient } from '@supabase/supabase-js';
import { supabase, supabasePublishableKey, supabaseUrl } from '@/lib/supabase';
function currentPasswordMessage(error) {
    if (error.code === 'invalid_credentials' || error.message === 'Invalid login credentials') {
        return 'Current password is incorrect.';
    }
    return error.message;
}
export async function changePassword(email, currentPassword, nextPassword) {
    const verifier = createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: 'sb-password-verify',
        },
    });
    const signedIn = await verifier.auth.signInWithPassword({ email, password: currentPassword });
    if (signedIn.error)
        throw new Error(currentPasswordMessage(signedIn.error));
    const signedOut = await verifier.auth.signOut({ scope: 'local' });
    if (signedOut.error)
        throw new Error(signedOut.error.message);
    const updated = await supabase.auth.updateUser({ password: nextPassword });
    if (updated.error)
        throw new Error(updated.error.message);
}
