# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Etkinlik Platformu
**Generated:** 2026-11-28 02:35:44
**Category:** Research Lab / University Department
**Token files:** `tokens.json` (W3C Design Tokens Community Group JSON).
**CSS variables:** `tokens.css` (`:root` custom properties).
Token files are master-level only; `--page` overrides do not emit tokens.
**Design Dials:** Density 5/10 (Standard)

---

## Project Adaptations (take precedence over everything below)

These come from the project prompt (section 8) and win over generated content:

1. **Tokens only.** Components use the CSS variables from `tokens.css` through the Tailwind theme. The raw hex values in the component specs below are illustrative; never copy them into components.
2. **Native HTML first.** Modals are `<dialog>`, disclosures use the popover API, forms use native validation. shadcn/ui only when no native equivalent exists.
3. **Motion.** Animate only `transform` and `opacity` (never `transition: all`, width, height or shadow), 150–300 ms, and disable non-essential motion under `prefers-reduced-motion: reduce`. No GSAP.
4. **Accessibility target is WCAG 2.2 AA.** Touch targets ≥ 44×44 px, body text 16 px, visible focus ring (`--color-ring`, 2px + offset), errors shown next to the field, labels never placeholder-only, charts accompanied by a data table.
5. **Layout.** Mobile first (375 → 768 → 1024 → 1440), no horizontal scroll, bottom navigation ≤ 5 items on student screens. The generated "Portfolio Grid" page pattern does not apply; pages follow their own `pages/*.md` files.
6. **Icons.** SVG only (Lucide style, 24px grid, `aria-hidden` when decorative). No emoji.
7. **Hover is an enhancement.** Card hover lift must not shift layout; every action is reachable by keyboard and touch.

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#1E3A5F` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#2563EB` | `--color-secondary` |
| On Secondary | `#FFFFFF` | `--color-on-secondary` |
| Accent/CTA | `#A16207` | `--color-accent` |
| On Accent/CTA | `#FFFFFF` | `--color-on-accent` |
| Background | `#F8FAFC` | `--color-background` |
| Foreground | `#0F172A` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#0F172A` | `--color-card-foreground` |
| Muted | `#E9EEF5` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border (decorative) | `#CBD5E1` | `--color-border` |
| Input Border | `#64748B` | `--color-input-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#1E3A5F` | `--color-ring` |

**Color Notes:** Institutional navy + research accent. All text pairs ≥ 4.5:1 (checked); `--color-border` is 1.48:1 on white, so form controls and meaningful boundaries use `--color-input-border` (4.76:1, WCAG 1.4.11).

### Typography

- **Heading Font:** Plus Jakarta Sans (600–700)
- **Body Font:** Plus Jakarta Sans (400–500), 16px, line-height 1.5
- **Mood:** friendly, modern, clean, approachable, professional
- **Source:** ui-ux-pro-max `--domain typography` "Friendly SaaS" pairing (replaces the generated EB Garamond + Crimson Text; serif body text reads poorly at 16px on phones).
- **Delivery:** self-hosted via `@fontsource-variable/plus-jakarta-sans` (Latin + Latin Extended for Turkish). **No Google Fonts / external font service** (CSP).

### Spacing Variables

*Density: 5/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #A16207;
  color: #FFFFFF;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #1E3A5F;
  border: 2px solid #1E3A5F;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #1E3A5F;
  outline: none;
  box-shadow: 0 0 0 3px #1E3A5F20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Swiss Modernism 2.0

**Keywords:** Grid system, Helvetica, modular, asymmetric, international style, rational, clean, mathematical spacing

**Best For:** Corporate sites, architecture, editorial, SaaS, museums, professional services, documentation

**Key Effects:** display: grid, grid-template-columns: repeat(12 1fr), gap: 1rem, mathematical ratios, clear hierarchy

### Page Pattern

**Pattern Name:** Portfolio Grid

- **Conversion Strategy:** Visuals first. Filter by category. Fast loading essential.
- **CTA Placement:** Project Card Hover + Footer Contact
- **Section Order:** Hero (Name/Role) > Project Grid (Masonry) > About/Philosophy > Contact

---

## Anti-Patterns (Do NOT Use)

- ❌ Low hierarchy
- ❌ no publication filtering
- ❌ cluttered visuals

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
