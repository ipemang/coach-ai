# Auth UI kit

Two screens, both lifted from `LoginPage.tsx` / `SignupPage.tsx` / `OnboardingPage.tsx`.

## Files

| File | Screen | Notes |
|---|---|---|
| `index.html` | Sign in / sign up | Split layout (`grid-template-columns: 1fr 480px`). Brand panel uses `mosaic-bg` and the decorative 4×4 mosaic SVG. Form card on the linen panel with mode tabs (Sign in / Create account). |
| `onboarding.html` | Coach onboarding step 02 (Sports) | 4-segment progress strip (done · active · pending · pending), then a `.ca-panel` plate with 6 sport chips. The other 3 steps (Profile · Athletes · Confirm) reuse the same shell. |

## Key building blocks

- **Split layout** — `.ca-login-split` from `colors_and_type.css`. Below 800px the brand panel hides.
- **Brand panel** — `mosaic-bg` (parchment + radial washes + 28×28 mosaic), the decorative mosaic SVG below the lede, and an `Andes.IA` wordmark with terracotta-deep dot.
- **Form card** — Plain content on the linen panel (no extra border). Includes:
  - Two-segment mode tab strip (Sign in / Create account), styled like a filled segmented control.
  - "Continue with Google" button (full-width, 4-color "G" SVG).
  - Mono "OR" divider.
  - Two `.ca-input` fields with mono labels.
  - Primary "Sign in →" button.
  - Footnote with terracotta link.
- **Onboarding strip** — 4 segments. Status colors map to system: done = aegean-wash, active = ochre-soft, pending = linen.
- **Sport chips** — `.sport` cards. Selected state uses aegean-wash + aegean-deep border + matching icon color.

## Real copy

- "Welcome back." (login)
- "Welcome, coach." (onboarding)
- "Your athletes are waiting on you. Andes is waiting on you, too — quietly, at the kitchen table." (italic-serif lede)
- Step labels: Profile · Sports · Athletes · Confirm
