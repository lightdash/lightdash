import { createContext, useContext } from 'react';

export type LightdashColorScheme = 'light' | 'dark';

type LightdashColorSchemeContextType = {
    colorScheme: LightdashColorScheme;
    toggleColorScheme: (value?: LightdashColorScheme) => void;
};

export const LightdashColorSchemeContext =
    createContext<LightdashColorSchemeContextType | null>(null);

export const useLightdashColorScheme = () => {
    const context = useContext(LightdashColorSchemeContext);
    if (!context) {
        throw new Error(
            'useLightdashColorScheme must be used within MantineProvider',
        );
    }
    return context;
};
