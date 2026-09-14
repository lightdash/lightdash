import { type MantineThemeOverride } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import { useEffect, useMemo, type FC } from 'react';
import { type ColorScheme } from '../theme';
import { ColorSchemeContext } from './ColorSchemeContext';
import MantineBaseProvider from './MantineBaseProvider';

type Props = {
    themeOverride?: MantineThemeOverride;
    notificationsLimit?: number;
    forceColorScheme?: ColorScheme;
    /** 'test' disables transitions so timers cannot outlive jsdom teardown. */
    env?: 'default' | 'test';
    cssVariablesSelector?: string;
    getRootElement?: () => HTMLElement | undefined;
    /** Off for the SDK, which renders inside a host page it must not tag. */
    syncBodyColorMode?: boolean;
};

const MantineProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    themeOverride,
    notificationsLimit,
    forceColorScheme,
    env,
    cssVariablesSelector,
    getRootElement,
    syncBodyColorMode = true,
}) => {
    const [storedColorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
        key: 'color-scheme',
        defaultValue: 'light',
    });

    const colorScheme = forceColorScheme ?? storedColorScheme;

    const colorSchemeContextValue = useMemo(
        () => ({
            colorScheme,
            // Pass a plain value: @mantine/hooks useLocalStorage's functional
            // updater is impure (writes storage inside the updater) and
            // double-toggles under StrictMode.
            toggleColorScheme: () => {
                if (forceColorScheme) return;
                setColorScheme(colorScheme === 'dark' ? 'light' : 'dark');
            },
        }),
        [colorScheme, forceColorScheme, setColorScheme],
    );

    useEffect(() => {
        if (!syncBodyColorMode) return;
        document.body.dataset.colorMode = colorScheme;
    }, [colorScheme, syncBodyColorMode]);

    return (
        <ColorSchemeContext.Provider value={colorSchemeContextValue}>
            <MantineBaseProvider
                forceColorScheme={colorScheme}
                themeOverride={themeOverride}
                env={env}
                cssVariablesSelector={cssVariablesSelector}
                getRootElement={getRootElement}
            >
                {children}
                <Notifications
                    limit={notificationsLimit}
                    notificationMaxHeight={480}
                />
            </MantineBaseProvider>
        </ColorSchemeContext.Provider>
    );
};

export default MantineProvider;
