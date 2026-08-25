// Single source of truth for embed UI-chrome strings. Keys are flat dot-paths;
// SdkUiOverrides/UiStringKey are derived from this object so they cannot drift.
export const DEFAULT_UI_STRINGS = {
    'tileMenu.exploreFromHere': 'Explore from here',
    'tileMenu.downloadData': 'Download data',
    'tileMenu.exportImage': 'Export image',
    'tileMenu.viewUnderlyingData': 'View underlying data',
} as const satisfies Record<string, string>;

export type UiStringKey = keyof typeof DEFAULT_UI_STRINGS;

export type SdkUiOverrides = Partial<Record<UiStringKey, string>>;

export type UiStringResolver = (key: UiStringKey) => string;

export const interpolateUiString = (
    template: string,
    vars: Record<string, string | number>,
): string =>
    template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
    );
