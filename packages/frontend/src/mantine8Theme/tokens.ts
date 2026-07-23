import {
    defaultVariantColorsResolver,
    rem,
    type MantineColorsTuple,
    type MantineThemeOverride,
    type VariantColorsResolver,
} from '@mantine-8/core';
import { type ColorScheme } from '@mantine/styles';

export const accent: MantineColorsTuple = [
    '#eef2ff',
    '#e0e7ff',
    '#c7d2fe',
    '#a5b4fc',
    '#818cf8',
    '#6366f1',
    '#4f46e5',
    '#4338ca',
    '#3730a3',
    '#312e81',
];

const variantColorResolver: VariantColorsResolver = (input) => {
    const resolved = defaultVariantColorsResolver(input);
    const isPrimary = !input.color || input.color === input.theme.primaryColor;

    return isPrimary && (input.variant ?? 'filled') === 'filled'
        ? {
              ...resolved,
              color: 'var(--mantine-primary-color-contrast)',
          }
        : resolved;
};

export const getThemeTokens = (
    colorScheme: ColorScheme,
): MantineThemeOverride => ({
    autoContrast: true,
    black: '#09090b',
    cursorType: 'pointer',
    defaultRadius: 'md',
    focusRing: 'auto',
    fontFamily:
        "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontFamilyMonospace:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    headings: {
        fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontWeight: '600',
        sizes: {
            h1: {
                fontSize: rem(34),
                lineHeight: '1.15',
                fontWeight: '600',
            },
            h2: {
                fontSize: rem(26),
                lineHeight: '1.2',
                fontWeight: '600',
            },
            h3: {
                fontSize: rem(20),
                lineHeight: '1.3',
                fontWeight: '600',
            },
            h4: {
                fontSize: rem(17),
                lineHeight: '1.35',
                fontWeight: '600',
            },
            h5: {
                fontSize: rem(15),
                lineHeight: '1.4',
                fontWeight: '600',
            },
            h6: {
                fontSize: rem(13),
                lineHeight: '1.45',
                fontWeight: '600',
            },
        },
    },
    luminanceThreshold: 0.4,
    primaryColor: 'ldDark',
    primaryShade: { light: 9, dark: 9 },
    radius: {
        xs: rem(5),
        sm: rem(6),
        md: rem(8),
        lg: rem(12),
        xl: rem(16),
    },
    shadows:
        colorScheme === 'dark'
            ? {
                  xs: '0 1px 2px rgba(0, 0, 0, 0.45), 0 1px 1px rgba(0, 0, 0, 0.3)',
                  sm: '0 1px 2px rgba(0, 0, 0, 0.42), 0 2px 5px rgba(0, 0, 0, 0.3), 0 4px 10px rgba(0, 0, 0, 0.2)',
                  md: '0 2px 5px rgba(0, 0, 0, 0.45), 0 5px 12px rgba(0, 0, 0, 0.32), 0 10px 24px rgba(0, 0, 0, 0.22)',
                  lg: '0 4px 10px rgba(0, 0, 0, 0.5), 0 10px 24px rgba(0, 0, 0, 0.38), 0 20px 44px rgba(0, 0, 0, 0.26)',
                  xl: '0 8px 24px rgba(0, 0, 0, 0.52), 0 18px 46px rgba(0, 0, 0, 0.4), 0 32px 70px rgba(0, 0, 0, 0.3)',
                  subtle: '0 1px 2px rgba(0, 0, 0, 0.45), 0 1px 1px rgba(0, 0, 0, 0.3)',
                  heavy: '0 4px 10px rgba(0, 0, 0, 0.5), 0 10px 24px rgba(0, 0, 0, 0.38), 0 20px 44px rgba(0, 0, 0, 0.26)',
              }
            : {
                  xs: '0 1px 2px rgba(9, 9, 11, 0.05), 0 1px 1px rgba(9, 9, 11, 0.04)',
                  sm: '0 1px 2px rgba(9, 9, 11, 0.05), 0 2px 4px rgba(9, 9, 11, 0.05), 0 4px 8px rgba(9, 9, 11, 0.03)',
                  md: '0 2px 4px rgba(9, 9, 11, 0.04), 0 4px 8px rgba(9, 9, 11, 0.05), 0 8px 16px rgba(9, 9, 11, 0.05)',
                  lg: '0 4px 8px rgba(9, 9, 11, 0.04), 0 8px 20px rgba(9, 9, 11, 0.06), 0 16px 32px rgba(9, 9, 11, 0.06)',
                  xl: '0 8px 24px rgba(9, 9, 11, 0.08), 0 16px 40px rgba(9, 9, 11, 0.08), 0 32px 64px rgba(9, 9, 11, 0.06)',
                  subtle: '0 1px 2px rgba(9, 9, 11, 0.06), 0 1px 1px rgba(9, 9, 11, 0.04)',
                  heavy: '0 4px 8px rgba(9, 9, 11, 0.04), 0 8px 20px rgba(9, 9, 11, 0.06), 0 16px 32px rgba(9, 9, 11, 0.06)',
              },
    variantColorResolver,
});

export const themeCssVariables = {
    variables: {
        '--app-control-height-xs': '30px',
        '--app-control-height-sm': '36px',
        '--app-control-height-md': '42px',
        '--app-control-height-lg': '48px',
        '--app-control-height-xl': '58px',
        '--app-ease-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
        '--app-inset-highlight': 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    },
    light: {
        '--mantine-primary-color-contrast': '#ffffff',
        '--app-bg': 'var(--mantine-color-ldGray-0)',
        '--app-surface': 'var(--mantine-color-background-0)',
        '--app-border': 'var(--mantine-color-ldGray-2)',
        '--app-border-strong': 'var(--mantine-color-ldGray-3)',
        '--app-muted': 'var(--mantine-color-ldGray-5)',
        '--app-shadow-raised':
            '0 1px 2px rgba(9, 9, 11, 0.06), 0 1px 1px rgba(9, 9, 11, 0.04)',
        '--app-shadow-raised-hover':
            '0 2px 4px rgba(9, 9, 11, 0.08), 0 1px 2px rgba(9, 9, 11, 0.05)',
        '--app-focus-ring': '0 0 0 3px rgba(9, 9, 11, 0.1)',
    },
    dark: {
        '--mantine-primary-color-contrast': '#09090b',
        '--app-bg': 'var(--mantine-color-background-0)',
        '--app-surface': 'var(--mantine-color-ldDark-1)',
        '--app-border': 'var(--mantine-color-ldDark-3)',
        '--app-border-strong': 'var(--mantine-color-ldDark-4)',
        '--app-muted': 'var(--mantine-color-ldDark-7)',
        '--app-shadow-raised':
            '0 1px 2px rgba(0, 0, 0, 0.45), 0 1px 1px rgba(0, 0, 0, 0.3)',
        '--app-shadow-raised-hover':
            '0 2px 5px rgba(0, 0, 0, 0.52), 0 1px 2px rgba(0, 0, 0, 0.38)',
        '--app-focus-ring': '0 0 0 3px rgba(255, 255, 255, 0.12)',
    },
} as const;
