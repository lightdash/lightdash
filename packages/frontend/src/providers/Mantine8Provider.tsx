import {
    MantineProvider as MantineProviderBase,
    type MantineThemeOverride,
} from '@mantine-8/core';
import { useContext, useMemo, type FC } from 'react';
import { cssVariablesResolver } from '../mantine8CssVariablesResolver';
import { getMantine8ThemeOverride } from '../mantine8Theme';
import CodeHighlightProvider from './CodeHighlightProvider';
import {
    LightdashColorSchemeContext,
    type LightdashColorScheme,
} from './LightdashColorSchemeContext';

type Props = {
    themeOverride?: MantineThemeOverride;
    forceColorScheme?: LightdashColorScheme;
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
    const colorSchemeContext = useContext(LightdashColorSchemeContext);
    const colorScheme = colorSchemeContext?.colorScheme ?? 'light';
    const effectiveColorScheme = forceColorScheme || colorScheme;
    const baseTheme = useMemo(
        () => getMantine8ThemeOverride(effectiveColorScheme),
        [effectiveColorScheme],
    );
    const mergedTheme = useMemo(
        () => (themeOverride ? { ...baseTheme, ...themeOverride } : baseTheme),
        [baseTheme, themeOverride],
    );
    return (
        <MantineProviderBase
            theme={mergedTheme}
            forceColorScheme={effectiveColorScheme}
            cssVariablesResolver={cssVariablesResolver}
            cssVariablesSelector={cssVariablesSelector}
            getRootElement={getRootElement}
            classNamesPrefix="mantine-8"
        >
            <CodeHighlightProvider>{children}</CodeHighlightProvider>
        </MantineProviderBase>
    );
};

export default Mantine8Provider;
