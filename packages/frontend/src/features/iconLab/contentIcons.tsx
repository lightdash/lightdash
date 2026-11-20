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
            <path d="M3.5 8l5 -3.5l4.5 3l7.5 -3.5" fill="none" />
            <rect x="3.5" y="14.5" width="4.5" height="6" rx="1" />
            <rect x="9.75" y="11.5" width="4.5" height="9" rx="1" />
            <rect x="16" y="13" width="4.5" height="7.5" rx="1" />
        </>,
    ),
    scatter: createContentIcon(
        'OutlineScatter',
        <>
            <circle cx="7" cy="16.5" r="2.75" />
            <circle cx="10.5" cy="7.5" r="2" />
            <circle cx="16.5" cy="12.5" r="2.25" />
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
            <path d="M11 3.5v17M11 12.5h9.5" fill="none" />
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
            <path
                d="M4 6.5c7 0 7 4 13.5 4M4 17.5c7 0 7 -4 13.5 -4"
                fill="none"
            />
            <rect x="17.5" y="7.5" width="3" height="9" rx="0.75" />
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
    dataAppViz: createContentIcon(
        'OutlineDataAppViz',
        <>
            <path d="M3.5 7.75a1.25 1.25 0 0 1 1.25 -1.25h3.25a2.5 2.5 0 1 1 5 0h3.25a1.25 1.25 0 0 1 1.25 1.25v3.25a2.5 2.5 0 1 1 0 5v3.25a1.25 1.25 0 0 1 -1.25 1.25h-11.5a1.25 1.25 0 0 1 -1.25 -1.25z" />
        </>,
    ),
};

/* B: outline with one solid part */
export const ACCENT_ICONS: ContentIconSet = {
    dashboard: createContentIcon(
        'AccentDashboard',
        <>
            <rect x="3.5" y="3.5" width="7.5" height="17" rx="2.25" />
            <rect
                x="14"
                y="3.5"
                width="6.5"
                height="6.5"
                rx="2.25"
                fill="currentColor"
                fillOpacity="1"
            />
            <rect x="14" y="13.5" width="6.5" height="7" rx="2.25" />
        </>,
    ),
    space: createContentIcon(
        'AccentSpace',
        <>
            <path
                d="M3.5 10v-3.5a2 2 0 0 1 2 -2h3.6a2 2 0 0 1 1.5 .7l1.3 1.6h6.6a2 2 0 0 1 2 2v1.2z"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <path d="M3.5 6.5a2 2 0 0 1 2 -2h3.6a2 2 0 0 1 1.5 .7l1.3 1.6h6.6a2 2 0 0 1 2 2v8.7a2 2 0 0 1 -2 2h-13a2 2 0 0 1 -2 -2z" />
            <path d="M3.5 10h17" fill="none" />
        </>,
    ),
    dataApp: createContentIcon(
        'AccentDataApp',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
            <path d="M3.5 8.5h17" fill="none" />
            <rect
                x="6.75"
                y="11.5"
                width="10.5"
                height="6"
                rx="1.25"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
    document: createContentIcon(
        'AccentDocument',
        <>
            <path d="M7 3.5h7l5 5v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-13a2 2 0 0 1 2 -2z" />
            <path
                d="M14 3.5l5 5h-3a2 2 0 0 1 -2 -2z"
                fill="currentColor"
                fillOpacity="1"
            />
            <path d="M8.5 13h7M8.5 16.5h4" fill="none" />
        </>,
    ),
    table: createContentIcon(
        'AccentTable',
        <>
            <path
                d="M3.5 9.5v-3a3 3 0 0 1 3 -3h11a3 3 0 0 1 3 3v3z"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
            <path d="M3.5 9.5h17M3.5 15h17M12 9.5v11" fill="none" />
        </>,
    ),
    bar: createContentIcon(
        'AccentBar',
        <>
            <rect x="3.5" y="12" width="4.5" height="8.5" rx="1.5" />
            <rect
                x="9.75"
                y="3.5"
                width="4.5"
                height="17"
                rx="1.5"
                fill="currentColor"
                fillOpacity="1"
            />
            <rect x="16" y="8" width="4.5" height="12.5" rx="1.5" />
        </>,
    ),
    horizontalBar: createContentIcon(
        'AccentHorizontalBar',
        <>
            <rect x="3.5" y="3.5" width="9" height="4.5" rx="1.5" />
            <rect
                x="3.5"
                y="9.75"
                width="17"
                height="4.5"
                rx="1.5"
                fill="currentColor"
                fillOpacity="1"
            />
            <rect x="3.5" y="16" width="12.5" height="4.5" rx="1.5" />
        </>,
    ),
    line: createContentIcon(
        'AccentLine',
        <>
            <path d="M3.5 17.5l5 -6.5l4.5 3.5l5.2 -6.2" fill="none" />
            <circle
                cx="18.5"
                cy="6.25"
                r="2.25"
                fill="currentColor"
                fillOpacity="1"
            />
        </>,
    ),
    area: createContentIcon(
        'AccentArea',
        <>
            <path d="M3.5 20.5v-6.5l5 -5.5l4.5 3.5l7.5 -8v16.5z" />
            <path
                d="M3.5 20.5v-2.5l5 -3l4.5 2l7.5 -5v8.5z"
                fill="currentColor"
                fillOpacity="1"
            />
        </>,
    ),
    mixed: createContentIcon(
        'AccentMixed',
        <>
            <path d="M3.5 8l5 -3.5l4.5 3l7.5 -3.5" fill="none" />
            <rect x="3.5" y="14.5" width="4.5" height="6" rx="1.5" />
            <rect
                x="9.75"
                y="11.5"
                width="4.5"
                height="9"
                rx="1.5"
                fill="currentColor"
                fillOpacity="1"
            />
            <rect x="16" y="13" width="4.5" height="7.5" rx="1.5" />
        </>,
    ),
    scatter: createContentIcon(
        'AccentScatter',
        <>
            <circle
                cx="7"
                cy="16.5"
                r="2.75"
                fill="currentColor"
                fillOpacity="1"
            />
            <circle cx="10.5" cy="7.5" r="2" />
            <circle cx="16.5" cy="12.5" r="2.25" />
            <circle cx="18.5" cy="5.25" r="1.75" />
        </>,
    ),
    pie: createContentIcon(
        'AccentPie',
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path
                d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5h-8.5z"
                fill="currentColor"
                fillOpacity="1"
            />
        </>,
    ),
    bigNumber: createContentIcon(
        'AccentBigNumber',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
            <path
                d="M13.8 7.25h-1.5l-2.5 1.85v1.8l2.2 -1.4v7.25h1.8z"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
    funnel: createContentIcon(
        'AccentFunnel',
        <>
            <rect
                x="3.5"
                y="3.5"
                width="17"
                height="4.5"
                rx="1.5"
                fill="currentColor"
                fillOpacity="1"
            />
            <rect x="6.25" y="9.75" width="11.5" height="4.5" rx="1.5" />
            <rect x="9" y="16" width="6" height="4.5" rx="1.5" />
        </>,
    ),
    treemap: createContentIcon(
        'AccentTreemap',
        <>
            <path
                d="M11 3.5v17h-4.5a3 3 0 0 1 -3 -3v-11a3 3 0 0 1 3 -3z"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
            <path d="M11 3.5v17M11 12.5h9.5M15.75 12.5v8" fill="none" />
        </>,
    ),
    gauge: createContentIcon(
        'AccentGauge',
        <>
            <path d="M5.07 18.25a8 8 0 1 1 13.86 0" fill="none" />
            <path d="M12 14.25l3.5 -4.5" fill="none" />
            <circle
                cx="12"
                cy="14.25"
                r="2.25"
                fill="currentColor"
                fillOpacity="1"
            />
        </>,
    ),
    map: createContentIcon(
        'AccentMap',
        <>
            <path d="M3.5 6.5l5.5 -2.5l6 2.5l5.5 -2.5v13.5l-5.5 2.5l-6 -2.5l-5.5 2.5z" />
            <path
                d="M9 4l6 2.5v13.5l-6 -2.5z"
                fill="currentColor"
                fillOpacity="1"
            />
        </>,
    ),
    sankey: createContentIcon(
        'AccentSankey',
        <>
            <path
                d="M6.5 6.75c5.5 0 5.5 3.25 11 3.25M6.5 17.25c5.5 0 5.5 -3.25 11 -3.25"
                fill="none"
            />
            <rect
                x="3.5"
                y="3.5"
                width="3"
                height="6.5"
                rx="1.25"
                fill="currentColor"
                fillOpacity="1"
            />
            <rect
                x="3.5"
                y="14"
                width="3"
                height="6.5"
                rx="1.25"
                fill="currentColor"
                fillOpacity="1"
            />
            <rect
                x="17.5"
                y="7.5"
                width="3"
                height="9"
                rx="1.25"
                fill="currentColor"
                fillOpacity="1"
            />
        </>,
    ),
    custom: createContentIcon(
        'AccentCustom',
        <>
            <path d="M7.5 7.5l-4 4.5l4 4.5M16.5 7.5l4 4.5l-4 4.5" fill="none" />
            <path d="M13.5 5.5l-3 13" fill="none" strokeWidth="3" />
        </>,
    ),
    dataAppViz: createContentIcon(
        'AccentDataAppViz',
        <>
            <path d="M3.5 8.5a2 2 0 0 1 2 -2h2.5a2.5 2.5 0 1 1 5 0h2.5a2 2 0 0 1 2 2v2.5a2.5 2.5 0 1 1 0 5v2.5a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" />
            <circle
                cx="10.5"
                cy="13.5"
                r="2.25"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
};

/* C: solid, two tones of one colour */
export const SOLID_ICONS: ContentIconSet = {
    dashboard: createContentIcon(
        'SolidDashboard',
        <>
            <rect
                x="3"
                y="3"
                width="8"
                height="18"
                rx="2.5"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect
                x="13"
                y="3"
                width="8"
                height="7"
                rx="2.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="13"
                y="12"
                width="8"
                height="9"
                rx="2.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
        </>,
    ),
    space: createContentIcon(
        'SolidSpace',
        <>
            <path
                d="M3 6.5a2.5 2.5 0 0 1 2.5 -2.5h3.3a2.5 2.5 0 0 1 1.9 .9l1.3 1.6h6.5a2.5 2.5 0 0 1 2.5 2.5v4h-18z"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="3"
                y="9.75"
                width="18"
                height="10.25"
                rx="2.5"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
    dataApp: createContentIcon(
        'SolidDataApp',
        <>
            <path
                d="M3 8v-1.5a3.5 3.5 0 0 1 3.5 -3.5h11a3.5 3.5 0 0 1 3.5 3.5v1.5z"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <path
                d="M3 9.5h18v8a3.5 3.5 0 0 1 -3.5 3.5h-11a3.5 3.5 0 0 1 -3.5 -3.5z"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
    document: createContentIcon(
        'SolidDocument',
        <>
            <path
                d="M7.5 3h6l5.5 5.5v10a2.5 2.5 0 0 1 -2.5 2.5h-9a2.5 2.5 0 0 1 -2.5 -2.5v-13a2.5 2.5 0 0 1 2.5 -2.5z"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="8"
                y="11.5"
                width="8"
                height="2"
                rx="1"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect
                x="8"
                y="15.5"
                width="5"
                height="2"
                rx="1"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
    table: createContentIcon(
        'SolidTable',
        <>
            <rect
                x="3"
                y="3"
                width="18"
                height="5.5"
                rx="2"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect
                x="3"
                y="10.25"
                width="7"
                height="4.5"
                rx="1.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="11.75"
                y="10.25"
                width="9.25"
                height="4.5"
                rx="1.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="3"
                y="16.5"
                width="7"
                height="4.5"
                rx="1.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="11.75"
                y="16.5"
                width="9.25"
                height="4.5"
                rx="1.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
        </>,
    ),
    bar: createContentIcon(
        'SolidBar',
        <>
            <rect
                x="3"
                y="12"
                width="5"
                height="9"
                rx="1.75"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="9.5"
                y="3"
                width="5"
                height="18"
                rx="1.75"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect
                x="16"
                y="8"
                width="5"
                height="13"
                rx="1.75"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
        </>,
    ),
    horizontalBar: createContentIcon(
        'SolidHorizontalBar',
        <>
            <rect
                x="3"
                y="3"
                width="9"
                height="5"
                rx="1.75"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="3"
                y="9.5"
                width="18"
                height="5"
                rx="1.75"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect
                x="3"
                y="16"
                width="13"
                height="5"
                rx="1.75"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
        </>,
    ),
    line: createContentIcon(
        'SolidLine',
        <>
            <rect
                x="3"
                y="18.5"
                width="18"
                height="2.5"
                rx="1.25"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <path
                d="M4.25 14.5l4.5 -5.5l4.5 3.5l6.5 -7.5"
                fill="none"
                strokeWidth="2.5"
            />
        </>,
    ),
    area: createContentIcon(
        'SolidArea',
        <>
            <g opacity="0.4">
                <path
                    d="M3.75 20.25v-7l5 -5.5l4.5 3.5l7 -6.5v15.5z"
                    fill="currentColor"
                    fillOpacity="1"
                    strokeWidth="1.5"
                />
            </g>
            <path
                d="M3.75 20.25v-2.25l5 -3l4.5 2l7 -5v8.25z"
                fill="currentColor"
                fillOpacity="1"
                strokeWidth="1.5"
            />
        </>,
    ),
    mixed: createContentIcon(
        'SolidMixed',
        <>
            <rect
                x="3"
                y="14.5"
                width="5"
                height="6.5"
                rx="1.75"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="9.5"
                y="11.5"
                width="5"
                height="9.5"
                rx="1.75"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="16"
                y="13"
                width="5"
                height="8"
                rx="1.75"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <path
                d="M4.25 8l4.5 -3l4.5 2.75l6.5 -3"
                fill="none"
                strokeWidth="2.5"
            />
        </>,
    ),
    scatter: createContentIcon(
        'SolidScatter',
        <>
            <circle
                cx="7"
                cy="16"
                r="3.5"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <circle
                cx="10"
                cy="7"
                r="2.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <circle
                cx="16.5"
                cy="13"
                r="2.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <circle
                cx="18.5"
                cy="5.5"
                r="2.25"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
    pie: createContentIcon(
        'SolidPie',
        <>
            <path
                d="M11 5a8 8 0 1 0 8 8h-8z"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <path
                d="M13 3a8 8 0 0 1 8 8h-8z"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
    bigNumber: createContentIcon(
        'SolidBigNumber',
        <>
            <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="3.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <path
                d="M13.8 7.25h-1.5l-2.5 1.85v1.8l2.2 -1.4v7.25h1.8z"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
    funnel: createContentIcon(
        'SolidFunnel',
        <>
            <rect
                x="3"
                y="3"
                width="18"
                height="5"
                rx="1.75"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect
                x="6"
                y="9.5"
                width="12"
                height="5"
                rx="1.75"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="9"
                y="16"
                width="6"
                height="5"
                rx="1.75"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
        </>,
    ),
    treemap: createContentIcon(
        'SolidTreemap',
        <>
            <rect
                x="3"
                y="3"
                width="8.25"
                height="18"
                rx="1.75"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect
                x="12.5"
                y="3"
                width="8.5"
                height="8.5"
                rx="1.75"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="12.5"
                y="12.75"
                width="3.6"
                height="8.25"
                rx="1.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <rect
                x="17.35"
                y="12.75"
                width="3.65"
                height="8.25"
                rx="1.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
        </>,
    ),
    gauge: createContentIcon(
        'SolidGauge',
        <>
            <path
                d="M5.5 18a7.5 7.5 0 1 1 13 0"
                fill="none"
                strokeWidth="3.25"
                strokeOpacity="0.4"
            />
            <path
                d="M5.5 18a7.5 7.5 0 0 1 10.25 -10.24"
                fill="none"
                strokeWidth="3.25"
            />
        </>,
    ),
    map: createContentIcon(
        'SolidMap',
        <>
            <g opacity="0.4">
                <path
                    d="M3.75 7.25l3.75 -1.75v12l-3.75 1.75z"
                    fill="currentColor"
                    fillOpacity="1"
                    strokeWidth="1.5"
                />
                <path
                    d="M16.5 7.25l3.75 -1.75v12l-3.75 1.75z"
                    fill="currentColor"
                    fillOpacity="1"
                    strokeWidth="1.5"
                />
            </g>
            <path
                d="M10.25 5.5l3.5 1.75v12l-3.5 -1.75z"
                fill="currentColor"
                fillOpacity="1"
                strokeWidth="1.5"
            />
        </>,
    ),
    sankey: createContentIcon(
        'SolidSankey',
        <>
            <path
                d="M6.5 6.75c5.5 0 5.5 3.75 11 3.75M6.5 17.25c5.5 0 5.5 -3.75 11 -3.75"
                fill="none"
                strokeWidth="3"
                strokeOpacity="0.4"
                strokeLinecap="butt"
            />
            <rect
                x="3"
                y="3"
                width="3.5"
                height="7.5"
                rx="1.25"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect
                x="3"
                y="13.5"
                width="3.5"
                height="7.5"
                rx="1.25"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
            <rect
                x="17.5"
                y="7"
                width="3.5"
                height="10"
                rx="1.25"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
    custom: createContentIcon(
        'SolidCustom',
        <>
            <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="3.5"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="none"
            />
            <path
                d="M9.75 8.75l-3.25 3.25l3.25 3.25M14.25 8.75l3.25 3.25l-3.25 3.25"
                fill="none"
                strokeWidth="2"
            />
        </>,
    ),
    dataAppViz: createContentIcon(
        'SolidDataAppViz',
        <>
            <path
                d="M3.5 8.5a2 2 0 0 1 2 -2h2.5a2.5 2.5 0 1 1 5 0h2.5a2 2 0 0 1 2 2v2.5a2.5 2.5 0 1 1 0 5v2.5a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z"
                fill="currentColor"
                fillOpacity="1"
                stroke="none"
            />
        </>,
    ),
};
