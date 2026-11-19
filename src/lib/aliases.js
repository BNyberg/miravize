export function normalizeProjectName(raw, aliases) {
    const value = raw.trim();
    if (!value)
        return value;
    const match = aliases.find((a) => a.shortcut.toLowerCase() === value.toLowerCase());
    return match ? match.officialName : value;
}
