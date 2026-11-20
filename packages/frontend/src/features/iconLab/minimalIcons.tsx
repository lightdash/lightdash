import { type ContentIconSet } from './contentIcons';
import { createContentIcon } from './createContentIcon';

/* E: minimal. Outline recipe from A, at most four strokes, isometric forms for dashboard, space and data app. */
export const MINIMAL_ICONS: ContentIconSet = {
    dashboard: createContentIcon(
        'MinimalDashboard',
        <>
            <path d="M12 5l8.5 5.5l-8.5 5.5l-8.5 -5.5z" />
            <path d="M3.5 10.5v3l8.5 5.5l8.5 -5.5v-3" fill="none" />
            <path d="M7.75 7.75l8.5 5.5" fill="none" />
        </>,
    ),
    space: createContentIcon(
        'MinimalSpace',
        <>
            <path d="M12 3.5l8.5 4.25l-8.5 4.25l-8.5 -4.25z" />
            <path d="M3.5 12l8.5 4.25l8.5 -4.25" fill="none" />
            <path d="M3.5 16.25l8.5 4.25l8.5 -4.25" fill="none" />
        </>,
    ),
    dataApp: createContentIcon(
        'MinimalDataApp',
        <>
            <path d="M12 3.5l7.5 3.75v9l-7.5 3.75l-7.5 -3.75v-9z" />
            <path d="M4.5 7.25l7.5 3.75l7.5 -3.75M12 11v9" fill="none" />
        </>,
    ),
    document: createContentIcon(
        'MinimalDocument',
        <>
            <path d="M6.25 3.5h7.75l5 5v10.75a1.25 1.25 0 0 1 -1.25 1.25h-11.5a1.25 1.25 0 0 1 -1.25 -1.25v-14.5a1.25 1.25 0 0 1 1.25 -1.25z" />
            <path d="M14 3.5v3.75a1.25 1.25 0 0 0 1.25 1.25h3.75" fill="none" />
        </>,
    ),
    table: createContentIcon(
        'MinimalTable',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M3.5 9.5h17M9.5 9.5v11" fill="none" />
        </>,
    ),
    bar: createContentIcon(
        'MinimalBar',
        <>
            <rect x="3.5" y="12" width="4.5" height="8.5" rx="1" />
            <rect x="9.75" y="3.5" width="4.5" height="17" rx="1" />
            <rect x="16" y="8" width="4.5" height="12.5" rx="1" />
        </>,
    ),
    horizontalBar: createContentIcon(
        'MinimalHorizontalBar',
        <>
            <rect x="3.5" y="3.5" width="9" height="4.5" rx="1" />
            <rect x="3.5" y="9.75" width="17" height="4.5" rx="1" />
            <rect x="3.5" y="16" width="12.5" height="4.5" rx="1" />
        </>,
    ),
    line: createContentIcon(
        'MinimalLine',
        <>
            <path d="M3.5 16.5l5 -6l4.5 3.5l7.5 -8.5" fill="none" />
        </>,
    ),
    area: createContentIcon(
        'MinimalArea',
        <>
            <path d="M3.5 20.5v-6.5l5 -5.5l4.5 3.5l7.5 -8v16.5z" />
        </>,
    ),
    mixed: createContentIcon(
        'MinimalMixed',
        <>
            <path d="M3.5 8l5 -3.5l4.5 3l7.5 -3.5" fill="none" />
            <rect x="3.5" y="14.5" width="4.5" height="6" rx="1" />
            <rect x="9.75" y="11.5" width="4.5" height="9" rx="1" />
            <rect x="16" y="13" width="4.5" height="7.5" rx="1" />
        </>,
    ),
    scatter: createContentIcon(
        'MinimalScatter',
        <>
            <circle cx="7" cy="16.5" r="2.75" />
            <circle cx="12.5" cy="9.5" r="2.25" />
            <circle cx="18.25" cy="5.5" r="2" />
        </>,
    ),
    pie: createContentIcon(
        'MinimalPie',
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5v8.5h8.5" fill="none" />
        </>,
    ),
    bigNumber: createContentIcon(
        'MinimalBigNumber',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M10.5 9.5l2.5 -2v9" fill="none" />
        </>,
    ),
    funnel: createContentIcon(
        'MinimalFunnel',
        <>
            <path d="M4 4.5h16l-4.5 15h-7z" />
            <path d="M6.1 11.5h11.8" fill="none" />
        </>,
    ),
    treemap: createContentIcon(
        'MinimalTreemap',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M11 3.5v17M11 12.5h9.5" fill="none" />
        </>,
    ),
    gauge: createContentIcon(
        'MinimalGauge',
        <>
            <path d="M5.07 18.25a8 8 0 1 1 13.86 0" fill="none" />
            <path d="M12 14.25l3.5 -4.5" fill="none" />
        </>,
    ),
    map: createContentIcon(
        'MinimalMap',
        <>
            <path d="M3.5 6.5l5.5 -2.5l6 2.5l5.5 -2.5v13.5l-5.5 2.5l-6 -2.5l-5.5 2.5z" />
            <path d="M9 4v13.5M15 6.5v13.5" fill="none" />
        </>,
    ),
    sankey: createContentIcon(
        'MinimalSankey',
        <>
            <path
                d="M4 6.5c7 0 7 4 13.5 4M4 17.5c7 0 7 -4 13.5 -4"
                fill="none"
            />
            <rect x="17.5" y="7.5" width="3" height="9" rx="0.75" />
        </>,
    ),
    custom: createContentIcon(
        'MinimalCustom',
        <>
            <path
                d="M8 7.5l-4.5 4.5l4.5 4.5M16 7.5l4.5 4.5l-4.5 4.5M13.75 5l-3.5 14"
                fill="none"
            />
        </>,
    ),
    dataAppViz: createContentIcon(
        'MinimalDataAppViz',
        <>
            <path d="M3.5 7.75a1.25 1.25 0 0 1 1.25 -1.25h3.25a2.5 2.5 0 1 1 5 0h3.25a1.25 1.25 0 0 1 1.25 1.25v3.25a2.5 2.5 0 1 1 0 5v3.25a1.25 1.25 0 0 1 -1.25 1.25h-11.5a1.25 1.25 0 0 1 -1.25 -1.25z" />
        </>,
    ),
};
