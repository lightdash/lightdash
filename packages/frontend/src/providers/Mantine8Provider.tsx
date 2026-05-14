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
    themeOverride,
    forceColorScheme,
    cssVariablesSelector,
    getRootElement,
}) => {
    const { colorScheme } = useMantineColorScheme();
    const effectiveColorScheme = forceColorScheme || colorScheme;
    const baseTheme = useMemo(
        () => getMantine8ThemeOverride(effectiveColorScheme),
        [effectiveColorScheme],
    );
    const mergedTheme = useMemo(
        () => (themeOverride ? { ...baseTheme, ...themeOverride } : baseTheme),
        [baseTheme, themeOverride],
    );
    const resolvedColorScheme = forceColorScheme || colorScheme;

    return (
        <MantineProviderBase
            theme={mergedTheme}
            forceColorScheme={resolvedColorScheme}
            cssVariablesSelector={cssVariablesSelector}
            getRootElement={getRootElement}
            classNamesPrefix="mantine-8"
        >
            {children}
        </MantineProviderBase>
    );
};

export default Mantine8Provider;
