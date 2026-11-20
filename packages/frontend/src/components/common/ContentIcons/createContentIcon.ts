import { type IconProps } from '@tabler/icons-react';
import { createElement, forwardRef, type ReactNode } from 'react';

// "SankeyChartIcon" -> "content-icon-sankey-chart", mirroring Tabler's per-icon class.
const toClassName = (displayName: string) =>
    `content-icon content-icon-${displayName
        .replace(/Icon$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()}`;

/** Builds an icon with the same prop contract as a Tabler icon, so it drops into MantineIcon. */
export const createContentIcon = (displayName: string, children: ReactNode) => {
    const iconClassName = toClassName(displayName);
    const ContentIcon = forwardRef<SVGSVGElement, IconProps>(
        (
            {
                size = 24,
                stroke = 2,
                color = 'currentColor',
                title,
                className,
                ...rest
            },
            ref,
        ) =>
            createElement(
                'svg',
                {
                    ref,
                    xmlns: 'http://www.w3.org/2000/svg',
                    width: size,
                    height: size,
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: color,
                    strokeWidth: stroke,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                    className: className
                        ? `${iconClassName} ${className}`
                        : iconClassName,
                    ...rest,
                },
                title ? createElement('title', null, title) : null,
                children,
            ),
    );
    ContentIcon.displayName = displayName;
    return ContentIcon;
};
