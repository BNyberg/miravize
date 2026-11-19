/** Suggested 1–3 letter workspace code. One word uses its first letter. */
export function suggestWorkspaceIdCode(name: string) {
  const words = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0]![0]!.toUpperCase()
  return words
    .map((word) => word[0]!)
    .join('')
    .slice(0, 3)
    .toUpperCase()
}

export function workspaceIdInput(value: string) {
  return value.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
}
