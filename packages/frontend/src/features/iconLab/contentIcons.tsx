import { type IconProps } from '@tabler/icons-react';
import { forwardRef, type ReactNode } from 'react';

// Hand-drawn on a 24 grid with the Tabler prop contract, so they drop into MantineIcon and IconBox.
const createContentIcon = (displayName: string, children: ReactNode) => {
    const ContentIcon = forwardRef<SVGSVGElement, IconProps>(
        (
            { size = 24, stroke = 2, color = 'currentColor', title, ...rest },
            ref,
        ) => (
            <svg
                ref={ref}
                xmlns="http://www.w3.org/2000/svg"
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...rest}
            >
                {title ? <title>{title}</title> : null}
                {children}
            </svg>
        ),
    );
    ContentIcon.displayName = displayName;
    return ContentIcon;
};

// Solid shapes opt out of the stroke and of the tint IconBox puts on the svg root.
const solid = { fill: 'currentColor', fillOpacity: 1, stroke: 'none' };
const soft = { fill: 'currentColor', fillOpacity: 0.4, stroke: 'none' };

/* A: outline, rebalanced */
export const DashboardOutline = createContentIcon(
    'DashboardOutline',
    <>
        <rect x="3.5" y="3.5" width="17" height="6.5" rx="2" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>,
);

export const TableOutline = createContentIcon(
    'TableOutline',
    <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
        <path d="M3.5 9.5h17M3.5 15h17M9.5 9.5v11" />
    </>,
);

/* B: outline with one solid accent */
export const DashboardAccent = createContentIcon(
    'DashboardAccent',
    <>
        <rect x="3.5" y="3.5" width="7.5" height="17" rx="2.25" />
        <rect x="14" y="3.5" width="6.5" height="6.5" rx="2.25" {...solid} />
        <rect x="14" y="3.5" width="6.5" height="6.5" rx="2.25" />
        <rect x="14" y="13.5" width="6.5" height="7" rx="2.25" />
    </>,
);

export const TableAccent = createContentIcon(
    'TableAccent',
    <>
        <path d="M3.5 9.5v-3a3 3 0 0 1 3 -3h11a3 3 0 0 1 3 3v3z" {...solid} />
        <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
        <path d="M3.5 9.5h17M3.5 15h17M12 9.5v11" />
    </>,
);

/* C: solid duotone bento */
export const DashboardBento = createContentIcon(
    'DashboardBento',
    <>
        <rect x="3" y="3" width="8" height="18" rx="2.5" {...solid} />
        <rect x="13" y="3" width="8" height="7" rx="2.5" {...soft} />
        <rect x="13" y="12" width="8" height="9" rx="2.5" {...soft} />
    </>,
);

export const TableBento = createContentIcon(
    'TableBento',
    <>
        <rect x="3" y="3" width="18" height="5.5" rx="2" {...solid} />
        <rect x="3" y="10.25" width="7" height="4.5" rx="1.5" {...soft} />
        <rect
            x="11.75"
            y="10.25"
            width="9.25"
            height="4.5"
            rx="1.5"
            {...soft}
        />
        <rect x="3" y="16.5" width="7" height="4.5" rx="1.5" {...soft} />
        <rect x="11.75" y="16.5" width="9.25" height="4.5" rx="1.5" {...soft} />
    </>,
);

/* D: solid pinwheel, the current dashboard idea redrawn */
export const DashboardPinwheel = createContentIcon(
    'DashboardPinwheel',
    <>
        <rect x="3" y="3" width="8" height="11" rx="2.25" {...solid} />
        <rect x="3" y="16" width="8" height="5" rx="2.25" {...soft} />
        <rect x="13" y="3" width="8" height="5" rx="2.25" {...soft} />
        <rect x="13" y="10" width="8" height="11" rx="2.25" {...solid} />
    </>,
);

export const TableSheet = createContentIcon(
    'TableSheet',
    <>
        <path d="M3 8.5v-2.5a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2.5z" {...solid} />
        <path d="M3 9.75h6.5v5h-6.5z" {...soft} />
        <path d="M10.75 9.75h10.25v5h-10.25z" {...soft} />
        <path d="M3 16h6.5v5h-3.5a3 3 0 0 1 -3 -3z" {...soft} />
        <path d="M10.75 16h10.25v2a3 3 0 0 1 -3 3h-7.25z" {...soft} />
    </>,
);
