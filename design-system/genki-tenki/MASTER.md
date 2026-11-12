# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/genki-tenki/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, follow the rules below.
>
> **Phase:** Graphite Ledger tokens apply across the app. The Timer page is a week time grid. The Projects page follows `design-system/genki-tenki/pages/projects.md`. The shell, running banner, timesheet, requests, settings, and authentication layouts are not migrated yet. Do not restore the previous mint canvas, orange CTA, Plus Jakarta Sans, 12px cards, hover lift, or modal blur. Do not rebuild the chronograph.

---

**Project:** Genki Tenki
**Direction:** Graphite Ledger, with Ink Editorial restraint
**Updated:** 2026-11-12

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary / running (light) | `#1F7A4D` | `--color-primary` |
| Primary / running (dark) | `#3DDC97` | `--color-primary` |
| On Primary (light) | `#FFFFFF` | `--color-on-primary` |
| On Primary (dark) | `#062116` | `--color-on-primary` |
| Background (light) | `#F4F3EF` | `--color-background` |
| Background (dark) | `#0C0C0B` | `--color-background` |
| Foreground (light) | `#1C1B19` | `--color-foreground` |
| Foreground (dark) | `#E8E6E1` | `--color-foreground` |
| Card (light) | `#FBFAF7` | `--color-card` |
| Card (dark) | `#161615` | `--color-card` |
| Muted (light) | `#E8E6E0` | `--color-muted` |
| Muted (dark) | `#1C1C1A` | `--color-muted` |
| Muted Foreground (light) | `#5E5C57` | `--color-muted-foreground` |
| Muted Foreground (dark) | `#9C9A93` | `--color-muted-foreground` |
| Border (light) | `#DDD9D2` | `--color-border` |
| Border (dark) | `#2A2A28` | `--color-border` |
| Sidebar (light) | `#EFEDE8` | `--color-sidebar` |
| Sidebar (dark) | `#10100F` | `--color-sidebar` |
| Destructive | `#B42318` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |

One accent. Green is for the running state and the primary action. No mint field, no second accent, no decorative gradient.

Body text and idle chronograph digits must stay at least 4.5:1 against their surface. Do not mute the digits to show state.

### Typography

- **UI:** IBM Plex Sans, 400 body, 500 labels and controls
- **Time and durations:** JetBrains Mono, 500, tabular lining figures, no negative tracking
- **Section labels:** 11px, weight 500, tracking `0.08em`
- **Do not** repeat a page name that is already in the navigation as a visible title. Keep one screen-reader heading per page.

### Spacing

4 / 8 / 12 / 16 / 24 / 32. Fields and toolbar controls are 36px (`h-9`). Controls in the same row share that height and the 4px control radius. A segmented switch is one bordered group at that height, with `rounded-md` and `overflow-hidden`. Do not mix a shorter square strip with 36px buttons.

A ledger page fills the remaining content height. Lists and editor panes do not shrink to their rows. They scroll inside an 8px surface that reaches the bottom of the padded main area.

Toasts sit at the top right. Each is an 8px card: icon, title, and dismiss on the first row, optional description on the second aligned with the title. Success uses a check, error an X, info an i. Dismiss with the button or by swiping right. Success and info leave after 4 seconds. Errors stay.

### Radius and depth

- `--radius: 4px` for inputs, buttons, and other controls
- Cards and larger surfaces: 8px
- Nested pieces such as menu rows and the checkbox: 2px
- Borders: 1px
- No glass, blur, glow, gradient, or hover lift
- Hover is a one-step surface or brightness change, 150ms
- Focus: 1px outline, 2px offset, `focus-visible` only
- The switch thumb stays a small pill. It is the only pill.

### Timer page

The Timer page is a time grid. One column per day. Hours run down the left in JetBrains Mono. Entries are blocks placed by start and end, filled with the project color, 4px corners, and a mono duration. Overlapping entries share that single column as lanes. There is no second day column and no planned-time track.

A thin strip above the grid shows the same entries in time order. The toolbar is one row: Day / 5 / 7, previous, Today, next, the date, then Start or Stop. While a timer is running, a 1px divider, the project badge, and a description field sit directly after the date. The field saves that entry’s description on blur or Enter, whether the timer was started from the popover or from quick start. The running duration appears only while a timer is running. Below 768px the grid shows one day and the span switch is hidden.

Day view is one column. Each block is a row: project, an editable description, and the duration. The description saves on blur or Enter and does not move the entry. Week columns keep the description read-only, and only when the block is tall enough.

Start opens the start popover. The chevron on that same control opens the quick-start list. A project row starts that project immediately. A tag row starts the project that tag is linked to, and attaches the tag. A tag linked to more than one project is one row per pair. Stop replaces the whole control while a timer is running.

Dragging an empty cell creates a finished entry in 15-minute steps. Dragging a block moves it. Dragging its bottom edge changes the end. The running block is not draggable. A green hairline marks the current time on today, and the running block has a 2px green leading edge.

### Product signatures

**Ledger index.** The running block uses a 2px green leading edge. The current-time mark is a hairline in the same green. Color is never the only signal: the toolbar still says Start or Stop. There is no paused state.

### Copy

Do not add page subtitles that explain obvious controls. Keep validation, alerts, permission notes, and operating instructions. Empty regions get one next step, not a paragraph.

Do not use a centered modal when the action can be a popover, dropdown, or inline editor. A modal is only for a flow that cannot be completed in place.

### Icons

Heroicons outline, 16px. Decorative icons beside text are `aria-hidden`. Icon-only controls need an accessible name. Phosphor remains only where a surface has not been migrated. Do not remove that dependency until every import is gone.

### Motion

150–200ms color changes. Respect `prefers-reduced-motion`. No scroll-reveal on application chrome.

### Not yet migrated

Shell navigation, running banner, timesheet, requests, settings, and authentication layouts. Shared tokens already apply there. Do not redesign those layouts until the Timer and Projects pages have been reviewed.
