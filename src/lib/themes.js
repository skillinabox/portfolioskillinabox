// Portfolio themes — each defines colours, fonts, and style tokens

export const THEMES = {
  classic: {
    name: 'Classic',
    desc: 'Warm ivory with terracotta — timeless Indian elegance',
    preview: { bg: '#F7F6F4', accent: '#F4622A', dark: '#0A0A0A', card: '#fff', text: '#111' },
    fonts: { heading: "'DM Serif Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif" },
    colors: {
      bg:        '#F7F6F4',
      heroBg:    '#0A0A0A',
      accent:    '#F4622A',
      accentDark:'#C94E1E',
      cardBg:    '#FFFFFF',
      cardBorder:'#E8E6E2',
      textPrimary:'#111111',
      textMuted:  '#666666',
    },
  },
  midnight: {
    name: 'Midnight',
    desc: 'All-dark luxury — bold and editorial',
    preview: { bg: '#0D0D0D', accent: '#A78BFA', dark: '#0D0D0D', card: '#1A1A1A', text: '#fff' },
    fonts: { heading: "'DM Serif Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif" },
    colors: {
      bg:        '#0D0D0D',
      heroBg:    '#0D0D0D',
      accent:    '#A78BFA',
      accentDark:'#7C3AED',
      cardBg:    '#1A1A1A',
      cardBorder:'#2A2A2A',
      textPrimary:'#FFFFFF',
      textMuted:  '#888888',
    },
  },
  blush: {
    name: 'Blush',
    desc: 'Soft pink and gold — feminine and aspirational',
    preview: { bg: '#FDF6F0', accent: '#C4875A', dark: '#1A0A00', card: '#fff', text: '#2D1B0E' },
    fonts: { heading: "'Playfair Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif" },
    colors: {
      bg:        '#FDF6F0',
      heroBg:    '#1A0A00',
      accent:    '#C4875A',
      accentDark:'#A0622A',
      cardBg:    '#FFFFFF',
      cardBorder:'#EDE0D4',
      textPrimary:'#2D1B0E',
      textMuted:  '#8B6B50',
    },
  },
  forest: {
    name: 'Forest',
    desc: 'Deep green and cream — natural and sustainable',
    preview: { bg: '#F4F7F2', accent: '#2D6A4F', dark: '#081C15', card: '#fff', text: '#081C15' },
    fonts: { heading: "'DM Serif Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif" },
    colors: {
      bg:        '#F4F7F2',
      heroBg:    '#081C15',
      accent:    '#2D6A4F',
      accentDark:'#1B4332',
      cardBg:    '#FFFFFF',
      cardBorder:'#D8E8D4',
      textPrimary:'#081C15',
      textMuted:  '#52796F',
    },
  },
  noir: {
    name: 'Noir',
    desc: 'Stark black and white — high fashion minimalism',
    preview: { bg: '#FFFFFF', accent: '#000000', dark: '#000000', card: '#F5F5F5', text: '#000' },
    fonts: { heading: "'DM Serif Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif" },
    colors: {
      bg:        '#FFFFFF',
      heroBg:    '#000000',
      accent:    '#111111',
      accentDark:'#000000',
      cardBg:    '#F5F5F5',
      cardBorder:'#E0E0E0',
      textPrimary:'#000000',
      textMuted:  '#555555',
    },
  },
}

export const DEFAULT_THEME = 'classic'
export const MAX_THEME_CHANGES = 2 // per month
