# Athlete Dashboard

Static prototype of the Andes.IA athlete dashboard. Self-contained — open `Athlete Dashboard.html` in any modern browser.

## Drop-in path

Place this folder at:

```
frontend/app/athlete/dashboard/
```

## Files

- **Athlete Dashboard.html** — entry point, wires everything together
- **styles.css** — design tokens (mosaic palette, type scale, components)
- **data.jsx** — sample triathlon data: `ATHLETE`, `COACH`, workouts, season blocks, reports
- **components.jsx** — `TopNav`, `UserMenu`, `Confetti`, `Toast`, shared primitives + `useAppState` (localStorage persistence)
- **page-today.jsx** — Today snapshot, Week mosaic, Workout detail drawer, Biometrics rail
- **page-season.jsx** — 24-week season grid + draggable periodization blocks + methodology
- **page-profile.jsx** — Reports (with expand + previous reports), Coach (WhatsApp link), Memory log, Files
- **page-settings.jsx** — Profile, Coaches (cadence picker), Apps & Devices, Zones, Equipment (Add bike/shoes/pool), Layout, Notifications, Export, Help, Privacy, Terms
- **tweaks-panel.jsx** — design-time tweak controls

## State

Athlete actions (comments, voice memos, reschedules, completions, block reorders) persist to `localStorage` under the key `andes:state` and append to a Memory log feed.

## Notes

This is a design prototype — replace mock data in `data.jsx` with API calls when wiring to Supabase / coach.ai.
