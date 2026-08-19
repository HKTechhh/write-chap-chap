/**
 * Theming note — why so many colours are CSS variables.
 *
 * Dark mode here is a *token* flip, not a pile of `dark:` utilities. Every
 * step below written as `rgb(var(--x) / <alpha-value>)` is redefined under
 * `.dark` in index.css, so `text-ink-900` or `bg-brand-50` keeps meaning the
 * same thing ("heading colour", "subtle brand tint") in both themes and the
 * ~1,100 existing colour utilities did not have to be touched.
 *
 * Only the steps whose ROLE is unambiguous are flipped:
 *   50/100  subtle tint backgrounds     -> dark tint
 *   200     hairline rings and borders  -> dark ring
 *   600-900 text on those tints         -> light text
 * Steps 300/400/500 stay literal, because they read acceptably on either
 * background and are used for solid fills (`bg-gold-500`, `bg-emerald-500`).
 *
 * Two escape hatches exist for the cases a single token cannot express:
 *   `night-*`  neutrals that must stay dark in BOTH themes (marketing heroes,
 *              modal scrims) — see the ink-950 usages in Landing/Pricing.
 *   `surface`  panel background, since `white` must stay literally white for
 *              `text-white` on solid buttons.
 * @type {import('tailwindcss').Config}
 */

/** `rgb(var(--x) / <alpha-value>)` so `/50` opacity modifiers keep working. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** A palette where only the role-unambiguous steps become themeable. */
const themed = (prefix, fixed) => ({
  ...fixed,
  50: v(`${prefix}-50`),
  100: v(`${prefix}-100`),
  200: v(`${prefix}-200`),
  600: v(`${prefix}-600`),
  700: v(`${prefix}-700`),
  800: v(`${prefix}-800`),
  900: v(`${prefix}-900`),
})

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Panel background. Distinct from `white`, which must stay literal so
        // `text-white` on a solid button survives the theme flip.
        surface: v('surface'),
        // One step brighter than `surface` — dropdowns, modals, popovers.
        'surface-raised': v('surface-raised'),
        // The real page background. Unlike `ink-50` this is never pinned by
        // `.theme-fixed`, so it can be used to blend into the page from
        // inside an always-dark section.
        canvas: v('page-canvas'),

        // Shared brand: deep indigo. Trustworthy without the generic
        // blue-admin-panel look.
        brand: themed('brand', {
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          950: '#1e1b4b',
        }),
        // Writer accent: warm gold. Energy and opportunity — earning, not spending.
        gold: themed('gold', {
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
        }),
        // Client accent: teal. Calm and considered.
        teal: themed('teal', {
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
        }),
        // Status palettes. Tailwind's `extend` deep-merges, so the steps left
        // out here keep their stock values.
        emerald: themed('emerald', {}),
        amber: themed('amber', {}),
        red: themed('red', {}),
        violet: themed('violet', {}),
        sky: themed('sky', {}),
        // Only the 50 step is used (as a gradient stop on the writer tier and
        // pricing cards). Left un-themed it stayed near-white and burned a
        // bright corner into those cards in dark mode.
        orange: { 50: v('orange-50') },

        ink: {
          50: v('ink-50'),
          100: v('ink-100'),
          200: v('ink-200'),
          300: v('ink-300'),
          400: v('ink-400'),
          500: v('ink-500'),
          600: v('ink-600'),
          700: v('ink-700'),
          800: v('ink-800'),
          900: v('ink-900'),
          950: v('ink-950'),
        },

        // Filled buttons and pills that carry `text-white`. These keep their
        // exact light-mode values in both themes: the accents already clear
        // 4.5:1 against white (indigo-600 is 6.3:1), whereas lightening them
        // for dark mode — the usual instinct — drops indigo-500 to 4.47:1 and
        // indigo-400 to about 3:1. A button that fails contrast on hover is
        // worse than one that looks identical in both themes.
        solid: {
          brand: '#4f46e5',
          'brand-hover': '#4338ca',
          'brand-active': '#3730a3',
          'brand-disabled': '#a5b4fc',
          gold: '#f59e0b',
          'gold-hover': '#d97706',
          'gold-active': '#b45309',
          'gold-disabled': '#fcd34d',
          red: '#dc2626',
          'red-hover': '#b91c1c',
          'red-active': '#991b1b',
          'red-disabled': '#fca5a5',
          emerald: '#059669',
          'emerald-hover': '#047857',
          'emerald-active': '#065f46',
          'emerald-disabled': '#6ee7b7',
        },

        // Deliberately NOT themed: surfaces that are dark in both themes, so
        // the white text sitting on them never has to move.
        night: {
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        // Shadow opacity is themed: a 4%-black shadow is invisible on a dark
        // canvas, so `--shadow-strength` scales up under `.dark`.
        card: '0 1px 2px 0 rgb(var(--shadow-rgb) / calc(0.04 * var(--shadow-strength))), 0 4px 16px -2px rgb(var(--shadow-rgb) / calc(0.06 * var(--shadow-strength)))',
        'card-hover':
          '0 2px 4px 0 rgb(var(--shadow-rgb) / calc(0.06 * var(--shadow-strength))), 0 12px 32px -4px rgb(var(--shadow-rgb) / calc(0.12 * var(--shadow-strength)))',
        glow: '0 0 0 1px rgb(99 102 241 / 0.12), 0 8px 32px -8px rgb(99 102 241 / 0.4)',
      },
      backgroundImage: {
        'mesh-brand':
          'radial-gradient(at 15% 20%, rgb(99 102 241 / 0.28) 0px, transparent 55%), radial-gradient(at 85% 10%, rgb(20 184 166 / 0.22) 0px, transparent 50%), radial-gradient(at 70% 85%, rgb(245 158 11 / 0.20) 0px, transparent 50%)',
        'grid-faint':
          'linear-gradient(to right, rgb(148 163 184 / 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.08) 1px, transparent 1px)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.4)', opacity: '0' },
          '100%': { transform: 'scale(1.4)', opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'scale-in': 'scale-in 0.18s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
