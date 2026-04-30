const THEMES = {
  dark: {
    bg:       "#0F1117",
    surface:  "#171923",
    surfaceHi:"#1E2333",
    border:   "#252B3B",
    borderHi: "#2F3850",
    textPri:  "#FFFFFF",
    textSec:  "#FFFFFF",
    textMute: "#FFFFFF",
    indigo:   "#6366F1",
    indigoHi: "#818CF8",
    indigoLo: "#1E1F3B",
    violet:   "#A855F7",
    violetLo: "#1E1535",
    teal:     "#14B8A6",
    tealLo:   "#0D2926",
    amber:    "#F59E0B",
    amberLo:  "#2A1F08",
    red:      "#F87171",
    redLo:    "#2A1111",
    green:    "#34D399",
    greenLo:  "#0D2420",
    jira:     "#2684FF",
    jiraLo:   "#0D1F3C",
  },
  light: {
    bg:       "#F5F7FF",
    surface:  "#FFFFFF",
    surfaceHi:"#EEF2FF",
    border:   "#D6DDF2",
    borderHi: "#C4CEE8",
    textPri:  "#000000",
    textSec:  "#000000",
    textMute: "#000000",
    indigo:   "#3730A3",
    indigoHi: "#312E81",
    indigoLo: "#E6E9FF",
    violet:   "#6D28D9",
    violetLo: "#F1E6FF",
    teal:     "#0F766E",
    tealLo:   "#DCF7F2",
    amber:    "#92400E",
    amberLo:  "#FFF1DA",
    red:      "#B91C1C",
    redLo:    "#FEE2E2",
    green:    "#166534",
    greenLo:  "#DDFBEF",
    jira:     "#1D4ED8",
    jiraLo:   "#DFECFF",
  },
};

export const T = { ...THEMES.dark };

export function applyThemeTokens(themeName = 'dark') {
  const nextTheme = THEMES[themeName] || THEMES.dark;
  Object.assign(T, nextTheme);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = themeName;
    document.body.style.background = nextTheme.bg;
    document.body.style.color = nextTheme.textPri;
  }
}

applyThemeTokens('dark');

export const FONT   = "'Inter', 'Manrope', sans-serif";
export const DISPLAY= "'Inter Tight', 'Inter', sans-serif";
export const MONO   = "'JetBrains Mono', 'Fira Code', monospace";
