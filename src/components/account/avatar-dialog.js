import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { AVATAR_ACCEPT, AVATAR_VIEW, clampPan, coverScale, isAvatarImage, renderAvatar, } from '@/lib/avatar-image';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
const EMPTY_CROP = { zoom: 1, panX: 0, panY: 0 };
export function AvatarDialog({ open, onOpenChange }) {
    const { user } = useAuth();
    const fileInput = useRef(null);
    const imageRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [fileUrl, setFileUrl] = useState(null);
    const [natural, setNatural] = useState(null);
    const [crop, setCrop] = useState(EMPTY_CROP);
    const [saving, setSaving] = useState(false);
    const drag = useRef(null);
    const [sessionOpen, setSessionOpen] = useState(open);
    if (open !== sessionOpen) {
        setSessionOpen(open);
        if (!open) {
            if (fileUrl)
                URL.revokeObjectURL(fileUrl);
            setFileUrl(null);
            setNatural(null);
            setCrop(EMPTY_CROP);
            setSaving(false);
        }
    }
    const chooseRef = useRef(() => { });
    function choose(file) {
        if (!file)
            return;
        if (!isAvatarImage(file)) {
            toast({
                tone: 'error',
                title: "Couldn't use that file",
                description: 'Use a JPEG, PNG, WebP, GIF, or AVIF image.',
            });
            return;
        }
        setCrop(EMPTY_CROP);
        setNatural(null);
        setFileUrl((current) => {
            if (current)
                URL.revokeObjectURL(current);
            return URL.createObjectURL(file);
        });
    }
    useEffect(() => {
        chooseRef.current = choose;
    });
    useEffect(() => {
        if (!open || fileUrl)
            return;
        function onPaste(event) {
            const files = [...(event.clipboardData?.files ?? [])];
            const file = files.find(isAvatarImage) ?? files[0];
            if (!file)
                return;
            event.preventDefault();
            chooseRef.current(file);
        }
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [open, fileUrl]);
    function displayedSize() {
        if (!natural)
            return { width: AVATAR_VIEW, height: AVATAR_VIEW };
        const scale = coverScale(natural.width, natural.height) * crop.zoom;
        return { width: natural.width * scale, height: natural.height * scale };
    }
    function setZoom(zoom) {
        setCrop((current) => {
            if (!natural)
                return { ...current, zoom };
            const currentScale = coverScale(natural.width, natural.height) * current.zoom;
            const nextScale = coverScale(natural.width, natural.height) * zoom;
            const currentWidth = natural.width * currentScale;
            const currentHeight = natural.height * currentScale;
            const width = natural.width * nextScale;
            const height = natural.height * nextScale;
            return {
                zoom,
                panX: clampPan(current.panX * (width / currentWidth), width),
                panY: clampPan(current.panY * (height / currentHeight), height),
            };
        });
    }
    async function confirm() {
        const image = imageRef.current;
        if (!image || !natural || !user || saving)
            return;
        setSaving(true);
        try {
            const blob = await renderAvatar(image, crop);
            const ext = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
            const path = `${user.id}/avatar.${ext}`;
            const uploaded = await supabase.storage.from('avatars').upload(path, blob, {
                upsert: true,
                contentType: blob.type,
                cacheControl: '3600',
            });
            if (uploaded.error)
                throw uploaded.error;
            const { data } = supabase.storage.from('avatars').getPublicUrl(path);
            const saved = await supabase.auth.updateUser({
                data: { avatar_url: `${data.publicUrl}?v=${Date.now()}` },
            });
            if (saved.error)
                throw saved.error;
            onOpenChange(false);
        }
        catch (error) {
            const description = error instanceof Error ? error.message : 'Try again.';
            toast({ tone: 'error', title: "Couldn't save profile picture", description });
            setSaving(false);
        }
    }
    const size = displayedSize();
    const left = (AVATAR_VIEW - size.width) / 2 + crop.panX;
    const top = (AVATAR_VIEW - size.height) / 2 + crop.panY;
    return (_jsx(Dialog, { open: open, onOpenChange: (next) => !saving && onOpenChange(next), children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: fileUrl ? 'Crop profile picture' : 'Profile picture' }) }), fileUrl ? (_jsxs("div", { className: "flex flex-col items-center gap-3", children: [_jsx("div", { className: "relative cursor-grab touch-none overflow-hidden rounded-md bg-muted active:cursor-grabbing", style: { width: AVATAR_VIEW, height: AVATAR_VIEW }, onPointerDown: (event) => {
                                event.currentTarget.setPointerCapture(event.pointerId);
                                drag.current = { x: event.clientX, y: event.clientY, panX: crop.panX, panY: crop.panY };
                            }, onPointerMove: (event) => {
                                const origin = drag.current;
                                if (!origin)
                                    return;
                                setCrop((current) => ({
                                    ...current,
                                    panX: clampPan(origin.panX + event.clientX - origin.x, size.width),
                                    panY: clampPan(origin.panY + event.clientY - origin.y, size.height),
                                }));
                            }, onPointerUp: () => {
                                drag.current = null;
                            }, onWheel: (event) => {
                                event.preventDefault();
                                const next = Math.min(3, Math.max(1, crop.zoom + (event.deltaY < 0 ? 0.08 : -0.08)));
                                setZoom(next);
                            }, children: _jsx("img", { ref: imageRef, src: fileUrl, alt: "", draggable: false, className: "absolute max-w-none select-none", style: { width: size.width, height: size.height, left, top }, onLoad: (event) => {
                                    const img = event.currentTarget;
                                    setNatural({ width: img.naturalWidth, height: img.naturalHeight });
                                } }) }), _jsxs("label", { className: "flex w-full items-center gap-3 text-sm text-muted-foreground", children: ["Zoom", _jsx("input", { type: "range", min: 1, max: 3, step: 0.01, value: crop.zoom, "aria-label": "Zoom", className: "h-2 w-full accent-foreground", onChange: (event) => setZoom(Number(event.target.value)) })] })] })) : (_jsx("button", { type: "button", className: cn('flex h-48 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-sm text-muted-foreground', dragging && 'bg-muted'), onClick: () => fileInput.current?.click(), onDragOver: (event) => {
                        event.preventDefault();
                        setDragging(true);
                    }, onDragLeave: () => setDragging(false), onDrop: (event) => {
                        event.preventDefault();
                        setDragging(false);
                        choose(event.dataTransfer.files[0]);
                    }, children: "Paste, drop, or click to choose an image" })), _jsx("input", { ref: fileInput, type: "file", accept: AVATAR_ACCEPT, className: "sr-only", onChange: (event) => {
                        choose(event.target.files?.[0]);
                        event.target.value = '';
                    } }), _jsxs(DialogFooter, { children: [fileUrl ? (_jsx(Button, { type: "button", variant: "outline", disabled: saving, onClick: () => {
                                setFileUrl((current) => {
                                    if (current)
                                        URL.revokeObjectURL(current);
                                    return null;
                                });
                                setNatural(null);
                                setCrop(EMPTY_CROP);
                            }, children: "Cancel" })) : null, fileUrl ? (_jsx(Button, { type: "button", disabled: !natural, loading: saving, onClick: () => void confirm(), children: "Confirm" })) : null] })] }) }));
}
