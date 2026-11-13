import { type HealthState } from '@lightdash/common';
import { type MantineThemeOverride } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import { defaultContext } from '@tanstack/react-query';
import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useSyncExternalStore,
    type FC,
} from 'react';
import {
    isColorSchemePreference,
    type ColorScheme,
    type ColorSchemePreference,
} from '../theme';
import { ColorSchemeContext } from './ColorSchemeContext';
import MantineBaseProvider from './MantineBaseProvider';
import styles from './MantineProvider.module.css';
import { useResolvedColorScheme } from './useResolvedColorScheme';

// Older builds read `color-scheme` and only understand light|dark, so the
// resolved scheme keeps living there and the preference gets its own key.
const RESOLVED_SCHEME_STORAGE_KEY = 'color-scheme';
const PREFERENCE_STORAGE_KEY = 'color-scheme-preference';

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

const noopUnsubscribe = () => {};

const useIsSignedOut = () => {
    const queryClient = useContext(defaultContext);
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            if (!queryClient) return noopUnsubscribe;
            return queryClient.getQueryCache().subscribe(onStoreChange);
        },
        [queryClient],
    );
    const getSnapshot = () => {
        const health = queryClient?.getQueryData<HealthState>(['health']);
        return health?.isAuthenticated === false;
    };
    return useSyncExternalStore(subscribe, getSnapshot);
};

const AppNotifications: FC<{ limit?: number }> = ({ limit }) => {
    const isSignedOut = useIsSignedOut();
    return (
        <Notifications
            limit={limit}
            notificationMaxHeight={480}
            classNames={{
                root: isSignedOut
                    ? `${styles.notificationsRoot} ${styles.signedOut}`
                    : styles.notificationsRoot,
            }}
        />
    );
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
    const [storedScheme, setStoredScheme] = useLocalStorage<ColorScheme>({
        key: RESOLVED_SCHEME_STORAGE_KEY,
        defaultValue: 'light',
        getInitialValueInEffect: false,
    });
    const [storedPreference, setStoredPreference] =
        useLocalStorage<ColorSchemePreference>({
            key: PREFERENCE_STORAGE_KEY,
            defaultValue: storedScheme,
            getInitialValueInEffect: false,
        });
    const storedColorSchemePreference = isColorSchemePreference(
        storedPreference,
    )
        ? storedPreference
        : 'light';

    const colorSchemePreference =
        forceColorScheme ?? storedColorSchemePreference;
    const colorScheme = useResolvedColorScheme(colorSchemePreference);

    useEffect(() => {
        if (forceColorScheme || storedScheme === colorScheme) return;
        setStoredScheme(colorScheme);
    }, [colorScheme, forceColorScheme, setStoredScheme, storedScheme]);

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
                <AppNotifications limit={notificationsLimit} />
            </MantineBaseProvider>
        </ColorSchemeContext.Provider>
    );
};

export default MantineProvider;
