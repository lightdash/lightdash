import { type IconProps } from '@tabler/icons-react';
import { type ForwardRefExoticComponent, type RefAttributes } from 'react';
import { createContentIcon } from './createContentIcon';

// Hand-drawn on a 24 grid. Solid shapes set their own fill opacity so the tint
// IconBox puts on the svg root does not fade them.
export type ContentIconName =
    | 'dashboard'
    | 'space'
    | 'dataApp'
    | 'document'
    | 'table'
    | 'bar'
    | 'horizontalBar'
    | 'line'
    | 'area'
    | 'mixed'
    | 'scatter'
    | 'pie'
    | 'bigNumber'
    | 'funnel'
    | 'treemap'
    | 'gauge'
    | 'map'
    | 'sankey'
    | 'custom'
    | 'dataAppViz';

export type ContentIcon = ForwardRefExoticComponent<
    IconProps & RefAttributes<SVGSVGElement>
>;

export type ContentIconSet = Record<ContentIconName, ContentIcon>;

/* A: outline, tight corner radius, at most four strokes on the framed icons */
export const OUTLINE_ICONS: ContentIconSet = {
    dashboard: createContentIcon(
        'OutlineDashboard',
        <>
            <rect x="3.5" y="3.5" width="7.5" height="17" rx="1.25" />
            <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.25" />
            <rect x="14" y="13.5" width="6.5" height="7" rx="1.25" />
        </>,
    ),
    space: createContentIcon(
        'OutlineSpace',
        <>
            <path d="M3.5 5.75a1.25 1.25 0 0 1 1.25 -1.25h4.6a1.25 1.25 0 0 1 1 .5l1.4 1.8h7.5a1.25 1.25 0 0 1 1.25 1.25v10.2a1.25 1.25 0 0 1 -1.25 1.25h-14.5a1.25 1.25 0 0 1 -1.25 -1.25z" />
        </>,
    ),
    dataApp: createContentIcon(
        'OutlineDataApp',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M3.5 8.5h17M6.5 6h.01M9 6h.01" fill="none" />
        </>,
    ),
    document: createContentIcon(
        'OutlineDocument',
        <>
            <path d="M6.25 3.5h7.75l5 5v10.75a1.25 1.25 0 0 1 -1.25 1.25h-11.5a1.25 1.25 0 0 1 -1.25 -1.25v-14.5a1.25 1.25 0 0 1 1.25 -1.25z" />
            <path
                d="M14 3.5v3.75a1.25 1.25 0 0 0 1.25 1.25h3.75M8.5 13h7M8.5 16.5h4"
                fill="none"
            />
        </>,
    ),
    table: createContentIcon(
        'OutlineTable',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M3.5 9.5h17M9.5 9.5v11" fill="none" />
        </>,
    ),
    bar: createContentIcon(
        'OutlineBar',
        <>
            <rect x="3.5" y="12" width="4.5" height="8.5" rx="1" />
            <rect x="9.75" y="3.5" width="4.5" height="17" rx="1" />
            <rect x="16" y="8" width="4.5" height="12.5" rx="1" />
        </>,
    ),
    horizontalBar: createContentIcon(
        'OutlineHorizontalBar',
        <>
            <rect x="3.5" y="3.5" width="9" height="4.5" rx="1" />
            <rect x="3.5" y="9.75" width="17" height="4.5" rx="1" />
            <rect x="3.5" y="16" width="12.5" height="4.5" rx="1" />
        </>,
    ),
    line: createContentIcon(
        'OutlineLine',
        <>
            <path d="M3.5 15.5l5 -6l4.5 3.5l7.5 -8.5" fill="none" />
            <path d="M3.5 20.5h17" fill="none" />
        </>,
    ),
    area: createContentIcon(
        'OutlineArea',
        <>
            <path d="M3.5 20.5v-6.5l5 -5.5l4.5 3.5l7.5 -8v16.5z" />
        </>,
    ),
    mixed: createContentIcon(
        'OutlineMixed',
        <>
            <path d="M3.5 6.5l5 -3l4.5 2.5l7.5 -2.5" fill="none" />
            <rect x="3.5" y="12.5" width="4.5" height="8" rx="1" />
            <rect x="9.75" y="9" width="4.5" height="11.5" rx="1" />
            <rect x="16" y="10.5" width="4.5" height="10" rx="1" />
        </>,
    ),
    scatter: createContentIcon(
        'OutlineScatter',
        <>
            <path d="M3.5 20.5h17" fill="none" />
            <circle cx="7" cy="14.5" r="2.25" />
            <circle cx="10.5" cy="7.5" r="2" />
            <circle cx="16" cy="12" r="2.25" />
            <circle cx="18.5" cy="5.25" r="1.75" />
        </>,
    ),
    pie: createContentIcon(
        'OutlinePie',
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5v8.5h8.5" fill="none" />
        </>,
    ),
    bigNumber: createContentIcon(
        'OutlineBigNumber',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M10.5 9.5l2.5 -2v9" fill="none" />
        </>,
    ),
    funnel: createContentIcon(
        'OutlineFunnel',
        <>
            <path d="M4 4.5h16l-4.5 15h-7z" />
            <path d="M6.1 11.5h11.8" fill="none" />
        </>,
    ),
    treemap: createContentIcon(
        'OutlineTreemap',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M11 3.5v17M11 12.5h9.5M15.75 12.5v8" fill="none" />
        </>,
    ),
    gauge: createContentIcon(
        'OutlineGauge',
        <>
            <path d="M5.07 18.25a8 8 0 1 1 13.86 0" fill="none" />
            <path d="M12 14.25l3.5 -4.5" fill="none" />
        </>,
    ),
    map: createContentIcon(
        'OutlineMap',
        <>
            <path d="M3.5 6.5l5.5 -2.5l6 2.5l5.5 -2.5v13.5l-5.5 2.5l-6 -2.5l-5.5 2.5z" />
            <path d="M9 4v13.5M15 6.5v13.5" fill="none" />
        </>,
    ),
    sankey: createContentIcon(
        'OutlineSankey',
        <>
            <path d="M6.5 12.5c5.5 0 5.5 -7 11 -7v6c-5.5 0 -5.5 7 -11 7z" />
            <rect x="3.5" y="10.5" width="3" height="10" rx="0.75" />
            <rect x="17.5" y="3.5" width="3" height="10" rx="0.75" />
        </>,
    ),
    custom: createContentIcon(
        'OutlineCustom',
        <>
            <path
                d="M8 7.5l-4.5 4.5l4.5 4.5M16 7.5l4.5 4.5l-4.5 4.5M13.75 5l-3.5 14"
                fill="none"
            />
        </>,
    ),
    // Fallback for a custom chart type with no icon chosen: a chart tile with a person badge, for user-defined.
    dataAppViz: createContentIcon(
        'OutlineDataAppViz',
        <>
            <path
                d="M12 20.5h-6.5a2 2 0 0 1 -2 -2v-13a2 2 0 0 1 2 -2h13a2 2 0 0 1 2 2v6.5"
                fill="none"
            />
            <path d="M7 12.5l2.5 -3l2.5 2l3.5 -4.5" fill="none" />
            <circle cx="17.5" cy="15.5" r="1.9" />
            <path d="M14 20.75a3.5 3.5 0 0 1 7 0" fill="none" />
        </>,
    ),
};
