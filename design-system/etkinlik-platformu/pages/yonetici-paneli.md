# Yonetici Paneli Page Overrides

> **PROJECT:** Etkinlik Platformu
> **Generated:** 2026-11-28 02:35:44
> **Page Type:** Admin dashboard (analytics, management) — density 8/10

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px
- **Layout:** Responsive grid; KPI tiles in a row, charts below, tables full width.
- **Loading:** admin panel and Recharts are a separate lazy chunk.

### Spacing Overrides

*Density: 8/10 — Dense / Dashboard.* Apply inside the admin panel scope (e.g. `[data-density="dense"]`), not globally:

| Token | Value |
|-------|-------|
| `--space-xs` | `2px` |
| `--space-sm` | `4px` |
| `--space-md` | `8px` |
| `--space-lg` | `12px` |
| `--space-xl` | `16px` |
| `--space-2xl` | `24px` |
| `--space-3xl` | `32px` |

Touch targets stay ≥ 44×44 px and body text stays 16 px even at this density; only gaps and padding shrink.

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- No overrides — use Master colors

### Component Overrides

- No overrides — use Master component specs

---

## Page-Specific Components

- **Charts (Recharts):** every chart has an adjacent, keyboard-reachable data table; meaning never relies on color alone (labels/patterns).
- **Data tables:** wrap in an `overflow-x-auto` container on small screens (ui-ux-pro-max: Table Handling); support multi-select + bulk actions where admins act on many rows (ui-ux-pro-max: Bulk Actions).

---

## Recommendations

- Refer to MASTER.md for all design rules
- Add specific overrides as needed for this page
