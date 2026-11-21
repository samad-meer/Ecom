/**
 * Bright Sky: the one look for the whole app. Clean white tiles on a pale-blue
 * page, vivid blue for actions, navy for text and a sunny yellow accent.
 *
 * Use these tokens instead of typing hex values. Text and background pairs were
 * chosen to stay readable outdoors: every pair used for body text is at least
 * 4.5:1 (navy on cloud 14.8, muted on cloud 5.9, white on primary 4.6,
 * white on success 5.4, white on danger 5.6, white on warning 5.0).
 */
export const colors = {
  // Surfaces
  bg: '#EEF5FF', // page background ("Cloud")
  surface: '#FFFFFF', // cards and sheets
  surfaceTint: '#F5F9FF', // inputs resting on a white card
  white: '#FFFFFF',

  // Brand
  primary: '#1F6FEB', // actions, links, active tab ("Sky Blue")
  primaryDark: '#1859C0', // pressed state
  primaryTint: '#E6F0FF', // soft blue fills
  primarySoft: '#B9D4FF', // borders and accents on blue
  sun: '#FFD23F', // the sunny accent tile
  mint: '#CDEFE0', // the calm "all settled" tile
  mintText: '#14513A',
  ink: '#0A1F44', // text, and dark surfaces ("Navy")

  // Text
  text: '#0A1F44',
  textSecondary: '#33476B',
  muted: '#4B5F82', // hints and captions
  disabled: '#B8C7E0',

  // Lines
  line: '#DCE8FA',
  lineSoft: '#E6EEFA',

  // Status. Always pair a colour with a word, never colour alone.
  success: '#14703F',
  successBg: '#D9F3E6',
  warning: '#B45309',
  warningText: '#7A5200',
  warningBg: '#FFF4D6',
  warningLine: '#FFE2A8',
  danger: '#C62828',
  dangerBg: '#FDEAEA',
  dangerLine: '#F3C2C2',
  info: '#0B7089',
  infoBg: '#DDF3F8',

  // Third-party brand
  whatsapp: '#25D366', // use ink text on it: white on this green is only 2.0:1
} as const;

/** Three corner shapes cover almost everything. */
export const radius = {
  sm: 12, // fields, small chips
  md: 16, // buttons
  lg: 20, // cards
  xl: 28, // hero tiles
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/** Six sizes. Nothing below 12. */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  display: 32,
} as const;

/** Soft blue-tinted shadows instead of grey ones. */
export const shadow = {
  card: {
    shadowColor: '#1F6FEB',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  float: {
    shadowColor: '#1F6FEB',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

/** The standard white card: lists rows, tiles and sections all use this. */
export const card = {
  backgroundColor: colors.surface,
  borderRadius: radius.lg + 4,
  borderWidth: 1,
  borderColor: colors.line,
  ...shadow.card,
} as const;

/** Side margin of every screen. */
export const pagePadding = 16;

export type Colors = typeof colors;
