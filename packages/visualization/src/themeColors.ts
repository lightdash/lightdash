import { type VisualizationTheme } from './theme';

/**
 * The chart styles shared with the rest of Lightdash (`@lightdash/common`'s
 * axis, legend and tooltip styles) name their colours as Mantine CSS
 * variables with a light-mode fallback, e.g.
 * `var(--mantine-color-ldGray-7, #495057)`. A browser resolves them from the
 * page's stylesheet; an image renderer, a server or a page without that
 * stylesheet cannot, and draws black or the light fallback in dark mode.
 *
 * `resolveThemeColors` swaps each variable for the theme's own value, so an
 * option draws the same everywhere. `renderChart` applies it; the web app's
 * hooks do not, and keep the variables: its image exports draw the SVG
 * without the stylesheet and rely on the light fallbacks.
 *
 * Only the names whose value the theme carries in both schemes are mapped.
 * Any other name (`gray`, which Lightdash keeps light in dark mode; `black`,
 * which it customises) takes its fallback, as a browser without the
 * stylesheet would.
 */

const VARIABLE =
    /var\(--mantine-color-([a-zA-Z]+)(?:-(\d+))?\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g;

const colorOf = (
    theme: VisualizationTheme,
    name: string,
    step: number | undefined,
): string | undefined => {
    const at = (ramp: readonly string[]) =>
        step === undefined ? undefined : ramp[step];
    switch (name) {
        case 'ldGray':
            return at(theme.neutral);
        case 'ldDark':
            return at(theme.contrast);
        case 'dark':
            return at(theme.chrome);
        case 'blue':
            return at(theme.accent);
        case 'background':
            return theme.background;
        case 'foreground':
            return theme.foreground;
        case 'white':
            return '#ffffff';
        default:
            return undefined;
    }
};

const resolveString = (value: string, theme: VisualizationTheme): string =>
    value.includes('var(--mantine-color-')
        ? value.replace(
              VARIABLE,
              (match, name: string, step: string | undefined, fallback) =>
                  colorOf(
                      theme,
                      name,
                      step === undefined ? undefined : Number(step),
                  ) ?? (typeof fallback === 'string' ? fallback.trim() : match),
          )
        : value;

/** Keys whose values are row data, never styles: not walked. */
const DATA_KEYS = new Set(['dataset', 'source']);

/**
 * `option` with every Mantine colour variable in its strings replaced by the
 * theme's value. Objects with nothing to replace are returned as they are
 * (the same reference), so the pass copies only the paths it changes.
 * Functions (formatters) are kept; the rows in `dataset` are not walked.
 */
export const resolveThemeColors = <T>(
    option: T,
    theme: VisualizationTheme,
): T => {
    const walk = (value: unknown, key?: string): unknown => {
        if (typeof value === 'string') return resolveString(value, theme);
        if (value === null || typeof value !== 'object') return value;
        if (key !== undefined && DATA_KEYS.has(key)) return value;
        if (Array.isArray(value)) {
            let changed = false;
            const next = value.map((item) => {
                const resolved = walk(item);
                if (resolved !== item) changed = true;
                return resolved;
            });
            return changed ? next : value;
        }
        if (Object.getPrototypeOf(value) !== Object.prototype) return value;
        let changed = false;
        const entries = Object.entries(value).map(([entryKey, entryValue]) => {
            const resolved = walk(entryValue, entryKey);
            if (resolved !== entryValue) changed = true;
            return [entryKey, resolved] as const;
        });
        return changed ? Object.fromEntries(entries) : value;
    };
    return walk(option) as T;
};
