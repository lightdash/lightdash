import { type MantineThemeOverride } from '@mantine-8/core';
import { useLocalStorage } from '@mantine-8/hooks';
import { Notifications } from '@mantine-8/notifications';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import {
    LightdashColorSchemeContext,
    type LightdashColorScheme,
} from './LightdashColorSchemeContext';
import Mantine8Provider from './Mantine8Provider';

type Props = {
    themeOverride?: MantineThemeOverride;
    notificationsLimit?: number;
    forceColorScheme?: LightdashColorScheme;
};

const MantineProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    themeOverride,
    notificationsLimit,
    forceColorScheme,
}) => {
    const [storedColorScheme, setColorScheme] =
        useLocalStorage<LightdashColorScheme>({
            key: 'color-scheme',
            defaultValue: 'light',
        });

    const colorScheme = forceColorScheme ?? storedColorScheme;

    const toggleColorScheme = useCallback(
        (value?: LightdashColorScheme) => {
            if (forceColorScheme) return;
            setColorScheme(
                value || (colorScheme === 'dark' ? 'light' : 'dark'),
            );
        },
        [colorScheme, forceColorScheme, setColorScheme],
    );

    const colorSchemeContext = useMemo(
        () => ({ colorScheme, toggleColorScheme }),
        [colorScheme, toggleColorScheme],
    );

    useEffect(() => {
        document.body.dataset.colorMode = colorScheme;
    }, [colorScheme]);

    return (
        <LightdashColorSchemeContext.Provider value={colorSchemeContext}>
            <Mantine8Provider
                forceColorScheme={colorScheme}
                themeOverride={themeOverride}
            >
                {children}
                <Notifications limit={notificationsLimit} />
            </Mantine8Provider>
        </LightdashColorSchemeContext.Provider>
    );
};

export default MantineProvider;
