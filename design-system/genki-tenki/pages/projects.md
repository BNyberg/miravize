# Projects page

A two-pane ledger. No visible page title. One screen-reader heading. The page uses the shell padding. It is not edge to edge. The page fills the remaining main height. The index and the detail pane stretch to the bottom of that area and scroll inside their 8px surfaces. They do not shrink to the number of rows.

The toolbar is one row: Projects / Clients / Tags / Aliases as a single `h-9` segmented switch with `rounded-md` and `overflow-hidden`, then New project or New client on the right when the user can manage the workspace. Controls in this row share 36px height and the 4px control radius.

## Projects

The list is the index. It is an 8px-radius surface (`rounded-lg overflow-hidden`), the same as the detail pane. Each row is a 4px-radius color square, the name, and a muted project description on one line. Client splits sit on a second line in JetBrains Mono (`Northwind 60% · Internal 40%`). Rows with no clients omit that line. The selected row uses the muted surface.

The detail pane is one 8px-radius surface. Fields in order: name, optional description, color, billable by default, hourly rate with currency, client splits, quick-start tags, then Save.

Hourly rate is the project’s default amount per hour. Empty means no default. Currency is SEK, EUR, USD, GBP, NOK, or DKK. The rate is not copied onto time entries. A client can override that rate on the Clients pane.

Quick-start tags stay workspace labels for the timer. An activity is a named piece of work on one project, optionally bound to one client of that project. It is not reused on another project. The project editor adds project activities (`client_id` empty) and shows client activities as a read-only From clients list.

Client splits use the shared Select at 40% of the row. The percent field is a 36px input with a fixed `%` inside on the right. The suffix is not part of the typed value. Dropdowns use `src/components/ui/select.tsx`: 36px trigger, 4px corners, a 16px Heroicons chevron with padding so it does not touch the border, and an 8px menu the width of the trigger.

The project description belongs to the project. It is not copied onto time entries and does not change the timer’s work description.

Color is twelve swatches plus a native color input. The chosen hex is `projects.color`, the same fill the timer uses on blocks. A new project defaults to `#1F7A4D`.

Client splits stay optional. When present they must be unique and sum to 100. Presets remain 50/50, 60/40, and 70/30.

Below 768px the list and the detail stack. No centered modal.

## Clients

The same two-pane ledger as Projects. The index is client name and a project count. The detail pane has name, billable by default, Save, then the linked projects with split, project rate as placeholder, and an override amount in the project currency. Empty override means the project rate. Activities are named on a project this client already belongs to.

## Tags and aliases

Quick-start tags remain a name list. Alias shortcuts are mono, then the official project name and its color square. Create behavior is unchanged. There is no delete action on this page.
