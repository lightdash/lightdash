import {
    type ActionIconVariant,
    type ButtonVariant,
    type DefaultMantineColor,
    type MantineColorsTuple,
    type MantineThemeOverride,
} from '@mantine-8/core';
import { type ColorScheme } from '@mantine/styles';
import { actionsComponents } from './mantine8Theme/components/actions';
import { dataDisplayComponents } from './mantine8Theme/components/dataDisplay';
import { feedbackComponents } from './mantine8Theme/components/feedback';
import { inputsComponents } from './mantine8Theme/components/inputs';
import { navigationComponents } from './mantine8Theme/components/navigation';
import { textComponents } from './mantine8Theme/components/text';
import { accent, getThemeTokens } from './mantine8Theme/tokens';
import { getMantineThemeOverride as getMantine6ThemeOverride } from './mantineTheme';

declare module '@mantine-8/core' {
    interface AccordionProps {
        transparentActiveItem?: boolean;
    }

    interface ActionIconProps {
        variant?: ActionIconVariant | 'quiet' | 'raised';
    }

    interface ButtonProps {
        variant?: ButtonVariant | 'compact-outline' | 'dark' | 'raised';
    }

    interface LoaderProps {
        delayedMessage?: string;
    }

    interface MantineThemeColorsOverride {
        colors: Record<ExtendedCustomColors, MantineColorsTuple>;
    }

    interface PaperProps {
        variant?: 'dotted' | 'glass' | 'panel';
    }
}

type ExtendedCustomColors =
    | 'accent'
    | 'ldDark'
    | 'ldGray'
    | DefaultMantineColor;

export const getMantine8ThemeOverride = (
    colorScheme: ColorScheme,
    overrides: Partial<MantineThemeOverride> = {},
) => {
    const { colors, components, ...legacyTheme } =
        getMantine6ThemeOverride(colorScheme);
    const { Button: _Button, ...legacyComponentsTheme } = components;
    const themeTokens = getThemeTokens(colorScheme);
    const {
        colors: overrideColors,
        components: overrideComponents,
        shadows: overrideShadows,
        spacing: overrideSpacing,
        ...overrideTheme
    } = overrides;

    return {
        ...legacyTheme,
        ...themeTokens,
        ...overrideTheme,
        colors: {
            ...colors,
            accent,
            ...overrideColors,
        },
        shadows: {
            ...legacyTheme.shadows,
            ...themeTokens.shadows,
            ...overrideShadows,
        },
        spacing: {
            ...legacyTheme.spacing,
            xxs: '0.125rem',
            emptySpace: '6rem',
            ...overrideSpacing,
        },
        components: {
            ...legacyComponentsTheme,
            ...textComponents,
            ...actionsComponents,
            ...inputsComponents,
            ...dataDisplayComponents,
            ...feedbackComponents,
            ...navigationComponents,
            ...overrideComponents,
        },
    } satisfies MantineThemeOverride;
};
