# Inspirova public site design

The public homepage (`src/inspirova.html`) uses one visual system, "the honest quote":
the page reads like a clean, itemised estimate from a trade business. Keep new public
sections inside it. The admin app has its own look and is not covered here.

## Tokens (`:root` in `src/inspirova.html`)

| Token | Value | Use |
|---|---|---|
| `--desk` | `#EDF0F5` | Page ground |
| `--sheet` | `#FFFFFF` | Documents: hero statement, terms box, estimate, dialogs |
| `--ink` | `#101B3B` | All primary text, rules that open a list |
| `--ink-2` | `#4A536E` | Secondary text |
| `--rule` | `#D3D9E4` | Hairlines and dotted leaders |
| `--signal` | `#1B66D2` | Primary buttons, totals, focus, selected states |
| `--field` | `#12306B` | The single deep-blue band (results) |
| `--ok` / `--warn` | `#137547` / `#B3261E` | Form status text (`--violet-bright` and `--coral` alias these for the existing scripts) |

Light only, chosen for the use scene: owners checking the site in daylight between jobs.

## Type

- Display: **Archivo**, `font-stretch: 118%`, weight 800–900 (wide sign-writing lettering).
- Body and figures: **Public Sans** 400–700, `tabular-nums` wherever prices or figures line up.
- Two families only. No monospace labels.

## Components

- **Sheet:** white, 6px radius, one soft shadow (`--shadow`). Only for documents, never as a grid of cards.
- **Ledger line:** label, dotted leader (`::after`, flex 1), value at the right.
- **Totals:** a 3px double rule above the total row (the accountant's convention): hero statement and the "Monthly total" row of the price breakdown.
- **Lists:** open with a 1px `--ink` rule, rows separated by `--rule` hairlines.
- **Buttons:** one primary (`.btn-primary`, signal blue) and one quiet outline (`.btn-quiet`); 6px radius; no arrows in labels.
- **Proof:** real client screenshots only, framed in a white mat on the blue band.

## Rules

- No eyebrow labels above headings, no all-caps or tracked labels, no middle-dot meta strings.
- No gradient text, no single highlighted word in a heading, no emoji or text glyphs as icons (inline SVG, 2px stroke).
- No rows of big-number stat tiles; figures live in sentences, case studies and the estimate.
- Every figure, client result and quote must come from the client's own material; never invent one.
- One motion moment: the hero bars growing on load. Everything is visible without scripts; reduced motion turns it off.

## Wiring the design must keep

- Script IDs for the calculator, quote form, contact dialog and forms, plus the classes the calculator generates (`.bundle`, `.b-*`, `.svc`, `.svc-*`, `.on`).
- `#contact` is a dialog toggled with the `hidden` attribute; `#timeline .step` is read by the step script; `#menuBtn` drives the phone menu.
- Case screenshots arrive through `__CASE_DTC__`, `__CASE_LEADS__`, `__CASE_SHOPIFY__` and `__CLIENT_MSG__`, replaced in `src/routes/index.tsx`.
- The homepage iframe needs `allow-forms` in its sandbox, or the browser blocks the contact form's submit event.
