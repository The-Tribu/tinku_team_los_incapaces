# Design System Strategy: The Radiant Horizon

## 1. Overview & Creative North Star
**Creative North Star: "The Radiant Horizon"**
The SunHub experience must transcend the utility of a "solar dashboard" to become a premium lifestyle companion. We are moving away from the industrial, operations-heavy aesthetic of energy management. Instead, we embrace an **Editorial Solar** approach—one that feels as light and life-giving as the sun itself. 

By leveraging intentional asymmetry, oversized "pill" geometries, and a "High-Contrast/Soft-Surface" duality, we create a UI that breathes. This design system treats information not as data to be managed, but as a story of sustainability and positivity told through a Colombian lens: vibrant, warm, and exceptionally clear.

---

## 2. Colors: The Palette of Light
We utilize a sophisticated Material 3-based palette that grounds the energetic Primary Green and Accent Yellow within a series of organic, "off-white" surfaces.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders to define sections. We define space through "Tonal Shifts." A card does not sit *inside* a border; it exists because its surface (`surface-container-low`) is subtly different from the background (`surface`). This creates a high-end, seamless feel that mimics natural light falling on physical objects.

### Surface Hierarchy & Nesting
*   **Base Layer:** `surface` (#f4fcf0) – The canvas.
*   **Sectioning:** Use `surface-container-low` (#eff6ea) for large layout blocks.
*   **Interactive Cards:** Use `surface-container-lowest` (#ffffff) to make actionable items "pop" against the slightly darker background.
*   **Nesting:** To create focus within a card, use `surface-container-high` (#e3eadf) for inset elements like data chips or search bars.

### Signature Textures & Glassmorphism
*   **The Sun-Drenched Gradient:** For primary CTAs and Hero sections, do not use flat colors. Use a linear gradient from `primary` (#006b2c) to `primary_container` (#00873a) at a 135° angle.
*   **Atmospheric Glass:** For floating navigation bars or weather alerts (Sky Blue), use a semi-transparent `surface_bright` with a 20px backdrop-blur. This "frosted glass" effect ensures the app feels integrated with the user's scroll depth.

---

## 3. Typography: Editorial Authority
The type system creates a rhythmic flow between the geometric friendliness of Plus Jakarta Sans and the clinical precision of Inter.

*   **Display & Headlines (Plus Jakarta Sans):** These are our "Voice." Use `display-lg` for daily energy totals. The oversized nature of these headings creates the "Editorial" look.
    *   *Tone:* Bold, optimistic, and welcoming.
*   **Titles & Body (Inter):** These are our "Information." Inter provides maximum readability for technical details and instructional text.
    *   *Tone:* Professional, neutral, and clear.

**Language Note (Spanish - Colombia):** 
Use "Tú" for a friendly, consumer-grade relationship. 
*Example:* Instead of "Consumo de Energía," use "Tu energía hoy."

---

## 4. Elevation & Depth: Tonal Layering
We reject the "drop shadow" defaults of the early web. Depth in this system is an atmospheric quality.

*   **The Layering Principle:** Stack `surface-container` tiers. A `surface-container-lowest` element (White) placed on a `surface` (Pale Green-White) creates a natural lift that feels sophisticated and calm.
*   **Ambient Shadows:** If a floating element (like a FAB) requires a shadow, use a custom shadow: `0px 12px 32px rgba(23, 29, 22, 0.06)`. The shadow color is derived from `on-surface`, never pure black.
*   **The "Ghost Border":** For high-density data areas where separation is vital, use the `outline_variant` token at **15% opacity**. It should be felt, not seen.
*   **Large Geometry:** All containers must use the `xl` (2rem/32px) or `lg` (2rem/20px) roundedness scale. This softness removes the "industrial" edge of the solar sector.

---

## 5. Components

### Buttons (Acción Principal)
*   **Primary:** Gradient (Primary to Primary-Container), `xl` rounded corners, `title-md` Inter (Medium).
*   **Secondary:** `surface-container-highest` background with `on-surface` text. No border.
*   **Tertiary:** Transparent background, `primary` text, with a 4px bottom-accent bar on active states.

### Energy Cards (Tarjetas de Energía)
Never use a divider line. Use a `surface-container-lowest` card with a 32px (xl) corner radius. Internal sections within the card should be separated by 24px of vertical whitespace or a subtle background shift to `surface-container-high`.

### Weather Chips (Clima)
Utilize the Sky Blue `tertiary_container` for weather-related alerts. Use Glassmorphism (Backdrop blur) when these chips overlay photography or maps.

### Input Fields (Entradas de Texto)
Avoid the "box" look. Use a `surface-container-low` background with a `none` border. On focus, transition the background to `surface-container-lowest` and add a 2px `primary` "Ghost Border" at 30% opacity.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use extreme whitespace. If you think there’s enough room, add 8px more.
*   **Do** use `secondary_container` (Yellow) sparingly as a "highlighter" for success states or peak sun hours.
*   **Do** ensure all Colombian Spanish phrasing is warm (e.g., using "¡Excelente!" instead of "Completado").
*   **Do** use asymmetrical layouts for Hero images to break the "grid" feel.

### Don't:
*   **Don't** use 1px solid borders. This is the quickest way to make the app look "standard."
*   **Don't** use pure black (#000000) for text. Always use `on_surface` (#171d16).
*   **Don't** use small corner radii. If it’s not 20px or more, it’s not part of this system.
*   **Don't** clutter the screen with operations data. Hide technical specs behind "Ver más" (Show more) progressive disclosure.

---

*Director's Final Note: This design system is about the feeling of a bright morning. Every tap should feel like an interaction with a high-end concierge, not a utility company. Keep it light, keep it rounded, and let the typography do the heavy lifting.*