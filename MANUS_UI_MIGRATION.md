# Fiosra UI Migration Guide (Manus -> Local Svelte Build)

This document serves as a design system reference extracted from the Manus React/Tailwind/Shadcn codebase. It is intended to guide the migration of the visual look and feel into the local Svelte codebase.

---

## 1. Global Theme & Color Palette

The Manus build relies on a custom color palette defined using CSS variables and semantic theme mappings (Light Mode default / Dark Mode support). These should be translated to your Svelte project's global CSS or Tailwind config.

### Base Colors (Fiosra Core Palette)
*   **Bone (Background):** `#F6F5F1` - Used as the primary app background (`--background`)
*   **Cloud (Secondary):** `#E9E8E3`
*   **Cloud Subtle:** `#F0EFEA`
*   **Slate:** `#6D7378` - Used for muted text
*   **Slate Light:** `#8A9096`
*   **Obsidian (Foreground):** `#111315` - Used as the primary text color (`--foreground`)
*   **Graphite:** `#23272B`
*   **Graphite Soft:** `#32373C`

### Accent Colors
*   **Horizon Blue (Primary):** `#4F6BFF` (Soft: `#EBF0FF`) - Used for primary actions, focus rings, and active states.
*   **Aurora:** `#7B61FF` (Soft: `#F1EDFF`)
*   **Signal Green:** `#5FAF7A` (Soft: `#EBF7F0`) - Used for positive/completed states.
*   **Amber:** `#D89A3A` (Soft: `#FDF6EC`) - Used for attention/warnings.
*   **Deep Red (Destructive):** `#B74C4C` (Soft: `#FCEFEF`) - Used for critical errors or destructive actions.

### Semantic Defaults (Light Theme)
*   **Borders & Inputs:** `#DDDCD5`
*   **Radius:** `10px`
*   **Typography:** `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
*   **Font Smoothing:** Antialiased with `-0.011em` letter spacing.

---

## 2. Core Layout Patterns

### A. Fiosra App Shell (`FiosraAppShell.svelte`)
This acts as the primary global wrapper for the application.

**Key Structural Classes:**
*   **Main Container:** `min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col`
*   **Text Selection (Highlight):** `selection:bg-[var(--color-horizon-blue-soft)] selection:text-[var(--color-horizon-blue)]`
*   **Header (Sticky):** `border-b border-[#DDDCD5] bg-[var(--color-bone)]/80 backdrop-blur sticky top-0 z-40`
*   **Header Content Wrapper:** `max-w-6xl mx-auto flex min-h-[80px] flex-wrap items-center justify-between gap-y-2 px-4 py-2 sm:px-6 md:h-[80px] md:flex-nowrap md:gap-y-0 md:py-0`
*   **Main Content Area:** `flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8` (Adjusted when in "Workspace Mode" to `lg:h-[calc(100svh-80px)] lg:overflow-hidden`).

**Navigation Elements:**
*   Role toggle/selectors use off-white backgrounds with structural borders: `rounded-lg border border-[#DDDCD5] bg-[#EAE8E1] p-1`
*   Active toggles get: `bg-[#FFFFFF] text-[var(--color-obsidian)] shadow-xs`
*   Inactive toggles get: `text-[var(--color-slate)] hover:text-[var(--color-obsidian)]`

### B. Dashboard Sidebar Layout (`DashboardLayout.svelte`)
Used for workspace areas requiring a sidebar navigation panel.

**Key Structural Classes:**
*   The layout is wrapped in a full-height container with CSS variables dynamically controlling the sidebar width (e.g., `--sidebar-width: 280px`).
*   **Sidebar Mobile Header:** `flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40`
*   **Resizable Handle:** A hidden/absolute div on the right edge of the sidebar: `absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors`

---

## 3. Micro-Components & Indicators

### Status Badges
Often used to denote state (Active, Positive, Attention).

**Base Classes:** `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border`
*   **Neutral:** `bg-[#EAE8E1] text-[var(--color-slate)] border-[#DDDCD5]`
*   **Active (Horizon Blue):** `bg-[var(--color-horizon-blue-soft)] text-[var(--color-horizon-blue)] border-[#CAD6FF]`
*   **Positive (Signal Green):** `bg-[var(--color-signal-green-soft)] text-[var(--color-signal-green)] border-[#C4E9D2]`
*   **Attention (Amber):** `bg-[var(--color-amber-soft)] text-[var(--color-amber)] border-[#F9E0BC]`
*   **Critical (Deep Red):** `bg-[var(--color-deep-red-soft)] text-[var(--color-deep-red)] border-[#F5CACA]`

### Path Node Preview (Reasoning Trace)
Used to show a progress line or AI reasoning steps.

**Structure:** A flex container with a circular indicator and text.
*   **Wrapper:** `flex items-start gap-3`
*   **Circle Base:** `w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center`
*   **Active Inner Dot:** `w-1.5 h-1.5 rounded-full bg-[var(--color-horizon-blue)]`
*   **Completed State:** `border-[var(--color-signal-green)] bg-[var(--color-signal-green-soft)] text-[var(--color-signal-green)]`
*   **Active State:** `border-[var(--color-horizon-blue)] bg-[var(--color-horizon-blue-soft)] text-[var(--color-horizon-blue)]`
*   **Pending State:** `border-[#DDDCD5] bg-[#FFFFFF] text-[var(--color-slate)]`

### Popovers & Dropdowns
*   **Base style:** `border-[#D6D4CC] bg-[#FFFEFB]/95 p-2 text-[var(--color-obsidian)] shadow-xl backdrop-blur-md`
*   **Hover states in lists:** `hover:bg-[#F5F4EF] rounded-md`

---

## 4. Local Conventions (read before touching styles)

The local Svelte build carries a second, older design system alongside the Manus
one. Three conventions keep them from fighting each other.

### A. Two token namespaces, on purpose
*   `--m-color-*` in `frontend/src/app.css` holds the Manus palette verbatim.
    Ported markup uses these, so it renders identically regardless of theme.
*   `--color-*` in `frontend/src/css/design-system.css` is the legacy namespace.
    The names are unchanged (and confusingly inverted: legacy `--color-obsidian`
    is the page *ground*, `--color-slate-bright` is the *ink*), but the values
    are now the Manus palette, so legacy pages inherit the Manus look without a
    markup rewrite.

Never merge the two namespaces. The legacy names carry opposite meanings.

### B. Do not shadow Tailwind's theme variables
Tailwind v4 utilities resolve through its own custom properties, so any unlayered
`:root` declaration of the same name silently overrides them. The legacy file
used to redefine `--radius-xs/sm/md/lg`, `--shadow-sm/md/lg` and `--font-mono`,
which quietly made every `rounded-lg`, `shadow-sm` and `font-mono` in the ported
Manus markup wrong. These now live under a `--fio-` prefix
(`--fio-radius-lg`, `--fio-shadow-sm`, `--fio-font-mono`).

Before adding a token to `design-system.css`, check it against Tailwind's theme
namespaces (`--color-*`, `--font-*`, `--text-*`, `--radius-*`, `--shadow-*`,
`--spacing`, `--container-*`, `--tracking-*`, `--leading-*`, `--blur-*`). If it
collides, prefix it with `--fio-`.

Tailwind is compiled by `@tailwindcss/vite` from `frontend/src/app.css`. Do not
paste generated Tailwind output into that file: it goes stale the moment anyone
writes a new utility class.

### C. Shell versus landing page
`App.svelte` mirrors Manus's split between `Home.tsx` (standalone) and
`FiosraAppShell.tsx` (everything else):
*   Route `/` renders full-bleed with no app header, no viewport padding and no
    design assistant. `Home.svelte` supplies its own sticky header and
    `InstitutionalFooter variant="public"`.
*   Every other route gets `AppHeader`, the padded
    `max-w-6xl mx-auto px-4 sm:px-6 py-8` viewport, `InstitutionalFooter
    variant="application"`, and `FloatingFiosraEntry` on `/student/*`.

The viewport is a column flex container, so a page root that uses `mx-auto` must
also set `w-full` or the auto margins will stop it stretching.

### D. Light is the default
The Manus build is light only (`ThemeProvider switchable={false}`). The local
bootstrap in `frontend/index.html` no longer consults
`prefers-color-scheme`; dark is reachable only by setting `fiosra_theme` to
`dark` in localStorage, and no UI exposes that today. Ported Manus markup pins
the `--m-color-*` values and stays light either way.

---

## Next Steps for Migration
1.  **Done:** Manus palette, app shell, landing page, footers and the legacy
    palette remap. See section 4 for the conventions they rely on.
2.  **Remaining:** the legacy routes (`CourseStudio`, `AssignmentDesigner`,
    `StudentWorkspace`, `StudentTimeline/Trace/Sources`, `StudioReview`,
    `CohortDiagnostics`, `KnowledgeGraph`) inherit the Manus palette but still
    use their own markup and spacing. Port them page by page against their Manus
    counterparts where one exists.
3.  **Port Shadcn UI:** If you were using Shadcn for React, consider using [shadcn-svelte](https://shadcn-svelte.com/) to quickly port over primitives like Dialogs, Popovers, and Buttons while maintaining the extracted design tokens.
