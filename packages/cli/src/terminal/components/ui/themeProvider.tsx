import { createContext, useContext } from 'react';
import { defaultTheme } from '../../themes/defaultTheme';
import type { TerminalTheme, ThemeProviderProps } from './types';

const ThemeContext = createContext<TerminalTheme>(defaultTheme);

export const ThemeProvider = ({
    children,
    theme = defaultTheme,
}: ThemeProviderProps) => (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
);

export const useTheme = (): TerminalTheme => useContext(ThemeContext);
