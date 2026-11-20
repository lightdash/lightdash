import { type IconProps } from '@tabler/icons-react';
import { createElement, forwardRef, type ReactNode } from 'react';

// Same prop contract as a Tabler icon, so the result drops into MantineIcon and IconBox.
export const createContentIcon = (displayName: string, children: ReactNode) => {
    const ContentIcon = forwardRef<SVGSVGElement, IconProps>(
        (
            { size = 24, stroke = 2, color = 'currentColor', title, ...rest },
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
                    ...rest,
                },
                title ? createElement('title', null, title) : null,
                children,
            ),
    );
    ContentIcon.displayName = displayName;
    return ContentIcon;
};
