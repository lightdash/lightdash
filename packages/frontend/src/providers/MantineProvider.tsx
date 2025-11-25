import {
    type ColorScheme,
    ColorSchemeProvider,
    MantineProvider as MantineProviderBase,
    type MantineThemeOverride,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { type FC, useEffect, useMemo } from 'react';

import { useLocalStorage } from '@mantine-8/hooks';
import { getMantineThemeOverride } from '../mantineTheme';

type Props = {
    withGlobalStyles?: boolean;
    withNormalizeCSS?: boolean;
    withCSSVariables?: boolean;
    theme?: MantineThemeOverride;
    themeOverride?: MantineThemeOverride;
    notificationsLimit?: number;
};

const MantineProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    withGlobalStyles = false,
    withNormalizeCSS = false,
    withCSSVariables = false,

    themeOverride = {},
    notificationsLimit,
}) => {
    const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
        key: 'color-scheme',
        defaultValue: 'light',
    });

    const theme = useMemo(
        () => getMantineThemeOverride(colorScheme),
        [colorScheme],
    );

    const toggleColorScheme = (value?: ColorScheme) => {
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

                <Notifications limit={notificationsLimit} />
            </MantineProviderBase>
        </ColorSchemeProvider>
    );
};

export default MantineProvider;
