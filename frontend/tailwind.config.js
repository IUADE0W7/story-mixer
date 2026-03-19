/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      /* ══ Semantic color tokens — wired to CSS variables ═══════════════════
         These replace hardcoded values throughout shadcn/ui primitives and
         allow Tailwind utilities (bg-primary, text-muted-foreground, etc.)
         to automatically reflect the laboratory palette.                     */
      colors: {
        /* Layout foundations */
        background: "var(--ink)",
        foreground:  "var(--cream)",

        /* Interactive: primary = teal */
        primary: {
          DEFAULT:    "var(--teal)",
          foreground: "var(--ink)",
        },

        /* Technical controls: secondary = amber */
        secondary: {
          DEFAULT:    "var(--surface-high)",
          foreground: "var(--cream)",
        },

        /* Destructive / error = rose-red */
        destructive: {
          DEFAULT:    "var(--rose)",
          foreground: "var(--cream)",
        },

        /* Muted text and surfaces */
        muted: {
          DEFAULT:    "var(--surface-high)",
          foreground: "var(--cream-muted)",
        },

        /* Accent hover surfaces */
        accent: {
          DEFAULT:    "var(--surface-high)",
          foreground: "var(--cream)",
        },

        /* Card / popover surfaces */
        card: {
          DEFAULT:    "var(--surface-raised)",
          foreground: "var(--cream)",
        },
        popover: {
          DEFAULT:    "var(--surface-raised)",
          foreground: "var(--cream)",
        },

        /* Structural tokens */
        border: "var(--border)",
        input:  "var(--border-bright)",
        ring:   "var(--teal)",

        /* ── LoreForge design-system tokens ────────────────────────────────
           Use as `bg-lf-ink`, `text-lf-teal`, `border-lf-amber`, etc.      */
        lf: {
          /* Surfaces */
          ink:             "var(--ink)",
          surface:         "var(--surface)",
          "surface-raised":"var(--surface-raised)",
          "surface-high":  "var(--surface-high)",
          border:          "var(--border)",
          "border-bright": "var(--border-bright)",
          /* Typography */
          cream:           "var(--cream)",
          "cream-muted":   "var(--cream-muted)",
          "cream-faint":   "var(--cream-faint)",
          /* Accents */
          teal:            "var(--teal)",
          "teal-dim":      "var(--teal-dim)",
          amber:           "var(--amber)",
          "amber-dim":     "var(--amber-dim)",
          /* Semantic */
          rose:            "var(--rose)",
          "rose-dim":      "var(--rose-dim)",
          emerald:         "var(--emerald)",
          "emerald-dim":   "var(--emerald-dim)",
          violet:          "var(--violet)",
          "violet-dim":    "var(--violet-dim)",
        },
      },

      /* Box-shadow tokens for glow effects */
      boxShadow: {
        "teal-glow":    "0 0 18px rgba(20, 184, 166, 0.35), 0 4px 32px rgba(20, 184, 166, 0.18)",
        "amber-glow":   "0 0 18px rgba(245, 158, 11, 0.35), 0 4px 32px rgba(245, 158, 11, 0.18)",
        "rose-glow":    "0 0 18px rgba(239, 68, 68, 0.35),  0 4px 32px rgba(239, 68, 68, 0.18)",
        "emerald-glow": "0 0 18px rgba(34, 197, 94, 0.35),  0 4px 32px rgba(34, 197, 94, 0.18)",
        "panel":        "inset 0 1px 0 rgba(20,184,166,0.07), 0 4px 24px rgba(0,0,0,0.45)",
      },
    },
  },
  plugins: [],
};
