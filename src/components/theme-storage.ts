/**
 * The localStorage key holding the chosen theme, shared by the root layout's
 * pre-paint script and the toggle (`theme.tsx`). A plain module, not part of
 * `theme.tsx`: the layout is a server component, and a value imported from a
 * "use client" module reaches it as a client reference, not the string.
 */
export const THEME_STORAGE_KEY = "yitra-theme";
