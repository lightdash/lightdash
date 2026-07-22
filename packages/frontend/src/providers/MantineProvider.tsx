import { useLocalStorage } from '@mantine-8/hooks';
import { Notifications } from '@mantine-8/notifications';
import {
    ColorSchemeProvider,
    MantineProvider as MantineProviderBase,
    type ColorScheme,
    type MantineThemeOverride,
} from '@mantine/core';
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
};

const MantineProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    withGlobalStyles = false,
    withNormalizeCSS = false,
    withCSSVariables = false,

    themeOverride = {},
    notificationsLimit,
    forceColorScheme,
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
        document.body.dataset.colorMode = colorScheme;
    }, [colorScheme]);

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

                {/* Notifications is a Mantine 8 component, so it needs the v8 provider context */}
                <Mantine8Provider>
                    <Notifications limit={notificationsLimit} />
                </Mantine8Provider>
            </MantineProviderBase>
        </ColorSchemeProvider>
    );
};

export default MantineProvider;
