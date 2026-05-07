# Athlete app UI kit

Mobile-first web view for athletes. Mirrors `artifacts/andes-ia/src/pages/AthleteDashboardPage.tsx`. Designed at **420px** width (~iPhone 12 logical).

## Sections

1. **Top bar** — Logo + wordmark + athlete avatar.
2. **Greeting** — Date eyebrow + Cormorant greeting + italic-serif phase aside.
3. **Today's session** — `tessera` card with status chips, headline, prescription text, meta row (duration · distance · target pace), and a `Start session →` primary CTA.
4. **This week** — 7-day strip with status-coded tiles, each showing day letter + km.
5. **Coach note** — Linen card with `border-left: 3px solid var(--terracotta)` containing the coach's italic-serif reply, attribution avatar, age-out timestamp.
6. **Daily check-in** — 5-state "How did you feel today?" segmented control + free-text + voice-note button + "Send to Felipe →" primary.
7. **Bottom nav** — 4 tabs (Today / Plan / Coach / Me), mono uppercase labels, terracotta active.

## Status mapping (parity with coach view)

`done = aegean` · `missed = terracotta` · `today = ochre` · `planned = olive`. Same colors, same logic.

## Real copy

- "Morning, Patrick."
- Athlete quote: "Legs felt heavy on the long run today, but held target pace. Should I rest tomorrow?"
- Coach reply: "Heavy legs after a long run at target pace is a great sign — you're adapting…"

## Things omitted

- Session detail / live tracking
- Workout history
- Profile / settings tab
- Plan tab (placeholder only)

These tabs exist in the production app but the Today view captures the visual vocabulary.
