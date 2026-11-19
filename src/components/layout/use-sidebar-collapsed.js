import { useCallback, useState } from 'react';
const KEY = 'sidebar-collapsed';
function readStored() {
    try {
        return localStorage.getItem(KEY) === 'true';
    }
    catch {
        return false;
    }
}
export function useSidebarCollapsed() {
    const [collapsed, setCollapsed] = useState(readStored);
    const toggle = useCallback(() => {
        setCollapsed((current) => {
            const next = !current;
            try {
                localStorage.setItem(KEY, String(next));
            }
            catch {
                /* ignore quota / private mode */
            }
            return next;
        });
    }, []);
    return { collapsed, toggle };
}
