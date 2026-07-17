import type { ReactNode } from 'react';

export type BorderStyle =
    | 'single'
    | 'double'
    | 'round'
    | 'bold'
    | 'singleDouble'
    | 'doubleSingle'
    | 'classic';

export type TerminalTheme = {
    name: string;
    colors: {
        primary: string;
        foreground: string;
        muted: string;
        mutedForeground: string;
        border: string;
        success: string;
        warning: string;
        error: string;
        info: string;
    };
    border: {
        style: BorderStyle;
        color: string;
    };
};

export type ThemeProviderProps = {
    children: ReactNode;
    theme?: TerminalTheme;
};
