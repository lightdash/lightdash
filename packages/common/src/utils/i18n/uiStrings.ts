// Single source of truth for embed UI-chrome strings. Keys are flat dot-paths;
// SdkUiOverrides/UiStringKey are derived from this object so they cannot drift.
export const DEFAULT_UI_STRINGS = {
    'tileMenu.exploreFromHere': 'Explore from here',
    'tileMenu.downloadData': 'Download data',
    'tileMenu.exportImage': 'Export image',
    'tileMenu.viewUnderlyingData': 'View underlying data',
    'dateZoom.defaultZoom': 'Default zoom',
    'dateZoom.none': 'None',
    'dateZoom.viewModeTooltip':
        'Charts will display dates using their original granularity settings.',
    'dateZoom.appliesToOneChart': 'Applies to {n} chart not in a zoom control',
    'dateZoom.appliesToManyCharts':
        'Applies to {n} charts not in a zoom control',
    'dateZoom.noChartsUseDefault':
        'No charts use the default (every chart is in a zoom control)',
    'dateZoom.granularities.Second': 'Second',
    'dateZoom.granularities.Minute': 'Minute',
    'dateZoom.granularities.Hour': 'Hour',
    'dateZoom.granularities.Day': 'Day',
    'dateZoom.granularities.Week': 'Week',
    'dateZoom.granularities.Month': 'Month',
    'dateZoom.granularities.Quarter': 'Quarter',
    'dateZoom.granularities.Year': 'Year',
    'dateZoom.dateZoomLabel': 'Date zoom:',
    'dateZoom.onLabel': 'On:',
    'filters.summary.filterSingular': 'filter',
    'filters.summary.filterPlural': 'filters',
    'filters.summary.parameterSingular': 'parameter',
    'filters.summary.parameterPlural': 'parameters',
    'filters.summary.dateZoomLabel': 'Date Zoom:',
    'filters.summary.default': 'Default',
    'filters.summary.showFilters': 'Show filters',
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
