# Projects page

A two-pane ledger. No visible page title. One screen-reader heading. The page uses the shell padding. It is not edge to edge. The page fills the remaining main height. The index and the detail pane stretch to the bottom of that area and scroll inside their 8px surfaces. They do not shrink to the number of rows.

The toolbar is one row: Projects / Clients as a single `h-9` segmented switch with `rounded-md` and `overflow-hidden`, then New project or New client on the right when the user can manage the workspace. Controls in this row share 36px height and the 4px control radius.

## Projects

The list is the index. It is an 8px-radius surface (`rounded-lg overflow-hidden`), the same as the detail pane. Each row is a 4px-radius color square, the name, and a muted project description on one line. Client splits sit on a second line in JetBrains Mono (`Northwind 60% · Internal 40%`). Rows with no clients omit that line. The selected row uses the muted surface.

The detail pane is one 8px-radius surface. Fields in order: name, optional description, color, billable by default, hourly rate with currency, client splits, Activities, From clients, Aliases, Save. Activities and Aliases are on a new project too. Add keeps those names in the form until Save creates the project. Then they are stored. Switching project or New project drops unsaved names. On a saved project, Add writes immediately.

Hourly rate is the project’s default amount per hour. Empty means no default. Currency is SEK, EUR, USD, GBP, NOK, or DKK. The rate is not copied onto time entries. A client can override that rate on the Clients pane.

An activity is a named piece of work on one project, optionally bound to one client of that project. It is not reused on another project. The project editor adds project activities (`client_id` empty) and shows client activities as a read-only From clients list. The timer Start menu lists those activities. There is no Tags tab.

Client splits use the shared Select at 40% of the row. The percent field is a 36px input with a fixed `%` inside on the right. The suffix is not part of the typed value. Dropdowns use `src/components/ui/select.tsx`: 36px trigger, 4px corners, a 16px Heroicons chevron with padding so it does not touch the border, and an 8px menu the width of the trigger.

The project description belongs to the project. It is not copied onto time entries and does not change the timer’s work description.

Color is twelve swatches plus a native color input. The chosen hex is `projects.color`, the same fill the timer uses on blocks. A new project defaults to `#1F7A4D`.

Clients are optional. Leave them empty for a personal or internal project. No split is the default and sits first, then 50/50, 60/40, and 70/30. The selected control uses the filled foreground style. No split hides the percent fields and keeps each logged hour whole. A split divides that time across the clients and must be unique and sum to 100. List chips show percents only when the project is split. A 16px Heroicons information icon next to the Clients heading opens that copy in a tooltip. Do not keep it as body text under the heading.

Below 768px the list and the detail stack. There is no centered modal except Delete project.

When a saved project is open, managers get Delete project using the destructive button token. The dialog title is Delete {name}? in the destructive color. Body: time entries, aliases, and activities on this project (including client activities here) are removed. Clients and their activities on other projects stay. Then a destructive line: This action is irreversible. Confirm by typing the project name: Type {name} project to confirm, with the name in the destructive color.

Aliases are shortcuts for this project. Unique per workspace. Managers add one with a 36px mono input and Add. The list is the shortcut in mono. Empty copy when there are none. No delete. On a new project they stay in the form until Save.

## Clients

The same two-pane ledger as Projects. The index is client name and a project count. The detail pane has name, billable by default, Save, then the linked projects with split, project rate as placeholder, and an override amount in the project currency. Empty override means the project rate. Activities are named on a project this client already belongs to.
