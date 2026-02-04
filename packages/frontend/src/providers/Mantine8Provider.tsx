import {
    MantineProvider as MantineProviderBase,
    type MantineThemeOverride,
} from '@mantine-8/core';
import { useMantineColorScheme } from '@mantine/core';
import { useMemo, type FC } from 'react';

import { getMantine8ThemeOverride } from '../mantine8Theme';

type Props = {
    themeOverride?: MantineThemeOverride;
    forceColorScheme?: 'light' | 'dark';
    notificationsLimit?: number;
    cssVariablesSelector?: string;
    getRootElement?: () => HTMLElement | undefined;
};

const Mantine8Provider: FC<React.PropsWithChildren<Props>> = ({
    children,
    themeOverride = {},
    forceColorScheme,
    cssVariablesSelector,
    getRootElement,
}) => {
    const { colorScheme } = useMantineColorScheme();
    // Use forceColorScheme for theme building when provided, otherwise use parent's colorScheme
    const effectiveColorScheme = forceColorScheme || colorScheme;
    const theme = useMemo(
        () => getMantine8ThemeOverride(effectiveColorScheme),
        [effectiveColorScheme],
    );

    return (
        <MantineProviderBase
            theme={{ ...theme, ...themeOverride }}
            forceColorScheme={forceColorScheme || colorScheme}
            cssVariablesSelector={cssVariablesSelector}
            getRootElement={getRootElement}
            classNamesPrefix="mantine-8"
        >
            {children}
        </MantineProviderBase>
    );
};

export default Mantine8Provider;
