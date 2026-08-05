import type {
    ButtonVariant,
    DefaultMantineColor,
    MantineColorsTuple,
} from '@mantine/core';
import type { LD_FIELD_COLORS } from './fieldColors';

type ExtendedCustomColors =
    | 'ldGray'
    | 'ldDark'
    | 'ldBrandGray'
    | 'ldBrandViolet'
    | DefaultMantineColor;

declare module '@mantine/core' {
    export interface AccordionProps {
        // When true, the active item won't get the variant's filled background.
        transparentActiveItem?: boolean;
    }

    export interface ButtonProps {
        variant?: ButtonVariant | 'compact-outline' | 'dark';
    }

    export interface PaperProps {
        variant?: 'dotted';
    }

    export interface LoaderProps {
        /**
         * Displays a message after 8s. Only available when type='dots'
         */
        delayedMessage?: string;
    }

    export interface MantineThemeColorsOverride {
        colors: Record<ExtendedCustomColors, MantineColorsTuple>;
    }

    export interface MantineThemeOther {
        transitionTimingFunction: string;
        /** In milliseconds */
        transitionDuration: number;
        chartFont: string;
        /** Only set by SDK consumers that provide a custom font */
        tableFont?: string;
        ldField: typeof LD_FIELD_COLORS;
    }
}
