import { type MantineThemeOverride } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import { useEffect, useMemo, type FC } from 'react';
import { type ColorSchemePreference } from '../theme';
import { ColorSchemeContext } from './ColorSchemeContext';
import MantineBaseProvider from './MantineBaseProvider';
import {
    isColorSchemePreference,
    useResolvedColorScheme,
} from './useSystemColorScheme';

const COLOR_SCHEME_STORAGE_KEY = 'color-scheme';

type Props = {
    themeOverride?: MantineThemeOverride;
    notificationsLimit?: number;
    /** Pins the scheme and disables the stored preference; `system` follows the OS. */
    forceColorScheme?: ColorSchemePreference;
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
    const [storedPreference, setStoredPreference] =
        useLocalStorage<ColorSchemePreference>({
            key: COLOR_SCHEME_STORAGE_KEY,
            defaultValue: 'light',
        });
    // Guard against hand-edited or legacy storage values.
    const storedColorSchemePreference = isColorSchemePreference(
        storedPreference,
    )
        ? storedPreference
        : 'light';

    const colorSchemePreference =
        forceColorScheme ?? storedColorSchemePreference;
    const colorScheme = useResolvedColorScheme(colorSchemePreference);

    const colorSchemeContextValue = useMemo(
        () => ({
            colorScheme,
            colorSchemePreference,
            setColorSchemePreference: (preference: ColorSchemePreference) => {
                if (forceColorScheme) return;
                setStoredPreference(preference);
            },
        }),
        [
            colorScheme,
            colorSchemePreference,
            forceColorScheme,
            setStoredPreference,
        ],
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
