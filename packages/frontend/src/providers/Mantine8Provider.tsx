import {
    MantineProvider as MantineProviderBase,
    type MantineThemeOverride,
} from '@mantine-8/core';
import { useContext, useMemo, type FC } from 'react';
import { cssVariablesResolver } from '../mantine8CssVariablesResolver';
import { getMantine8ThemeOverride } from '../mantine8Theme';
import CodeHighlightProvider from './CodeHighlightProvider';
import { ColorSchemeContext } from './ColorSchemeContext';

type Props = {
    themeOverride?: MantineThemeOverride;
    forceColorScheme?: 'light' | 'dark';
    notificationsLimit?: number;
    cssVariablesSelector?: string;
    getRootElement?: () => HTMLElement | undefined;
    env?: 'default' | 'test';
    /** Skip emitting the CSS-variables stylesheet. For nested providers that
     * only need to fix the JS theme context (e.g. escaping the navbar's
     * forced-dark scheme) while the page-level variables stay authoritative. */
    withCssVariables?: boolean;
};

const Mantine8Provider: FC<React.PropsWithChildren<Props>> = ({
    children,
    themeOverride,
    forceColorScheme,
    cssVariablesSelector,
    getRootElement,
    env,
    withCssVariables = true,
}) => {
    // Nested mounts (e.g. escaping the navbar's forced-dark subtree) resolve
    // the ambient app scheme from context; standalone mounts default to light.
    const appColorScheme = useContext(ColorSchemeContext)?.colorScheme;
    const resolvedColorScheme = forceColorScheme || appColorScheme || 'light';
    const baseTheme = useMemo(
        () => getMantine8ThemeOverride(resolvedColorScheme),
        [resolvedColorScheme],
    );
    const mergedTheme = useMemo(
        () => (themeOverride ? { ...baseTheme, ...themeOverride } : baseTheme),
        [baseTheme, themeOverride],
    );

    return (
        <MantineProviderBase
            theme={mergedTheme}
            forceColorScheme={resolvedColorScheme}
            cssVariablesResolver={cssVariablesResolver}
            cssVariablesSelector={cssVariablesSelector}
            getRootElement={getRootElement}
            classNamesPrefix="mantine-8"
            env={env}
            withCssVariables={withCssVariables}
        >
            <CodeHighlightProvider>{children}</CodeHighlightProvider>
        </MantineProviderBase>
    );
};

export default Mantine8Provider;
