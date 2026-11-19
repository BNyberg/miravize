import { ZOOM_STEPS } from '@/components/timer/week-layout';
export const CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'];
export const CURRENCY_SYMBOL = {
    SEK: 'kr',
    EUR: '€',
    USD: '$',
    GBP: '£',
    NOK: 'kr',
    DKK: 'kr',
};
export const TIMER_SPANS = [1, 5, 7];
export const APP_THEMES = ['light', 'dark', 'system'];
export const DEFAULT_PREFERENCES = {
    currency: 'EUR',
    timer_span: 5,
    timer_zoom: 1,
    theme: 'system',
    tasks_include_done: false,
    requests_include_done: false,
};
export const TASKS_INCLUDE_DONE_KEY = 'tasks-include-done';
export const REQUESTS_INCLUDE_DONE_KEY = 'requests-include-done';
export function parseTasksIncludeDone(value) {
    if (value === true || value === 'true')
        return true;
    if (value === false || value === 'false')
        return false;
    return null;
}
export function readTasksIncludeDoneStored() {
    try {
        return parseTasksIncludeDone(localStorage.getItem(TASKS_INCLUDE_DONE_KEY));
    }
    catch {
        return null;
    }
}
export function writeTasksIncludeDoneStored(value) {
    try {
        localStorage.setItem(TASKS_INCLUDE_DONE_KEY, String(value));
    }
    catch {
        /* ignore quota / private mode */
    }
}
export function readRequestsIncludeDoneStored() {
    try {
        return parseTasksIncludeDone(localStorage.getItem(REQUESTS_INCLUDE_DONE_KEY));
    }
    catch {
        return null;
    }
}
export function writeRequestsIncludeDoneStored(value) {
    try {
        localStorage.setItem(REQUESTS_INCLUDE_DONE_KEY, String(value));
    }
    catch {
        /* ignore quota / private mode */
    }
}
export function parseTimerSpan(value) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return TIMER_SPANS.includes(parsed) ? parsed : null;
}
export function parseTimerZoom(value) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed))
        return null;
    return ZOOM_STEPS.includes(parsed) ? parsed : null;
}
export function parseCurrency(value) {
    return CURRENCIES.includes(value) ? value : null;
}
export function parseAppTheme(value) {
    return APP_THEMES.includes(value) ? value : null;
}
export function readUserPreferences(user) {
    const raw = user?.user_metadata?.preferences;
    const record = raw && typeof raw === 'object' ? raw : {};
    return {
        currency: parseCurrency(record.currency) ?? DEFAULT_PREFERENCES.currency,
        timer_span: parseTimerSpan(record.timer_span) ?? DEFAULT_PREFERENCES.timer_span,
        timer_zoom: parseTimerZoom(record.timer_zoom) ?? DEFAULT_PREFERENCES.timer_zoom,
        theme: parseAppTheme(record.theme) ?? DEFAULT_PREFERENCES.theme,
        tasks_include_done: parseTasksIncludeDone(record.tasks_include_done) ?? DEFAULT_PREFERENCES.tasks_include_done,
        requests_include_done: parseTasksIncludeDone(record.requests_include_done) ?? DEFAULT_PREFERENCES.requests_include_done,
    };
}
export function samePreferences(a, b) {
    return (a.currency === b.currency &&
        a.timer_span === b.timer_span &&
        a.timer_zoom === b.timer_zoom &&
        a.theme === b.theme &&
        a.tasks_include_done === b.tasks_include_done &&
        a.requests_include_done === b.requests_include_done);
}
export function preferencesPayload(current, patch) {
    const previous = readUserPreferences(current);
    return { ...previous, ...patch };
}
