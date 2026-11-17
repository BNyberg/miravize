export async function functionError(err: unknown, fallback = 'Try again.') {
  const context =
    err && typeof err === 'object' && 'context' in err
      ? (err as { context?: { json?: () => Promise<unknown> } }).context
      : undefined
  if (context && typeof context.json === 'function') {
    const body = (await context.json().catch(() => null)) as { error?: unknown } | null
    if (body && typeof body.error === 'string' && body.error) return body.error
  }
  if (err instanceof Error && err.message && !err.message.includes('non-2xx')) return err.message
  return fallback
}
