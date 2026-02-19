import type { MantineColor, MantineSpacing } from '@mantine-8/core';
import {
    type Icon as TablerIconType,
    type TablerIconsProps,
} from '@tabler/icons-react';
import { forwardRef } from 'react';

/** Theme spacing keys we use for icons (see mantineTheme spacing). Extends MantineSpacing for autocomplete. */
export type MantineIconSize =
    | MantineSpacing
    | 'xxl'
    | '3xl'
    | '4xl'
    | '5xl'
    | '6xl'
    | '7xl'
    | '8xl'
    | '9xl'
    | number;

export interface MantineIconProps extends Omit<TablerIconsProps, 'ref'> {
    icon: TablerIconType;
    size?: MantineIconSize;
    stroke?: MantineIconSize;
    color?: MantineColor;
    fill?: MantineColor;
    display?: 'block' | 'inline' | 'none';
}

/** Mantine color keywords that map directly to --mantine-color-{name}. */
const MANTINE_KEYWORD_COLORS = new Set([
    'dimmed',
    'white',
    'black',
    'bright',
    'text',
    'body',
    'error',
    'placeholder',
    'anchor',
]);

/** Mantine tokens are bare words ("red", "dimmed") or word.shade ("ldGray.6"). */
const MANTINE_TOKEN_RE = /^[a-zA-Z]\w*(\.\d+)?$/;

/** Resolve a color to a CSS value.
 *  - Mantine tokens ("red", "ldGray.6", "dimmed") → var(--mantine-color-*).
 *  - Anything else (raw CSS: hex, var(), light-dark(), rgb…) passes through as-is.
 */
function toColorVar(color: MantineColor): string {
    const str = String(color);
    if (!MANTINE_TOKEN_RE.test(str)) return str;
    // "ldGray.6" → var(--mantine-color-ldGray-6)
    if (str.includes('.')) {
        return `var(--mantine-color-${str.replace('.', '-')})`;
    }
    // "dimmed", "white", "black" etc. → var(--mantine-color-dimmed)
    if (MANTINE_KEYWORD_COLORS.has(str)) {
        return `var(--mantine-color-${str})`;
    }
    // "red", "blue" → var(--mantine-color-red-filled) (adapts to color scheme)
    return `var(--mantine-color-${str}-filled)`;
}

function toSizeValue(size: MantineIconSize): string | number {
    return typeof size === 'string' ? `var(--mantine-spacing-${size})` : size;
}

const MantineIcon = forwardRef<SVGSVGElement, MantineIconProps>(
    (
        {
            icon: TablerIcon,
            size = 'md',
            stroke,
            color,
            fill,
            display = 'block',
            style,
            ...rest
        },
        ref,
    ) => {
        const sizeValue = toSizeValue(size);

        return (
            <TablerIcon
                ref={ref}
                aria-hidden
                display={display}
                {...rest}
                style={{
                    display,
                    width: sizeValue,
                    height: sizeValue,
                    ...(color && { color: toColorVar(color) }),
                    ...(fill && { fill: toColorVar(fill) }),
                    ...(typeof stroke === 'string' && {
                        strokeWidth: `var(--mantine-spacing-${stroke})`,
                    }),
                    ...(typeof stroke === 'number' && {
                        strokeWidth: stroke,
                    }),
                    ...style,
                }}
            />
        );
    },
);

export default MantineIcon;
