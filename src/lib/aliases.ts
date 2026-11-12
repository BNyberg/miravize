export function normalizeProjectName(
  raw: string,
  aliases: { shortcut: string; officialName: string }[],
): string {
  const value = raw.trim()
  if (!value) return value
  const match = aliases.find((a) => a.shortcut.toLowerCase() === value.toLowerCase())
  return match ? match.officialName : value
}

export function parseRequestNote(note: string): {
  project: string
  website: string
  additionalNotes: string
} {
  const parts = note.split('|').map((p) => p.trim())
  return {
    project: parts[0] ?? '',
    website: parts[1] ?? '',
    additionalNotes: parts.slice(2).join(' | '),
  }
}
