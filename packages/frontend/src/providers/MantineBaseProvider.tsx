import {
    MantineProvider as MantineProviderBase,
    mergeThemeOverrides,
    type MantineThemeOverride,
} from '@mantine/core';
import { useContext, useMemo, type FC } from 'react';
import { getMantineThemeOverride } from '../theme';
import { cssVariablesResolver } from '../theme/cssVariablesResolver';
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

const MantineBaseProvider: FC<React.PropsWithChildren<Props>> = ({
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
        () => getMantineThemeOverride(resolvedColorScheme),
        [resolvedColorScheme],
    );
    // Deep merge so a partial override (e.g. the SDK's `other.tableFont`)
    // doesn't wipe out sibling keys of nested theme objects.
    const mergedTheme = useMemo(
        () =>
            themeOverride
                ? mergeThemeOverrides(baseTheme, themeOverride)
                : baseTheme,
        [baseTheme, themeOverride],
    );

    return (
        <MantineProviderBase
            theme={mergedTheme}
            forceColorScheme={resolvedColorScheme}
            cssVariablesResolver={cssVariablesResolver}
            cssVariablesSelector={cssVariablesSelector}
            getRootElement={getRootElement}
            env={env}
            withCssVariables={withCssVariables}
        >
            <CodeHighlightProvider>{children}</CodeHighlightProvider>
        </MantineProviderBase>
    );
};

export default MantineBaseProvider;
