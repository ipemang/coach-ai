# Coach.AI / Andes.IA — Design System

**One-line:** A B2B SaaS for endurance coaches — AI assistant that drafts WhatsApp replies, manages athlete rosters, and personalises training plans, while letting the coach stay in the driver's seat.

> Bloomberg terminal meets running watch. Data-dense but calm.
> Classical sophistication meets warm approachability.

---

## What's in here

This folder is a **design system** for the product known internally as both **Coach.AI** and **Andes.IA** — they are the same brand. Use `Andes.IA` as the wordmark; `Coach.AI` is the company-level / domain handle. The design system covers:

- **Visual foundations** — the parchment + aegean + terracotta palette, the Cormorant / Work Sans / JetBrains Mono type stack, mosaic / tessera background motifs, hairline rules, near-square corners.
- **Content fundamentals** — the calm, italic-serif voice ("listen first, change the plan second").
- **UI kits** for each of the three real surfaces: marketing landing, coach dashboard (web app), athlete dashboard (mobile-first web).
- **Re-usable assets** — logo SVG, mosaic pattern, OG image.

The goal is that a designer or agent can prototype, slide, or ship inside this brand without re-deriving its visual vocabulary every time.

---

## Products represented

| Surface | Audience | Tone | Density |
|---|---|---|---|
| **Marketing** (`/`) | Endurance coaches researching tools | Confident, italic, calm | Low — hero + 3-step + testimonials + pricing |
| **Auth** (`/login`, `/signup`, `/onboarding`) | Coaches & athletes signing in | Brand-forward, intimate | Split-screen: brand panel left, form right |
| **Coach dashboard** (`/dashboard`) | Coaches managing 10–30 athletes | Bloomberg-terminal calm | High — roster cards, weekly tiles, queue, AI voice, plans |
| **Athlete app** (`/athlete/dashboard`) | Athletes following plans, replying to coach | Warm, approachable | Medium, mobile-first (375 design target) |

---

## Sources used to build this

- **Codebase** — `ipemang/coach-ai` on GitHub. The frontend lives at `artifacts/andes-ia/` (React + Vite + Tailwind v4 + shadcn/ui "New York", Wouter routing, Supabase auth). Key references read while building this system:
  - `artifacts/andes-ia/src/index.css` — full token sheet + utility classes (the source of truth for colors, type, components)
  - `artifacts/andes-ia/src/pages/LandingPage.tsx` — marketing copy, hero pattern, pricing
  - `artifacts/andes-ia/src/pages/LoginPage.tsx` / `SignupPage.tsx` — split-screen auth, mosaic logo
  - `artifacts/andes-ia/src/pages/DashboardPage.tsx` — coach dashboard (large file, key building blocks: `Portrait`, `WeekStrip`, `AthleteCard`, `KpiTile`, `QueueView`, `Greeting`)
  - `artifacts/andes-ia/src/pages/AthleteDashboardPage.tsx` — athlete view, weekly plan tiles, workout messages
  - `artifacts/andes-ia/src/pages/OnboardingPage.tsx` — 4-step coach wizard
- **Backend (live)** — Python FastAPI on Railway (`coach-ai-production-a5aa.up.railway.app`). Not used here, but routes inform what each surface displays.
- **Stack** — pnpm workspace, Node 24, TypeScript 5.9, React 19, Vite 7, Tailwind v4, Radix, Supabase SSR, Lucide-react icons, Framer Motion.

The reader of this README is **not assumed** to have GitHub access — every claim above is mirrored in the files in this folder. The original repo is referenced only as provenance.

---

## Index — what's at the root

| File / Folder | What it is |
|---|---|
| `README.md` | This file. Brand context, content rules, visual rules, iconography, manifest. |
| `SKILL.md` | Front-matter skill manifest so this folder works as an Agent Skill in Claude Code. |
| `colors_and_type.css` | Full token sheet — OKLCH palette, type stack, semantic vars, utility classes (`.ca-*`). Drop-in. |
| `assets/` | Logo SVG, mosaic pattern, OG image. Copy what you need into your prototype. |
| `fonts/` | (Empty by intent — fonts are loaded from Google Fonts. See "Type" below.) |
| `preview/` | Design-system cards rendered in the Design System tab. One file per concept. |
| `ui_kits/marketing/` | Marketing landing page kit (hero, features, pricing, testimonials, footer). |
| `ui_kits/auth/` | Auth split-screen — login + signup + 4-step onboarding. |
| `ui_kits/coach-dashboard/` | Web app for coaches: roster cards, queue, week strips, AI voice, office hours. |
| `ui_kits/athlete-app/` | Mobile-first athlete view: today card, weekly plan, workout detail, message back to coach. |

> **Slides** are intentionally **not** included. No deck template was provided, and the brief explicitly says: do not invent slides if none were given.

---

## CONTENT FUNDAMENTALS

The voice is **calm, declarative, and slightly literary**. It assumes the coach is busy and intelligent. It does not sell hard.

### Tone

- **Calm over excited.** The product saves coaches hours; it doesn't shout about it. Compare: ❌ "Save 10+ hours every week!" → ✅ "Andes.IA helps endurance coaches save hours each week on training prescription."
- **Italic-serif asides.** Many subtitles, captions, and quotes are set in *Cormorant Garamond italic* — almost like a marginal note in a coaching journal. The body next to a stat block reads "*Listen first. Change the plan second.*" Use italic when the line is reflective, declarative, or atmospheric. Use upright Work Sans when the line carries instructions or a real choice.
- **You, never we.** Copy addresses the coach as `you`. The product never says "we recommend" — it presents drafts; the coach decides. "**You stay the coach.**"
- **Athletes are named.** The hero card preview shows "Patrick Torres · Build phase · Wk 8" — not "John Doe". Wherever a roster placeholder is needed, use plausible coaching names (Patrick Torres, Marcos V., Sara L., Daniel R., Felipe Deidan).

### Casing

- **Eyebrows / chips / labels** are `UPPERCASE` set in JetBrains Mono at ~10.5px with 0.18em letter-spacing. Examples: `FOR ENDURANCE COACHES`, `COACH PORTAL`, `DAILY INTENTION`, `1 PENDING`.
- **Display headings** are sentence case in Cormorant Garamond. Examples: "Your athletes. Your voice. Your AI.", "Welcome back.", "Built for real coaching".
- **Body / UI labels** are sentence case in Work Sans.
- Title Case only appears in proper nouns ("Build phase", "Wk 8", "Garmin", "WHOOP", "Oura").

### Punctuation & glyphs

- **Em-dashes** are common — they fit the literary voice. ("Andes.IA helps endurance coaches save hours each week — without losing your personal touch with each athlete.")
- **Curly quotes** for athlete quotes (`"…"`), and italic-serif inside a left-border ("`border-left: 2px solid var(--rule); padding-left: 16px`").
- **Arrow `→`** is the primary CTA glyph: "Get started →", "Sign in →", "Create one →". No emoji arrows.
- **Decorative ornament** `◆ ◆ ◆` appears in empty states ("All caught up. Nothing waiting for your reply.") — set in Cormorant.
- **Middle-dots `·`** separate small bits of metadata: `Triathlon coach · 18 athletes`, `COACH · ATHLETE · PURPOSE`.

### Emoji

Almost never. The only emoji-adjacent glyph in production is `⏱` on the "session expired" banner (and even that is borderline). **Do not add emoji to copy.** When you need to mark status, use a colored chip or the chip's small SVG glyph (heart/moon/flame in stat cells), not 💪 or 🏃.

### Headlines (real examples to model on)

- "Your athletes. Your voice. Your AI."
- "The AI that knows your voice."
- "Built for real coaching."
- "Welcome back."
- "Welcome, coach."
- "Listen first. Change the plan second."
- "All caught up. Nothing waiting for your reply."
- "Here is the day, quietly."

The pattern: **short, period-terminated, often three beats, often italic.** Three nouns separated by periods is a recurring rhythm.

### Microcopy (real examples)

- Eyebrow: `FOR ENDURANCE COACHES`, `HOW IT WORKS`, `COACHES SAY`, `PRICING`, `COACH PORTAL`
- Step labels: `01 Athlete checks in` / `02 AI drafts a reply` / `03 You approve and send`
- Status chips: `1 PENDING`, `BUILD PHASE · WK 8`, `DONE`, `MISSED`, `PLANNED`, `TODAY`
- Footer line: `COACH · ATHLETE · PURPOSE`
- Athlete quote prefix: `Suggested reply` (mono eyebrow, 9px)

### What to avoid

- Marketing-y intensifiers: `revolutionary`, `game-changing`, `unleash`, `supercharge`.
- Generic SaaS verbs without object: `streamline`, `optimise`, `empower`.
- Calling the AI an "agent" or "assistant" loudly — it's "Andes.IA" or just "the draft".
- Big stats with no context. (`10x faster!` ❌ / `2 hours a day` in a coach quote ✅.)
- Emoji clusters or icon trains.

---

## VISUAL FOUNDATIONS

The brand's visual posture is **classical, warm, and quietly geometric** — think Roman mosaics on parchment, with the color logic of a running watch. It is *not* a typical AI-app aesthetic.

### Colors

OKLCH-only palette, all light-mode (no dark mode shipped). Five hue families:

| Family | Role | Tokens |
|---|---|---|
| **Parchment / linen** | Background — never pure white | `--parchment` (page), `--parchment-2`, `--linen` (cards), `--linen-deep` |
| **Ink** | Text — warm dark brown, never pure black | `--ink`, `--ink-soft`, `--ink-mute`, `--ink-faint` |
| **Aegean turquoise** | Primary accent — buttons, "done", links | `--aegean`, `--aegean-deep` (button fill), `--aegean-soft`, `--aegean-wash` |
| **Terracotta** | Secondary accent — alerts, missed, brand dot in `Andes.IA` | `--terracotta`, `--terracotta-deep`, `--terracotta-soft` |
| **Ochre / olive** | Supporting — "today" and "planned" | `--ochre`, `--ochre-soft`, `--olive`, `--olive-deep`, `--olive-soft`, `--olive-wash` |
| **Rule** | Hairlines & card borders | `--rule`, `--rule-soft` |

**Status color-coding (memorise):** `aegean = done` · `terracotta = missed` · `olive = planned` · `ochre = today`. This holds across both coach and athlete surfaces.

### Type

- **Display / headlines** — Cormorant Garamond, weights 400–600, with frequent use of italic 400/500. Letter-spacing tight (`-0.01em` to `-0.015em`), line-height tight (1.05–1.1).
- **Body / UI** — Work Sans, 400/500/600. Default size 13–14px in UI, 15–17px in marketing body.
- **Labels / chips / eyebrows** — JetBrains Mono, 10.5px, **uppercase**, `letter-spacing: 0.18em`, weight 500. This is the brand's signature small text.
- **Numerals** — When numbers are a thing (KPI tiles, readiness scores, prices), they are set in **Cormorant Garamond** with `font-feature-settings: "lnum", "tnum"`. They feel like masthead numerals, not dashboard numerals. This is a deliberate inversion.

Fonts ship from Google Fonts via the import in `colors_and_type.css`. **No local font files are bundled** — flagged in caveats below.

### Backgrounds & motifs

- **Parchment base** — `oklch(0.965 0.018 85)`. Always slightly warm. Never `#fff`.
- **Mosaic / tessera pattern** — A 28×28 SVG of overlapping diamonds and squares stroked at 0.5px in muted ochre, used as `mosaic-bg` on the auth brand panel and the marketing hero, plus an inner 60×60 square pattern on every card via `.tessera::before`. The pattern is **subtle** — opacity 0.18–0.35 — never at full strength.
- **Tinted radial washes** — Two corner radial gradients (terracotta @ 20/30%, aegean @ 80/70%) sit on top of the mosaic on hero/auth backgrounds. Very low alpha.
- **Decorative mosaic block** — A 4×4 grid of solid color squares (terracotta / aegean / ochre / olive) used as a brand panel hero on the auth screens. Each cell has its own opacity to create a "weathered" mosaic feel.
- **Fret border** — A repeating Greek-key SVG (`.ca-fret`) used sparingly as a section divider.
- **Ornament** — `◆ ◆ ◆` set in Cormorant 14px with `letter-spacing: 0.6em`, in `--rule` color. Used in empty states.

No photographic imagery. No 3D renders. No gradient hero backgrounds beyond the gentle parchment radials.

### Layout rules

- **Marketing** — Centered max-width 1200, 32px gutter, 72–80px section padding.
- **Auth** — `ca-login-split` is a CSS grid with `1fr 480px`. Brand panel (mosaic-bg) on the left, `--linen` form panel on the right with a `border-left: 1px solid var(--rule-soft)`. Below 800px, the brand panel hides; the form takes full width.
- **Dashboard** — Tabbed view, sticky nav, content max-width ~1280, large parchment chrome with cards laid on top.
- **Athlete app** — Mobile-first, 375–420 design width, single column, sticky bottom or top nav.
- **Sticky chrome** — Top nav is `position: sticky; top: 0; z-index: 30`, on `--linen` with a 1px bottom rule.

### Borders, radii, shadows

- **Border radius** is **2–4px**. Cards: 4px. Buttons, chips, pills: 2px. Avatars: 2px. **Never round-rect.** This is a deliberate counterpoint to the warmth of the palette — the brand reads "cool, classical, almost archaic" because of the squared corners.
- **Borders** are 1px in `--rule`. On hover, `--ink-mute`. Light dividers are 1px in `--rule-soft`.
- **Shadows** are exceptionally restrained. There are exactly two:
  - `--shadow-card`: `0 1px 0 oklch(1 0 0 / 0.5) inset, 0 2px 8px -4px oklch(0.3 0.05 60 / 0.18)` — used on `.tessera`.
  - `--shadow-panel`: `0 1px 0 oklch(1 0 0 / 0.6) inset, 0 6px 20px -12px oklch(0.3 0.05 60 / 0.25)` — used on `.ca-panel`.
  - Both include a 1px white inset top to give a subtle "lit from above" feel on the parchment. **Do not invent new shadow recipes.**
- **No glow, no neon, no inner shadow on inputs.**

### Animation & states

- **Entrance:** `.ca-rise` keyframe — 6px upward translate + opacity, 320ms ease-out. Applied to cards as they mount. There is no stagger; everything rises at once.
- **Transitions:** All interactive transitions are `all 160ms ease`. Buttons, tabs, chips, hover backgrounds.
- **Modal slide:** `slide-up` — 12px translate, opacity. Same easing.
- **Spin:** Stock 360deg spinner for loaders.
- **Hover (button)** — primary buttons darken slightly (`oklch(0.36 0.085 200)`); ghost / secondary buttons swap background to `--linen` and color to `--ink`. **No scale on hover.**
- **Press / active** — Inherits hover. **No active-state shrink** (the brand reads as still, not bouncy).
- **Disabled** — `opacity: 0.45` (buttons), `0.6` (form-spinning state). Cursor `not-allowed`.
- **Focus** — `:focus-visible { outline: 2px solid var(--aegean-deep); outline-offset: 2px; }` — universal, not per-component.

### Transparency & blur

- The product **does not use backdrop-blur**. Sticky nav is a solid `--linen` with a hairline.
- Modal backdrops are `oklch(0.2 0.02 60 / 0.5)` — a warm, slightly-translucent ink, **no blur**.
- The mosaic pattern is the only "translucent" treatment, and it sits over solid parchment.

### Imagery

- **Headshots:** None used. Every avatar is a 2-letter initial in Cormorant Garamond, on a tone-tinted square (`linen`, `aegean`, `terra`, `ochre`). Ratio 1:1, radius 2px, with a very subtle 12×12 stripe overlay pattern.
- **Product screenshots:** None. The hero "preview card" is a real component, rendered in markup.
- **Illustrations:** Only the **decorative mosaic block** (4×4 colored squares) and the **mosaic background pattern**. There are no people, no nature, no abstract blobs.
- **Color vibe:** Warm. Slightly desaturated. Never cool, never b&w, never high-contrast.

### Cards (`.tessera` / `.ca-panel`)

- Background: `--linen`
- Border: 1px `--rule`
- Radius: 4px
- Shadow: `--shadow-card` (panel) or `--shadow-panel` (login form)
- Inner: `.tessera::before` overlays a 60×60 square pattern at 0.18 opacity, 0.6 alpha. Children sit at `z-index: 1` above it.

### Buttons (`.ca-btn`)

- Padding `9px 16px`
- Border-radius `2px`
- Border `1px solid var(--rule)`
- Variants: default (parchment), `ca-btn-primary` (aegean-deep, light text), `ca-btn-terra` (terracotta), `ca-btn-ghost` (transparent, ink-soft text)
- Font: Work Sans 13px / 500 / `0.01em` letter-spacing.
- Always include `→` for forward primary actions.

### Chips (`.ca-chip`)

- Padding `3px 10px`
- Mono 10.5px / 0.08em letter-spacing
- Variants: default linen, `ca-chip-aegean`, `ca-chip-terra`, `ca-chip-ochre`, `ca-chip-olive`. Each variant uses the matching `*-soft` background and `*-deep` text.

### Spacing

There is no `--space-1`/`--space-2` scale in the source — spacing is hand-set, but it follows clear rhythms:

- **4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 28 / 32 / 48 / 56 / 64 / 72 / 80** are the values that actually appear in the codebase.
- Card padding usually `18px 20px` to `24px 28px`.
- Section padding usually `72px 32px` (marketing) or `48px 56px` (auth panel).

---

## ICONOGRAPHY

The codebase **does not use Lucide-react despite having it in dependencies**. Every icon in the production UI is a **hand-rolled inline SVG** drawn at 1.2–2px stroke weight on a 24×24 viewBox.

The icons live in `DashboardPage.tsx` as a `G` namespace: `G.Plus`, `G.Search`, `G.Check`, `G.Edit`, `G.X`, `G.Arrow`, `G.Sun`, `G.Column`, `G.Heart`, `G.Moon`, `G.Flame`, `G.Scroll`, `G.Mountain`. They are intentionally a touch hand-drawn — not perfectly geometric — which fits the warm, classical voice. **Match this stroke style if you add new icons.**

### Rules

- **Stroke weight 1.2–1.8px** (1.5 is the default; 1.2 for tiny 10–14px icons, 1.8 for chunky 14–22px).
- **`stroke="currentColor"` + `fill="none"`** for almost all glyphs — they take their color from the surrounding text. Exception: the brand-logo squares use solid fills.
- **Mono linecap / linejoin** — round implied by the rest of the brand (the source doesn't override defaults, which is `butt` for stroke and `miter` for joins; that's the look).
- **Sizes 10–22px.** No XL icons. No icon-only big circular buttons.

### Lucide as a fallback

If you need a glyph not in the hand-rolled set (e.g. share, settings, calendar), reach for **Lucide-react** (already in `package.json`) at `strokeWidth={1.5}`. Note: this is a substitution and the result will be slightly more geometric than the bespoke icons — flagged in caveats.

### Logo

The Andes.IA mark is a **3×3 mosaic of colored squares** inside a thin black-stroked frame. Square colors alternate terracotta / aegean-deep / terracotta in row 1, aegean-deep / ochre / aegean-deep in row 2, olive / terracotta / ochre in row 3. Each square has its own opacity (0.85–0.9) to give a hand-laid feel. See `assets/andes-logo.svg` and `assets/andes-mosaic-decorative.svg`. The wordmark always has the `.` in `Andes.IA` rendered in **terracotta-deep**.

### Emoji

**No.** See content fundamentals — the only emoji-adjacent glyph in production is `⏱` on the session-expired banner.

### Unicode

- `→` for "next / forward" CTAs
- `·` (middle dot) as a meta separator
- `✓` for feature lists in pricing tiles
- `◆` for the empty-state ornament (Cormorant)
- `×` for close buttons
