import type { User } from '@supabase/supabase-js'

import { ZOOM_STEPS } from '@/components/timer/week-layout'

export const CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'] as const
export type CurrencyCode = (typeof CURRENCIES)[number]

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  SEK: 'kr',
  EUR: '€',
  USD: '$',
  GBP: '£',
  NOK: 'kr',
  DKK: 'kr',
}

export type TimerSpan = 1 | 5 | 7
export const TIMER_SPANS: TimerSpan[] = [1, 5, 7]

export const APP_THEMES = ['light', 'dark', 'system'] as const
export type AppTheme = (typeof APP_THEMES)[number]

export type UserPreferences = {
  currency: CurrencyCode
  timer_span: TimerSpan
  timer_zoom: number
  theme: AppTheme
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  currency: 'EUR',
  timer_span: 5,
  timer_zoom: 1,
  theme: 'system',
}

export function parseTimerSpan(value: unknown): TimerSpan | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return TIMER_SPANS.includes(parsed as TimerSpan) ? (parsed as TimerSpan) : null
}

export function parseTimerZoom(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  return ZOOM_STEPS.includes(parsed as (typeof ZOOM_STEPS)[number]) ? parsed : null
}

export function parseCurrency(value: unknown): CurrencyCode | null {
  return CURRENCIES.includes(value as CurrencyCode) ? (value as CurrencyCode) : null
}

export function parseAppTheme(value: unknown): AppTheme | null {
  return APP_THEMES.includes(value as AppTheme) ? (value as AppTheme) : null
}

export function readUserPreferences(user: User | null | undefined): UserPreferences {
  const raw = user?.user_metadata?.preferences
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    currency: parseCurrency(record.currency) ?? DEFAULT_PREFERENCES.currency,
    timer_span: parseTimerSpan(record.timer_span) ?? DEFAULT_PREFERENCES.timer_span,
    timer_zoom: parseTimerZoom(record.timer_zoom) ?? DEFAULT_PREFERENCES.timer_zoom,
    theme: parseAppTheme(record.theme) ?? DEFAULT_PREFERENCES.theme,
  }
}

export function samePreferences(a: UserPreferences, b: UserPreferences) {
  return a.currency === b.currency && a.timer_span === b.timer_span && a.timer_zoom === b.timer_zoom && a.theme === b.theme
}

export function preferencesPayload(current: User | null | undefined, patch: Partial<UserPreferences>) {
  const previous = readUserPreferences(current)
  return { ...previous, ...patch }
}
