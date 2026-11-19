import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { InformationCircleIcon, PaperClipIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { insertChipsAtMention, mentionQueryInEditor, NoteField, readNoteParts, writeNoteParts, } from '@/components/requests/note-field';
import { DisabledReasonTooltip } from '@/components/disabled-reason-tooltip';
import { MentionList } from '@/components/requests/mention-list';
import { Chip } from '@/components/timer/entry-editor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { logDisabledReason } from '@/lib/log-disabled-reason';
import { supabase } from '@/lib/supabase';
import { applyActivity, applyClients, applyProject, assignmentFromChips, chipsFromParts, chipsImpliedByHit, emptyAssignment, mentionChoices, notesFromParts, syncPartsToAssignment, } from '@/lib/request-assignment';
import { cn } from '@/lib/utils';
function imagesFromClipboard(data) {
    const fromFiles = [...data.files].filter((file) => file.type.startsWith('image/'));
    if (fromFiles.length > 0)
        return fromFiles;
    const fromItems = [];
    for (const item of data.items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file)
                fromItems.push(file);
        }
    }
    return fromItems;
}
function RequesterField({ workspaceId, value, onChange, }) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const names = useQuery({
        queryKey: ['request-requesters', workspaceId],
        enabled: Boolean(workspaceId),
        queryFn: async () => {
            const { data, error } = await supabase.from('requests').select('requester').eq('workspace_id', workspaceId);
            if (error)
                throw error;
            return [...new Set((data ?? []).map((row) => row.requester.trim()).filter((name) => name && name !== '-'))].sort((a, b) => a.localeCompare(b));
        },
    });
    const query = value.trim().toLowerCase();
    const matches = (names.data ?? []).filter((name) => !query || name.toLowerCase().includes(query));
    const listOpen = open && matches.length > 0;
    function choose(name) {
        onChange(name);
        setOpen(false);
        setActive(-1);
    }
    return (_jsxs(Popover, { open: listOpen, children: [_jsx(PopoverAnchor, { asChild: true, children: _jsx("input", { value: value, onChange: (event) => {
                        onChange(event.target.value);
                        setActive(-1);
                        setOpen(true);
                    }, onFocus: () => setOpen(true), onBlur: () => setOpen(false), placeholder: "Requester", "aria-label": "Requester", "aria-expanded": listOpen, "aria-autocomplete": "list", className: "h-9 w-full min-w-0 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground", onKeyDown: (event) => {
                        if (!listOpen)
                            return;
                        if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            setActive((current) => (current + 1) % matches.length);
                        }
                        else if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            setActive((current) => (current <= 0 ? matches.length - 1 : current - 1));
                        }
                        else if (event.key === 'Enter' && active >= 0) {
                            event.preventDefault();
                            const pick = matches[active];
                            if (pick)
                                choose(pick);
                        }
                        else if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
                            setOpen(false);
                            setActive(-1);
                        }
                    } }) }), _jsx(PopoverContent, { className: "w-56 p-1", onOpenAutoFocus: (event) => event.preventDefault(), align: "start", children: matches.map((name, index) => (_jsx("button", { type: "button", className: cn('flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted', index === active ? 'bg-muted' : ''), onMouseEnter: () => setActive(index), onMouseDown: (event) => {
                        event.preventDefault();
                        choose(name);
                    }, children: _jsx("span", { className: "truncate", children: name }) }, name))) })] }));
}
function RequestMetaChips({ workspaceId, assignment, catalog, onChange, }) {
    const projects = catalog.projects.filter((project) => !workspaceId || project.workspace_id === workspaceId);
    const project = projects.find((item) => item.id === assignment.projectId);
    const links = catalog.projectClients.filter((row) => row.project_id === assignment.projectId);
    const projectActivities = assignment.projectId
        ? catalog.activities.filter((row) => row.project_id === assignment.projectId)
        : catalog.activities.filter((row) => !workspaceId || row.workspace_id === workspaceId);
    const activity = catalog.activities.find((row) => row.id === assignment.activityId);
    const linkedClients = (assignment.projectId ? links : catalog.projectClients.filter((row) => !workspaceId || row.workspace_id === workspaceId))
        .map((row) => catalog.clients.find((item) => item.id === row.client_id))
        .filter((item) => Boolean(item));
    const uniqueClients = [...new Map(linkedClients.map((item) => [item.id, item])).values()];
    const clients = assignment.projectId
        ? uniqueClients
        : catalog.clients.filter((item) => !workspaceId || item.workspace_id === workspaceId);
    return (_jsxs("div", { className: "flex min-w-0 flex-wrap gap-1.5", children: [_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { type: "button", children: _jsx(Chip, { label: project?.name ?? 'Project', empty: !project, color: project?.color }) }) }), _jsxs(DropdownMenuContent, { children: [project ? (_jsx(DropdownMenuItem, { onSelect: () => onChange({ ...assignment, projectId: '', activityId: '', clientIds: [] }), children: "Clear project" })) : null, projects.map((item) => (_jsxs(DropdownMenuItem, { onSelect: () => onChange(applyProject(assignment, item.id, catalog)), children: [_jsx("span", { className: "size-2 shrink-0 rounded-sm", style: { background: item.color }, "aria-hidden": "true" }), item.name] }, item.id)))] })] }), projectActivities.length > 0 ? (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { type: "button", children: _jsx(Chip, { label: activity?.name ?? 'Activity', empty: !activity }) }) }), _jsxs(DropdownMenuContent, { children: [activity ? (_jsx(DropdownMenuItem, { onSelect: () => onChange({ ...assignment, activityId: '' }), children: "Clear activity" })) : null, projectActivities.map((item) => (_jsxs(DropdownMenuItem, { onSelect: () => onChange(applyActivity(assignment, item.id, catalog)), children: [item.name, item.client_id ? ` · ${catalog.clients.find((client) => client.id === item.client_id)?.name ?? ''}` : ''] }, item.id)))] })] })) : null, clients.length > 0 ? (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { type: "button", children: _jsx(Chip, { label: assignment.clientIds.length === 0
                                    ? 'Client'
                                    : assignment.clientIds
                                        .map((id) => clients.find((item) => item.id === id)?.name)
                                        .filter(Boolean)
                                        .join(', '), empty: assignment.clientIds.length === 0 }) }) }), _jsx(DropdownMenuContent, { children: clients.map((item) => {
                            const checked = assignment.clientIds.includes(item.id);
                            return (_jsxs(DropdownMenuItem, { onSelect: (event) => {
                                    event.preventDefault();
                                    const nextClients = checked
                                        ? assignment.clientIds.filter((id) => id !== item.id)
                                        : [...assignment.clientIds, item.id];
                                    onChange(applyClients(assignment, nextClients, catalog));
                                }, children: [_jsx("span", { className: cn('mr-2 font-mono text-xs', checked ? 'opacity-100' : 'opacity-30'), children: checked ? '✓' : '○' }), item.name] }, item.id));
                        }) })] })) : null] }));
}
export function RequestComposer({ catalog, workspaceId, isAll, pending, requester, request, onRequester, onRequest, onSubmit, }) {
    const [assignment, setAssignment] = useState(emptyAssignment);
    const [files, setFiles] = useState([]);
    const [active, setActive] = useState(0);
    const [mentionClosed, setMentionClosed] = useState(false);
    const [mention, setMention] = useState(null);
    const [removeFile, setRemoveFile] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [previews, setPreviews] = useState([]);
    const live = useRef([]);
    const editor = useRef(null);
    const fileInput = useRef(null);
    const projectWorkspace = catalog.projects.find((project) => project.id === assignment.projectId)?.workspace_id ?? '';
    const activeWorkspace = projectWorkspace || (isAll ? '' : workspaceId);
    const loggedOn = format(new Date(), 'yyyy-MM-dd');
    const choices = useMemo(() => (mention ? mentionChoices(mention.query, catalog, activeWorkspace, assignment) : []), [mention, catalog, activeWorkspace, assignment]);
    const mentionOpen = Boolean(mention) && choices.length > 0 && !mentionClosed;
    useEffect(() => {
        setActive(0);
        setMentionClosed(false);
    }, [mention?.query, mention?.start, choices.length]);
    useEffect(() => {
        const next = files.map((file) => ({
            key: `${file.name}-${file.lastModified}-${file.size}`,
            name: file.name,
            url: URL.createObjectURL(file),
        }));
        setPreviews(next);
        return () => {
            for (const item of next)
                URL.revokeObjectURL(item.url);
        };
    }, [files]);
    function applyParts() {
        if (!editor.current)
            return;
        const next = readNoteParts(editor.current);
        live.current = next;
        setAssignment(assignmentFromChips(chipsFromParts(next), catalog));
        setMention(mentionQueryInEditor(editor.current));
    }
    function setAssignmentFromHeader(next) {
        if (!editor.current) {
            setAssignment(next);
            return;
        }
        const synced = syncPartsToAssignment(readNoteParts(editor.current), next, catalog);
        writeNoteParts(editor.current, synced, catalog);
        live.current = synced;
        setAssignment(next);
        setMention(null);
    }
    function addFiles(list) {
        const images = [...list].filter((file) => file.type.startsWith('image/'));
        if (images.length === 0)
            return;
        setFiles((current) => [...current, ...images]);
    }
    function insertMention(hit) {
        const caret = mention ?? (editor.current ? mentionQueryInEditor(editor.current) : null);
        if (!caret || !editor.current)
            return;
        const existing = chipsFromParts(readNoteParts(editor.current));
        const implied = chipsImpliedByHit(hit, catalog, existing);
        if (implied.length === 0)
            return;
        insertChipsAtMention(caret, implied, catalog);
        applyParts();
        setMention(null);
    }
    const hasScreenshot = files.length > 0;
    const canLog = Boolean(activeWorkspace) &&
        (hasScreenshot || request.trim().length > 0) &&
        !pending;
    const canTrack = canLog && Boolean(assignment.projectId);
    const reasonInput = {
        pending,
        hasWorkspace: Boolean(activeWorkspace),
        hasText: hasScreenshot || request.trim().length > 0,
        hasProject: Boolean(assignment.projectId),
        textLabel: 'request',
    };
    const logReason = logDisabledReason({ ...reasonInput, track: false });
    const trackReason = logDisabledReason({ ...reasonInput, track: true });
    async function submit(track) {
        try {
            const current = editor.current ? readNoteParts(editor.current) : live.current;
            const saved = await onSubmit({
                workspaceId: activeWorkspace,
                assignment: assignmentFromChips(chipsFromParts(current), catalog),
                notes: notesFromParts(current),
                files,
                requester,
                request,
                loggedOn,
                track,
            });
            if (saved) {
                live.current = [];
                if (editor.current)
                    editor.current.replaceChildren();
                setAssignment(emptyAssignment());
                setFiles([]);
            }
        }
        catch {
            /* error toast shown by page */
        }
    }
    return (_jsxs("div", { className: cn('overflow-hidden rounded-lg border border-border bg-card', dragging ? 'bg-muted' : ''), onDragOver: (event) => {
            event.preventDefault();
            setDragging(true);
        }, onDragLeave: () => setDragging(false), onDrop: (event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
        }, onPasteCapture: (event) => {
            const pasted = imagesFromClipboard(event.clipboardData);
            if (pasted.length === 0)
                return;
            event.preventDefault();
            event.stopPropagation();
            addFiles(pasted);
        }, children: [_jsx("input", { ref: fileInput, type: "file", accept: "image/*", multiple: true, className: "sr-only", onChange: (event) => {
                    if (event.target.files)
                        addFiles(event.target.files);
                    event.target.value = '';
                } }), _jsxs(Popover, { open: mentionOpen, children: [_jsx(PopoverAnchor, { asChild: true, children: _jsx("div", { children: _jsx(NoteField, { placeholder: "Paste a screenshot, or @ to assign", className: "min-h-9 max-h-9 overflow-x-auto whitespace-nowrap border-0 bg-transparent px-3 py-1.5 text-sm leading-6 hover:bg-transparent", onReady: (el) => {
                                    editor.current = el;
                                }, onParts: (next) => {
                                    live.current = next;
                                    setAssignment(assignmentFromChips(chipsFromParts(next), catalog));
                                }, onMention: setMention, onKeyDown: (event) => {
                                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                        if (canLog)
                                            void submit(false);
                                        return true;
                                    }
                                    if (event.key === 'Enter' && !mentionOpen)
                                        return true;
                                    if (!mentionOpen)
                                        return false;
                                    if (event.key === 'ArrowDown') {
                                        setActive((current) => (current + 1) % Math.max(choices.length, 1));
                                        return true;
                                    }
                                    if (event.key === 'ArrowUp') {
                                        setActive((current) => (current - 1 + choices.length) % Math.max(choices.length, 1));
                                        return true;
                                    }
                                    if (event.key === 'Enter') {
                                        const pick = choices[active] ?? choices[0];
                                        if (pick)
                                            insertMention(pick);
                                        return true;
                                    }
                                    if (event.key === 'Escape') {
                                        setMentionClosed(true);
                                        return true;
                                    }
                                    return false;
                                } }) }) }), _jsx(PopoverContent, { className: "max-h-72 w-72 overflow-y-auto p-1", onOpenAutoFocus: (event) => event.preventDefault(), children: _jsx(MentionList, { choices: choices, active: active, onHover: setActive, onPick: insertMention }) })] }), _jsxs("div", { className: "flex border-t border-border", children: [_jsx("div", { className: "w-1/4 min-w-0", children: _jsx(RequesterField, { workspaceId: activeWorkspace, value: requester, onChange: onRequester }) }), _jsxs("div", { className: "relative w-3/4 min-w-0", children: [request.trim().length === 0 ? (_jsxs("span", { className: "pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground", children: ["Request", _jsx("span", { className: "text-destructive/70", children: "*" })] })) : null, _jsx("input", { value: request, onChange: (event) => onRequest(event.target.value), onKeyDown: (event) => {
                                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canLog) {
                                        event.preventDefault();
                                        void submit(false);
                                    }
                                }, required: true, "aria-required": true, "aria-label": "Request", className: "h-9 w-full min-w-0 border-l border-border bg-transparent px-3 text-sm outline-none" })] })] }), previews.length > 0 ? (_jsx("ul", { className: "flex flex-wrap gap-2 border-t border-border px-3 py-2", children: previews.map((preview) => (_jsxs("li", { className: "group relative size-16 overflow-hidden rounded-md border border-border bg-muted", children: [_jsx("img", { src: preview.url, alt: "", className: "size-full object-cover" }), _jsx("span", { className: "sr-only", children: preview.name }), _jsx(Button, { type: "button", variant: "ghost", size: "icon", className: "absolute top-0.5 right-0.5 size-6 bg-card/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100", "aria-label": `Remove ${preview.name}`, onClick: () => setRemoveFile(preview.name), children: _jsx(XMarkIcon, {}) })] }, preview.key))) })) : null, _jsxs("div", { className: "flex items-center justify-between gap-2 border-t border-border px-2 py-2", children: [_jsxs("div", { className: "flex min-w-0 flex-wrap items-center gap-1.5", children: [_jsx(RequestMetaChips, { workspaceId: activeWorkspace, assignment: assignment, catalog: catalog, onChange: setAssignmentFromHeader }), _jsx(Button, { type: "button", variant: "ghost", size: "icon", "aria-label": "Attach screenshots", onClick: () => fileInput.current?.click(), children: _jsx(PaperClipIcon, {}) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { type: "button", variant: "ghost", size: "icon", "aria-label": "About screenshots", children: _jsx(InformationCircleIcon, {}) }) }), _jsx(TooltipContent, { children: "The screenshot is only used to fill in the requester and request. It is not saved." })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(DisabledReasonTooltip, { reason: trackReason, children: _jsx(Button, { type: "button", variant: "outline", disabled: !canTrack, loading: pending, onClick: () => void submit(true), children: "Log and track" }) }), _jsx(DisabledReasonTooltip, { reason: logReason, children: _jsx(Button, { type: "button", disabled: !canLog, loading: pending, onClick: () => void submit(false), children: "Log" }) })] })] }), _jsx(Dialog, { open: Boolean(removeFile), onOpenChange: (open) => !open && setRemoveFile(null), children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsxs(DialogTitle, { className: "font-bold text-destructive", children: ["Delete ", removeFile, "?"] }), _jsx(DialogDescription, { children: "This removes the screenshot from this request." })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => setRemoveFile(null), children: "Cancel" }), _jsx(Button, { type: "button", variant: "destructive", onClick: () => {
                                        setFiles((current) => current.filter((file) => file.name !== removeFile));
                                        setRemoveFile(null);
                                    }, children: "Delete" })] })] }) })] }));
}
