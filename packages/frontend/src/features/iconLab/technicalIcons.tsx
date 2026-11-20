import { type ContentIconSet } from './contentIcons';
import { createContentIcon } from './createContentIcon';

const SHARP = { linecap: 'butt', linejoin: 'miter' } as const;

/* D: technical. Square corners, mitred joins, flat line ends. */
export const TECHNICAL_ICONS: ContentIconSet = {
    dashboard: createContentIcon(
        'TechnicalDashboard',
        <>
            <rect x="3.5" y="3.5" width="17" height="6" />
            <rect x="3.5" y="12.5" width="7.5" height="8" />
            <rect x="14" y="12.5" width="6.5" height="8" />
        </>,
        SHARP,
    ),
    space: createContentIcon(
        'TechnicalSpace',
        <>
            <path d="M3.5 4.5h6l2 2.5h9v12.5h-17z" />
        </>,
        SHARP,
    ),
    dataApp: createContentIcon(
        'TechnicalDataApp',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" />
            <path d="M3.5 8.5h17" fill="none" />
            <path d="M5.75 6h1.25M8.5 6h1.25" fill="none" />
        </>,
        SHARP,
    ),
    document: createContentIcon(
        'TechnicalDocument',
        <>
            <path d="M5 3.5h9l5 5v12h-14z" />
            <path d="M14 3.5v5h5" fill="none" />
            <path d="M8 13h8M8 16.5h4.5" fill="none" />
        </>,
        SHARP,
    ),
    table: createContentIcon(
        'TechnicalTable',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" />
            <path d="M3.5 9.5h17M3.5 15h17M9.5 9.5v11" fill="none" />
        </>,
        SHARP,
    ),
    bar: createContentIcon(
        'TechnicalBar',
        <>
            <rect x="3.5" y="12" width="4.5" height="8.5" />
            <rect x="9.75" y="3.5" width="4.5" height="17" />
            <rect x="16" y="8" width="4.5" height="12.5" />
        </>,
        SHARP,
    ),
    horizontalBar: createContentIcon(
        'TechnicalHorizontalBar',
        <>
            <rect x="3.5" y="3.5" width="9" height="4.5" />
            <rect x="3.5" y="9.75" width="17" height="4.5" />
            <rect x="3.5" y="16" width="12.5" height="4.5" />
        </>,
        SHARP,
    ),
    line: createContentIcon(
        'TechnicalLine',
        <>
            <path d="M3.5 15.5l5 -6l4.5 3.5l7.5 -8.5" fill="none" />
            <path d="M3.5 20.5h17" fill="none" />
        </>,
        SHARP,
    ),
    area: createContentIcon(
        'TechnicalArea',
        <>
            <path d="M3.5 20.5v-6.5l5 -5.5l4.5 3.5l7.5 -8v16.5z" />
        </>,
        SHARP,
    ),
    mixed: createContentIcon(
        'TechnicalMixed',
        <>
            <path d="M3.5 8l5 -3.5l4.5 3l7.5 -3.5" fill="none" />
            <rect x="3.5" y="14.5" width="4.5" height="6" />
            <rect x="9.75" y="11.5" width="4.5" height="9" />
            <rect x="16" y="13" width="4.5" height="7.5" />
        </>,
        SHARP,
    ),
    scatter: createContentIcon(
        'TechnicalScatter',
        <>
            <circle cx="7" cy="16.5" r="2.75" />
            <circle cx="10.5" cy="7.5" r="2" />
            <circle cx="16.5" cy="12.5" r="2.25" />
            <circle cx="18.5" cy="5.25" r="1.75" />
        </>,
        SHARP,
    ),
    pie: createContentIcon(
        'TechnicalPie',
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5v8.5h8.5" fill="none" />
        </>,
        SHARP,
    ),
    bigNumber: createContentIcon(
        'TechnicalBigNumber',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" />
            <path d="M10 9.5l2.5 -2v9M9.75 16.5h5.5" fill="none" />
        </>,
        SHARP,
    ),
    funnel: createContentIcon(
        'TechnicalFunnel',
        <>
            <path d="M3.5 3.5h17l-5.5 17h-6z" />
            <path d="M5.28 9h13.44M7.06 14.5h9.88" fill="none" />
        </>,
        SHARP,
    ),
    treemap: createContentIcon(
        'TechnicalTreemap',
        <>
            <rect x="3.5" y="3.5" width="17" height="17" />
            <path d="M11 3.5v17M11 12.5h9.5M15.75 12.5v8" fill="none" />
        </>,
        SHARP,
    ),
    gauge: createContentIcon(
        'TechnicalGauge',
        <>
            <path d="M5.07 18.25a8 8 0 1 1 13.86 0" fill="none" />
            <path d="M12 14.25l3.5 -4.5" fill="none" />
        </>,
        SHARP,
    ),
    map: createContentIcon(
        'TechnicalMap',
        <>
            <path d="M3.5 6.5l5.5 -2.5l6 2.5l5.5 -2.5v13.5l-5.5 2.5l-6 -2.5l-5.5 2.5z" />
            <path d="M9 4v13.5M15 6.5v13.5" fill="none" />
        </>,
        SHARP,
    ),
    sankey: createContentIcon(
        'TechnicalSankey',
        <>
            <path d="M6.5 6.75h4l3 3.25h4M6.5 17.25h4l3 -3.25h4" fill="none" />
            <rect x="3.5" y="3.5" width="3" height="6.5" />
            <rect x="3.5" y="14" width="3" height="6.5" />
            <rect x="17.5" y="7.5" width="3" height="9" />
        </>,
        SHARP,
    ),
    custom: createContentIcon(
        'TechnicalCustom',
        <>
            <path
                d="M8 7.5l-4.5 4.5l4.5 4.5M16 7.5l4.5 4.5l-4.5 4.5M13.75 5l-3.5 14"
                fill="none"
            />
        </>,
        SHARP,
    ),
    dataAppViz: createContentIcon(
        'TechnicalDataAppViz',
        <>
            <path d="M3.5 6.5h4.5v-3h5v3h4.5v4.5h3v5h-3v4.5h-14z" />
        </>,
        SHARP,
    ),
};
