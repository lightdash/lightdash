import { useLocalStorage } from '@mantine-8/hooks';
import {
    ColorSchemeProvider,
    MantineProvider as MantineProviderBase,
    type ColorScheme,
    type MantineThemeOverride,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { useEffect, useMemo, type FC } from 'react';
import { getMantineThemeOverride } from '../mantineTheme';
import Mantine8Provider from './Mantine8Provider';

type Props = {
    withGlobalStyles?: boolean;
    withNormalizeCSS?: boolean;
    withCSSVariables?: boolean;
    theme?: MantineThemeOverride;
    themeOverride?: MantineThemeOverride;
    notificationsLimit?: number;
    forceColorScheme?: ColorScheme;
    setBodyColorMode?: boolean;
};

const MantineProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    withGlobalStyles = false,
    withNormalizeCSS = false,
    withCSSVariables = false,

    themeOverride = {},
    notificationsLimit,
    forceColorScheme,
    setBodyColorMode = true,
}) => {
    const [storedColorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
        key: 'color-scheme',
        defaultValue: 'light',
    });

    const colorScheme = forceColorScheme ?? storedColorScheme;

    const theme = useMemo(
        () => getMantineThemeOverride(colorScheme),
        [colorScheme],
    );

    const toggleColorScheme = (value?: ColorScheme) => {
        if (forceColorScheme) return;
        setColorScheme(value || (colorScheme === 'dark' ? 'light' : 'dark'));
    };

    useEffect(() => {
        if (!setBodyColorMode) return;
        document.body.dataset.colorMode = colorScheme;
    }, [colorScheme, setBodyColorMode]);

    return (
        <ColorSchemeProvider
            colorScheme={colorScheme}
            toggleColorScheme={toggleColorScheme}
        >
            <MantineProviderBase
                withGlobalStyles={withGlobalStyles}
                withNormalizeCSS={withNormalizeCSS}
                withCSSVariables={withCSSVariables}
                theme={{
                    ...theme,
                    ...themeOverride,
                }}
            >
                {children}

                {/* Wrap Notifications in Mantine8Provider so stacked toasts (e.g. MultipleToastBody) have Mantine 8 context */}
                {/* TODO: Fix this to not rely on Mantine8Provider once migration is complete */}
                <Mantine8Provider>
                    <Notifications limit={notificationsLimit} />
                </Mantine8Provider>
            </MantineProviderBase>
        </ColorSchemeProvider>
    );
};

export default MantineProvider;
