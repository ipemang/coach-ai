# Marketing UI kit

Single-page landing for **Andes.IA**, mirrored from `artifacts/andes-ia/src/pages/LandingPage.tsx`.

## Sections

1. **Sticky nav** — `--linen` background, 1px bottom rule. Logo + wordmark + 3 anchor links + sign-in + primary CTA.
2. **Hero** — split: copy left, "live preview" card right. Hero background uses two corner radial washes + the 28×28 mosaic SVG pattern.
3. **How it works** — 3 numbered cards (`01 / 02 / 03`) on a `--linen` plate.
4. **Coaches say** — 2 italic-serif blockquotes with initials avatars.
5. **Pricing** — 3 tiers; the middle tier is "featured" with `--aegean-deep` border and `--shadow-panel`.
6. **CTA strip** — sentinel "You stay the coach." with primary + ghost buttons.
7. **Footer** — small logo + `Coach · athlete · purpose` eyebrow + nav links.

## Components in use

- `.ca-btn`, `.ca-btn-primary`, `.ca-btn-ghost`
- `.ca-chip-terra` (live "1 pending" pill on preview card)
- `.ca-avatar` with `aegean` / `terra` / `ochre` tints
- `.ca-eyebrow` with terra / aegean / olive variants
- Inline `mosaic-bg` (gradient + 28×28 SVG)
- Inline `tessera`-style preview card (60×60 SVG overlay)

## Real copy used

- Hero headline: "Your athletes. Your voice. Your AI."
- Hero lede: "Andes.IA helps endurance coaches save hours each week on training prescription — without losing your personal touch with each athlete."
- Section title: "Built for real coaching"
- Testimonial title: "Listen first. Change the plan second."
- CTA: "You stay the coach."
- Pricing tier names: Starter / Coach (featured) / Studio
- Tagline: "Coach · athlete · purpose"

All copy lifted directly from the production landing page or its constituent style guide.
