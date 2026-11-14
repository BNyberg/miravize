import {
  AcademicCapIcon,
  BanknotesIcon,
  BeakerIcon,
  BellIcon,
  BoltIcon,
  BookmarkIcon,
  BookOpenIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CalendarIcon,
  CameraIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  CloudIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  ComputerDesktopIcon,
  CpuChipIcon,
  CubeIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  FlagIcon,
  FolderIcon,
  GiftIcon,
  GlobeAltIcon,
  HashtagIcon,
  HeartIcon,
  HomeIcon,
  InboxIcon,
  KeyIcon,
  LightBulbIcon,
  MapPinIcon,
  MegaphoneIcon,
  MoonIcon,
  MusicalNoteIcon,
  PaintBrushIcon,
  PaperAirplaneIcon,
  PencilIcon,
  PhoneIcon,
  PhotoIcon,
  PuzzlePieceIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  SparklesIcon,
  StarIcon,
  SunIcon,
  TagIcon,
  TrophyIcon,
  TruckIcon,
  UserGroupIcon,
  UserIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import { Buildings } from '@phosphor-icons/react'

import type { ComponentType, SVGProps } from 'react'

import { cn } from '@/lib/utils'

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>

export const HERO_PRESETS: { name: string; icon: HeroIcon }[] = [
  { name: 'BuildingOffice2Icon', icon: BuildingOffice2Icon },
  { name: 'BriefcaseIcon', icon: BriefcaseIcon },
  { name: 'FolderIcon', icon: FolderIcon },
  { name: 'HomeIcon', icon: HomeIcon },
  { name: 'UserIcon', icon: UserIcon },
  { name: 'UsersIcon', icon: UsersIcon },
  { name: 'UserGroupIcon', icon: UserGroupIcon },
  { name: 'EnvelopeIcon', icon: EnvelopeIcon },
  { name: 'PhoneIcon', icon: PhoneIcon },
  { name: 'BellIcon', icon: BellIcon },
  { name: 'Cog6ToothIcon', icon: Cog6ToothIcon },
  { name: 'BookOpenIcon', icon: BookOpenIcon },
  { name: 'PencilIcon', icon: PencilIcon },
  { name: 'InboxIcon', icon: InboxIcon },
  { name: 'TagIcon', icon: TagIcon },
  { name: 'ShieldCheckIcon', icon: ShieldCheckIcon },
  { name: 'TrophyIcon', icon: TrophyIcon },
  { name: 'CalendarIcon', icon: CalendarIcon },
  { name: 'ClockIcon', icon: ClockIcon },
  { name: 'ChartBarIcon', icon: ChartBarIcon },
  { name: 'DocumentTextIcon', icon: DocumentTextIcon },
  { name: 'CodeBracketIcon', icon: CodeBracketIcon },
  { name: 'CommandLineIcon', icon: CommandLineIcon },
  { name: 'ComputerDesktopIcon', icon: ComputerDesktopIcon },
  { name: 'CpuChipIcon', icon: CpuChipIcon },
  { name: 'GlobeAltIcon', icon: GlobeAltIcon },
  { name: 'HeartIcon', icon: HeartIcon },
  { name: 'LightBulbIcon', icon: LightBulbIcon },
  { name: 'MapPinIcon', icon: MapPinIcon },
  { name: 'MegaphoneIcon', icon: MegaphoneIcon },
  { name: 'MusicalNoteIcon', icon: MusicalNoteIcon },
  { name: 'PaintBrushIcon', icon: PaintBrushIcon },
  { name: 'PaperAirplaneIcon', icon: PaperAirplaneIcon },
  { name: 'PhotoIcon', icon: PhotoIcon },
  { name: 'RocketLaunchIcon', icon: RocketLaunchIcon },
  { name: 'ShoppingBagIcon', icon: ShoppingBagIcon },
  { name: 'SparklesIcon', icon: SparklesIcon },
  { name: 'StarIcon', icon: StarIcon },
  { name: 'SunIcon', icon: SunIcon },
  { name: 'MoonIcon', icon: MoonIcon },
  { name: 'TruckIcon', icon: TruckIcon },
  { name: 'WrenchScrewdriverIcon', icon: WrenchScrewdriverIcon },
  { name: 'AcademicCapIcon', icon: AcademicCapIcon },
  { name: 'BanknotesIcon', icon: BanknotesIcon },
  { name: 'BeakerIcon', icon: BeakerIcon },
  { name: 'BoltIcon', icon: BoltIcon },
  { name: 'BookmarkIcon', icon: BookmarkIcon },
  { name: 'CameraIcon', icon: CameraIcon },
  { name: 'ChatBubbleLeftRightIcon', icon: ChatBubbleLeftRightIcon },
  { name: 'CloudIcon', icon: CloudIcon },
  { name: 'CubeIcon', icon: CubeIcon },
  { name: 'FlagIcon', icon: FlagIcon },
  { name: 'GiftIcon', icon: GiftIcon },
  { name: 'HashtagIcon', icon: HashtagIcon },
  { name: 'KeyIcon', icon: KeyIcon },
  { name: 'PuzzlePieceIcon', icon: PuzzlePieceIcon },
]

const heroByName = new Map(HERO_PRESETS.map((preset) => [preset.name, preset.icon]))

export function encodeWorkspaceIcon(
  custom: string,
  hero: string | null,
): { ok: true; value: string | null } | { ok: false } {
  const text = custom.trim()
  if (text) {
    if (/^\p{L}{1,2}$/u.test(text)) return { ok: true, value: `letters:${text.toUpperCase()}` }
    const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
    if (parts.length === 1 && /\p{Extended_Pictographic}/u.test(text)) {
      return { ok: true, value: `emoji:${text}` }
    }
    return { ok: false }
  }
  if (hero && heroByName.has(hero)) return { ok: true, value: `hero:${hero}` }
  return { ok: true, value: null }
}

export function decodeWorkspaceIcon(icon: string | null | undefined): { hero: string | null; custom: string } {
  if (!icon) return { hero: null, custom: '' }
  if (icon.startsWith('hero:')) {
    const name = icon.slice(5)
    return heroByName.has(name) ? { hero: name, custom: '' } : { hero: null, custom: '' }
  }
  if (icon.startsWith('letters:')) return { hero: null, custom: icon.slice(8) }
  if (icon.startsWith('emoji:')) return { hero: null, custom: icon.slice(6) }
  return { hero: null, custom: '' }
}

export function WorkspaceMark({
  icon,
  className,
}: {
  icon: string | null | undefined
  className?: string
}) {
  if (icon?.startsWith('hero:')) {
    const Hero = heroByName.get(icon.slice(5))
    if (Hero) return <Hero aria-hidden="true" className={cn('size-4 shrink-0', className)} />
  }
  if (icon?.startsWith('emoji:') || icon?.startsWith('letters:')) {
    const text = icon.startsWith('emoji:') ? icon.slice(6) : icon.slice(8)
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] font-medium leading-none',
          className,
        )}
      >
        {text}
      </span>
    )
  }
  return <Buildings aria-hidden="true" className={cn('size-4 shrink-0', className)} />
}
