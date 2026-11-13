export function normalizeProjectName(
  raw: string,
  aliases: { shortcut: string; officialName: string }[],
): string {
  const value = raw.trim()
  if (!value) return value
  const match = aliases.find((a) => a.shortcut.toLowerCase() === value.toLowerCase())
  return match ? match.officialName : value
}
