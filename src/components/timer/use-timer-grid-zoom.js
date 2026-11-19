import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { parseTimerZoom, readUserPreferences } from '@/lib/user-preferences';
import { DEFAULT_ZOOM, ZOOM_STEPS } from './week-layout';
const KEY = 'timer-grid-zoom';
function nearestStep(value) {
    return ZOOM_STEPS.reduce((closest, step) => Math.abs(step - value) < Math.abs(closest - value) ? step : closest);
}
function readStored() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw == null)
            return null;
        return parseTimerZoom(Number(raw));
    }
    catch {
        return null;
    }
}
function writeStored(zoom) {
    try {
        localStorage.setItem(KEY, String(zoom));
    }
    catch {
        /* ignore quota / private mode */
    }
}
export function useTimerGridZoom() {
    const { user } = useAuth();
    const [zoom, setZoom] = useState(() => readStored() ?? DEFAULT_ZOOM);
    useEffect(() => {
        if (readStored() != null)
            return;
        setZoom(readUserPreferences(user).timer_zoom);
    }, [user]);
    const index = ZOOM_STEPS.indexOf(zoom);
    const stepIndex = index === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : index;
    const set = useCallback((next) => {
        const clamped = nearestStep(next);
        setZoom(clamped);
        writeStored(clamped);
    }, []);
    const zoomOut = useCallback(() => {
        setZoom((current) => {
            const at = ZOOM_STEPS.indexOf(current);
            const next = ZOOM_STEPS[Math.max(0, (at === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : at) - 1)];
            writeStored(next);
            return next;
        });
    }, []);
    const zoomIn = useCallback(() => {
        setZoom((current) => {
            const at = ZOOM_STEPS.indexOf(current);
            const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, (at === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : at) + 1)];
            writeStored(next);
            return next;
        });
    }, []);
    const reset = useCallback(() => {
        set(DEFAULT_ZOOM);
    }, [set]);
    return {
        zoom,
        canZoomOut: stepIndex > 0,
        canZoomIn: stepIndex < ZOOM_STEPS.length - 1,
        canReset: zoom !== DEFAULT_ZOOM,
        zoomOut,
        zoomIn,
        reset,
    };
}
