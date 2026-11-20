import { type ContentIconName } from './contentIcons';

export type ContentIconRow = {
    name: ContentIconName;
    label: string;
    color: string;
};

const CHART_COLOR = 'blue.6';

/** Every content icon with its label and the type colour the app gives it. */
export const CONTENT_ICON_ROWS: ContentIconRow[] = [
    { name: 'dashboard', label: 'Dashboard', color: 'green.6' },
    { name: 'space', label: 'Space', color: 'violet.6' },
    { name: 'dataApp', label: 'Data app', color: 'orange.6' },
    { name: 'document', label: 'Document', color: 'ldGray.6' },
    { name: 'table', label: 'Table', color: CHART_COLOR },
    { name: 'bar', label: 'Bar', color: CHART_COLOR },
    { name: 'line', label: 'Line', color: CHART_COLOR },
    { name: 'area', label: 'Area', color: CHART_COLOR },
    { name: 'mixed', label: 'Mixed', color: CHART_COLOR },
    { name: 'scatter', label: 'Scatter', color: CHART_COLOR },
    { name: 'pie', label: 'Pie', color: CHART_COLOR },
    { name: 'bigNumber', label: 'Big number', color: CHART_COLOR },
    { name: 'funnel', label: 'Funnel', color: CHART_COLOR },
    { name: 'treemap', label: 'Treemap', color: CHART_COLOR },
    { name: 'gauge', label: 'Gauge', color: CHART_COLOR },
    { name: 'map', label: 'Map', color: CHART_COLOR },
    { name: 'sankey', label: 'Sankey', color: CHART_COLOR },
    { name: 'custom', label: 'Vega (legacy)', color: CHART_COLOR },
    {
        name: 'dataAppViz',
        label: 'Custom chart type (user-defined)',
        color: CHART_COLOR,
    },
];
