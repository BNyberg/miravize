function joinLabels(labels) {
    if (labels.length <= 1)
        return labels[0] ?? '';
    if (labels.length === 2)
        return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}
export function logDisabledReason({ pending, track, hasWorkspace, hasText, hasProject, textLabel, }) {
    if (pending)
        return null;
    const fields = [];
    if (!hasText)
        fields.push(`a ${textLabel}`);
    const needsWorkspace = !hasWorkspace;
    const needsProject = track && hasWorkspace && !hasProject;
    if (fields.length === 0 && !needsWorkspace && !needsProject)
        return null;
    const parts = [];
    if (fields.length > 0) {
        const extra = needsWorkspace
            ? ', and pick a workspace or a project'
            : needsProject
                ? ', and choose a project'
                : '';
        parts.push(`Add ${joinLabels(fields)}${extra}.`);
        const fill = fields.length > 1
            ? 'fill those in'
            : `fill in the ${textLabel}`;
        parts.push(`Attach a screenshot of the request to ${fill}.`);
    }
    else if (needsWorkspace) {
        parts.push('Pick a workspace, or choose a project.');
    }
    else {
        parts.push('Choose a project.');
    }
    return parts.join(' ');
}
