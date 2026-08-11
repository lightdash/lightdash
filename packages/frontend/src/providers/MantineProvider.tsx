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
};

const MantineProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    themeOverride,
    notificationsLimit,
    forceColorScheme,
    env,
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
        document.body.dataset.colorMode = colorScheme;
    }, [colorScheme]);

    return (
        <ColorSchemeContext.Provider value={colorSchemeContextValue}>
            <MantineBaseProvider
                forceColorScheme={colorScheme}
                themeOverride={themeOverride}
                env={env}
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
