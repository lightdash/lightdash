import { createContext, useContext } from 'react';
import { type ColorScheme } from '../theme';

type ColorSchemeContextValue = {
    colorScheme: ColorScheme;
    toggleColorScheme: () => void;
};

export const ColorSchemeContext = createContext<ColorSchemeContextValue | null>(
    null,
);

/** App-level colour scheme. Unlike Mantine's useMantineColorScheme, this reads
 *  the persisted app scheme even inside a provider that forces another scheme
 *  (e.g. the navbar's forced-dark subtree), and exposes the only writer. */
export const useAppColorScheme = (): ColorSchemeContextValue => {
    const context = useContext(ColorSchemeContext);
    if (!context) {
        throw new Error(
            'useAppColorScheme must be used within MantineProvider',
        );
    }
    return context;
};
