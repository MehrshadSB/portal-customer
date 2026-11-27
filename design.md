# Design: Automotive Coatings B2B Platform

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System
- Genre: modern-minimal
- Shape of the first page: app screen (Admin: collapsible sidebar command rail with live operations ledger; Portal: single-line workspace top bar with production order ledger)
- Theme: Coral (deal 3/3, seed automotive-coatings-chemical-manufacturing-e55f·50cc628f·2026-11-27·r0)
- Axes: light/grotesk-sans/warm · posture: restrained

## Tokens
`packages/ui/src/styles/tokens.css` is the source of truth. The roles:
```css
:root {
  --color-paper: oklch(97% 0.006 55);  --color-paper-2: oklch(94.5% 0.007 55);  --color-paper-3: oklch(91.5% 0.009 55);
  --color-cotton: oklch(98.8% 0.0045 80);  --color-desk: oklch(94.3% 0.008 64);
  --color-ink: oklch(21% 0.012 38);  --color-ink-2: oklch(29% 0.013 40);  --color-muted: oklch(46% 0.013 45);
  --color-rule: oklch(87% 0.009 55);  --color-rule-2: oklch(80% 0.011 55);
  --color-board: oklch(22% 0.011 40);  --color-board-type: oklch(96.5% 0.006 70);
  --color-accent: oklch(74% 0.125 30);  --color-accent-ink: oklch(21% 0.012 38);  --color-accent-2: oklch(52% 0.165 29);  --color-focus: oklch(52% 0.17 30);
  --font-display: "Vazirmatn Variable", "Plus Jakarta Sans Variable", ui-sans-serif, system-ui, sans-serif;
  --font-body: var(--font-display);
  --font-outlier: "JetBrains Mono Variable", ui-monospace, monospace;
  --radius-card: 8px;  --radius-input: 6px;  --radius-pill: 999px;  --rule-hair: 1px;
  --shadow-card: 0 1px 2px oklch(20% 0.01 35 / 0.05);
}
```
The 1.2 app type scale, 4pt spacing scale, easings, durations, and workflow signal tokens live in `packages/ui/src/styles/tokens.css`.

## Controls
- Primary: `--color-board` fill with `--color-board-type` ink · 8px radius (`--radius-card`) · 36px height (`sm` 32px, `lg` 40px, 44px touch target)
- Secondary: `--color-cotton` surface with 1px `--color-rule` border and subtle `--shadow-card` · same radius and height
- Inputs: `--color-cotton` surface with 1px `--color-muted` border, 6px radius (`--radius-input`), instant inset `--color-focus` outline

## Motion
- Character: calm (state-only transitions at `--dur-micro` 120ms and `--dur-short` 220ms; no entrance orchestration; under reduced motion everything resolves at once).

## Exports
`packages/ui/src/styles/tokens.css` and `packages/ui/src/styles/base.css`, consumed by `apps/admin/src/app/globals.css` and `apps/portal/src/app/globals.css`.
