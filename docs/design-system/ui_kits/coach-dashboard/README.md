# Coach dashboard UI kit

Mirrors `artifacts/andes-ia/src/pages/DashboardPage.tsx` — the largest file in the codebase. The kit recreates the **roster tab** with the **training queue** docked on the right, plus an **office hours** card and the closing **"All else, quiet."** empty state.

## Anatomy

1. **Sticky nav** — Logo + wordmark + crumb + search field + "Add athlete" button + coach avatar. `--linen` background with 1px bottom rule.
2. **Tabs** — `Roster · Training queue · Plans · AI Voice · Office hours · Settings`. Mono uppercase, terracotta underline on active tab.
3. **Greeting band** — Italic-serif greeting + 3 KPI tiles (Athletes / In queue / This week %). Numerals in Cormorant.
4. **Roster column (left)** — `tessera` athlete cards. Each card:
   - 44px tinted avatar
   - Name (Cormorant 19px) + meta line (mono uppercase): `Sport · Phase · Week · Age`
   - Status chip (`pending` / `caught up` / `tapering` / `missed`)
   - 7-day week strip with status-coded tiles
   - Italic-serif quote with a left ochre accent rule
5. **Queue panel (right)** — `ca-panel` plate with stacked `item`s:
   - Athlete avatar + name + age-out timestamp ("2m ago")
   - The athlete's question in body text
   - "Suggested reply" mono eyebrow + drafted text on a `parchment-2` plate
   - Approve & send / Edit row
6. **Office-hours card** — Today's call + next free slot.
7. **Empty-state ornament** — `◆ ◆ ◆` + "All else, quiet."

## Real building blocks (all from production)

The codebase factors these as `Portrait`, `WeekStrip`, `AthleteCard`, `KpiTile`, `QueueView`, `Greeting`. We've inlined the markup but the structure and copy match.

## Things omitted (out of scope)

- AI Voice tab (voice cloning UI) — placeholder tab only.
- Plans editor — placeholder tab only.
- Office hours full calendar.
- Settings.

These are real surfaces in the codebase, but recreating them adds little signal beyond what the roster + queue already establishes.
