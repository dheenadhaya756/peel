import type { Config } from 'tailwindcss'

/**
 * Tokens read from the supplied references: Cloudflare Workers, Base44, ZeroDrift,
 * Flexfolio. The rule that makes the palette work is orange-on-CREAM, never
 * orange-on-white, and ink that is warm brown-black rather than #000.
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // paper — the body never sits on pure white
        paper: { DEFAULT: '#FDFAF6', raised: '#FFFFFF', sunken: '#F6F1E9', edge: '#EDE4D8' },
        // ink — warm brown-black, the Cloudflare signature
        ink: { DEFAULT: '#2B1710', soft: '#6B5449', faint: '#9A8578', inverse: '#FFF8F2' },
        // the orange core
        flame: {
          50: '#FFF4EC', 100: '#FFE6D5', 200: '#FFC9A8', 300: '#FFA870',
          400: '#FF8840', 500: '#FF6B1A', 600: '#F6821F', 700: '#D4560A',
          800: '#A63F06', 900: '#7A2F08',
        },
        coral: '#F97362',
        peach: '#FFB088',
        lime: '#D4F87A',
        // verdict colours — the three states a system can be in
        verdict: { no: '#D4560A', maybe: '#C98A16', yes: '#2F7D52' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      letterSpacing: { display: '-0.032em', tight: '-0.018em' },
      borderRadius: { card: '24px', pill: '999px', inset: '18px' },
      boxShadow: {
        pill: '0 1px 2px rgba(43,23,16,.06), 0 8px 24px -12px rgba(43,23,16,.18)',
        card: '0 1px 3px rgba(43,23,16,.05), 0 24px 48px -28px rgba(43,23,16,.22)',
        glow: '0 0 0 1px rgba(255,255,255,.55) inset, 0 12px 40px -16px rgba(214,86,10,.45)',
      },
      backgroundImage: {
        // 1 — hero glow: white-hot core at bottom centre bleeding up (Cloudflare)
        'glow-hero':
          'radial-gradient(120% 85% at 50% 112%, #FFFFFF 0%, #FFE2C0 18%, #FF8A3D 46%, #F6621A 72%, #D4560A 100%)',
        // 2 — mesh: blurred coral/peach blobs (ZeroDrift, the integrations shot)
        'mesh-warm':
          'radial-gradient(60% 60% at 18% 22%, #FF9E7A 0%, transparent 62%), radial-gradient(55% 55% at 82% 18%, #FFC49A 0%, transparent 60%), radial-gradient(70% 70% at 62% 88%, #F97362 0%, transparent 65%), linear-gradient(160deg, #FFE9DA 0%, #FFF6EE 100%)',
        // 3 — soft discs (Base44)
        'discs-warm':
          'radial-gradient(46% 62% at 8% 78%, rgba(255,168,112,.85) 0%, transparent 70%), radial-gradient(52% 58% at 92% 26%, rgba(255,136,64,.75) 0%, transparent 68%), linear-gradient(135deg, #FF7A1F 0%, #FFB37A 52%, #FFD9BC 100%)',
        'dot-grid':
          'radial-gradient(circle at 1px 1px, rgba(43,23,16,.10) 1px, transparent 0)',
      },
      backgroundSize: { 'dot-grid': '22px 22px' },
      keyframes: {
        rise: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        sweep: { '0%': { transform: 'translateX(-110%)' }, '100%': { transform: 'translateX(210%)' } },
        pulseSoft: { '0%,100%': { opacity: '.55' }, '50%': { opacity: '1' } },
      },
      animation: {
        rise: 'rise .45s cubic-bezier(.22,1,.36,1) both',
        sweep: 'sweep 1.7s ease-in-out infinite',
        pulseSoft: 'pulseSoft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
