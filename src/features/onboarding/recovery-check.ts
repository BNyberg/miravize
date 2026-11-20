export function recoveryGroups(formattedKey: string) {
  return formattedKey.split(' ').filter(Boolean)
}

export function randomGroupIndex(count: number) {
  if (count < 1) return 0
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0]! % count
}

export function recoveryGroupMatches(formattedKey: string, index: number, typed: string) {
  const groups = recoveryGroups(formattedKey)
  const expected = groups[index]
  if (!expected) return false
  return expected === typed.trim()
}
