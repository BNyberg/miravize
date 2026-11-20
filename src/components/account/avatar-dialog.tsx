import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/auth-context'
import { publishAvatar } from '@/features/crypto/publish-avatar'
import {
  AVATAR_ACCEPT,
  AVATAR_VIEW,
  clampPan,
  coverScale,
  isAvatarImage,
  renderAvatar,
  type AvatarCrop,
} from '@/lib/avatar-image'
import { cn } from '@/lib/utils'

const EMPTY_CROP: AvatarCrop = { zoom: 1, panX: 0, panY: 0 }

export function AvatarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [dragging, setDragging] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [crop, setCrop] = useState<AvatarCrop>(EMPTY_CROP)
  const [saving, setSaving] = useState(false)
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [sessionOpen, setSessionOpen] = useState(open)
  if (open !== sessionOpen) {
    setSessionOpen(open)
    if (!open) {
      if (fileUrl) URL.revokeObjectURL(fileUrl)
      setFileUrl(null)
      setNatural(null)
      setCrop(EMPTY_CROP)
      setSaving(false)
    }
  }

  const chooseRef = useRef<(file: File | undefined) => void>(() => {})

  function choose(file: File | undefined) {
    if (!file) return
    if (!isAvatarImage(file)) {
      toast({
        tone: 'error',
        title: "Couldn't use that file",
        description: 'Use a JPEG, PNG, WebP, GIF, or AVIF image.',
      })
      return
    }
    setCrop(EMPTY_CROP)
    setNatural(null)
    setFileUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(file)
    })
  }

  useEffect(() => {
    chooseRef.current = choose
  })

  useEffect(() => {
    if (!open || fileUrl) return
    function onPaste(event: ClipboardEvent) {
      const files = [...(event.clipboardData?.files ?? [])]
      const file = files.find(isAvatarImage) ?? files[0]
      if (!file) return
      event.preventDefault()
      chooseRef.current(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open, fileUrl])

  function displayedSize() {
    if (!natural) return { width: AVATAR_VIEW, height: AVATAR_VIEW }
    const scale = coverScale(natural.width, natural.height) * crop.zoom
    return { width: natural.width * scale, height: natural.height * scale }
  }

  function setZoom(zoom: number) {
    setCrop((current) => {
      if (!natural) return { ...current, zoom }
      const currentScale = coverScale(natural.width, natural.height) * current.zoom
      const nextScale = coverScale(natural.width, natural.height) * zoom
      const currentWidth = natural.width * currentScale
      const currentHeight = natural.height * currentScale
      const width = natural.width * nextScale
      const height = natural.height * nextScale
      return {
        zoom,
        panX: clampPan(current.panX * (width / currentWidth), width),
        panY: clampPan(current.panY * (height / currentHeight), height),
      }
    })
  }

  async function confirm() {
    const image = imageRef.current
    if (!image || !natural || !user || saving) return
    setSaving(true)
    try {
      const blob = await renderAvatar(image, crop)
      await publishAvatar(user.id, blob)
      await queryClient.invalidateQueries()
      onOpenChange(false)
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Try again.'
      toast({ tone: 'error', title: "Couldn't save profile picture", description })
      setSaving(false)
    }
  }

  const size = displayedSize()
  const left = (AVATAR_VIEW - size.width) / 2 + crop.panX
  const top = (AVATAR_VIEW - size.height) / 2 + crop.panY

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{fileUrl ? 'Crop profile picture' : 'Profile picture'}</DialogTitle>
        </DialogHeader>
        {fileUrl ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative cursor-grab touch-none overflow-hidden rounded-md bg-muted active:cursor-grabbing"
              style={{ width: AVATAR_VIEW, height: AVATAR_VIEW }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                drag.current = { x: event.clientX, y: event.clientY, panX: crop.panX, panY: crop.panY }
              }}
              onPointerMove={(event) => {
                const origin = drag.current
                if (!origin) return
                setCrop((current) => ({
                  ...current,
                  panX: clampPan(origin.panX + event.clientX - origin.x, size.width),
                  panY: clampPan(origin.panY + event.clientY - origin.y, size.height),
                }))
              }}
              onPointerUp={() => {
                drag.current = null
              }}
              onWheel={(event) => {
                event.preventDefault()
                const next = Math.min(3, Math.max(1, crop.zoom + (event.deltaY < 0 ? 0.08 : -0.08)))
                setZoom(next)
              }}
            >
              <img
                ref={imageRef}
                src={fileUrl}
                alt=""
                draggable={false}
                className="absolute max-w-none select-none"
                style={{ width: size.width, height: size.height, left, top }}
                onLoad={(event) => {
                  const img = event.currentTarget
                  setNatural({ width: img.naturalWidth, height: img.naturalHeight })
                }}
              />
            </div>
            <label className="flex w-full items-center gap-3 text-sm text-muted-foreground">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={crop.zoom}
                aria-label="Zoom"
                className="h-2 w-full accent-foreground"
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
          </div>
        ) : (
          <button
            type="button"
            className={cn(
              'flex h-48 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-sm text-muted-foreground',
              dragging && 'bg-muted',
            )}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              choose(event.dataTransfer.files[0])
            }}
          >
            Paste, drop, or click to choose an image
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={AVATAR_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            choose(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <DialogFooter>
          {fileUrl ? (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setFileUrl((current) => {
                  if (current) URL.revokeObjectURL(current)
                  return null
                })
                setNatural(null)
                setCrop(EMPTY_CROP)
              }}
            >
              Cancel
            </Button>
          ) : null}
          {fileUrl ? (
            <Button type="button" disabled={!natural} loading={saving} onClick={() => void confirm()}>
              Confirm
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
