import {
    MantineProvider,
    type MantineTheme,
    useMantineColorScheme,
} from '@mantine/core';
import { type FC, useMemo } from 'react';
import { Provider } from 'react-redux';
import Page from '../components/common/Page/Page';
import { MetricsCatalogPanel } from '../features/metricsCatalog';
import { MetricCatalogView } from '../features/metricsCatalog/types';
import { store } from '../features/sqlRunner/store';
import { getMantineThemeOverride } from '../mantineTheme';

type MetricsCatalogProps = {
    metricCatalogView?: MetricCatalogView;
};

const MetricsCatalog: FC<MetricsCatalogProps> = ({
    metricCatalogView = MetricCatalogView.LIST,
}) => {
    const { colorScheme } = useMantineColorScheme();
    const theme = useMemo(
        () => getMantineThemeOverride(colorScheme),
        [colorScheme],
    );

    return (
        <Provider store={store}>
            <MantineProvider
                theme={{
                    // TODO: Introduce Inter as a font in the theme globally
                    ...theme,
                    fontFamily: `Inter, ${theme.fontFamily}`,
                    components: {
                        ...theme.components,
                        Tooltip: {
                            defaultProps: {
                                openDelay: 200,
                                withinPortal: true,
                                withArrow: true,
                                multiline: true,
                                maw: 250,
                                fz: 'xs',
                            },
                        },
                        Popover: {
                            defaultProps: {
                                withinPortal: true,
                                radius: 'md',
                                shadow: 'sm',
                            },
                        },
                        Paper: {
                            defaultProps: {
                                radius: 'md',
                                shadow: 'subtle',
                                withBorder: true,
                                sx: (t: MantineTheme) => ({
                                    '&[data-with-border]': {
                                        border: `1px solid ${t.colors.ldGray[2]}`,
                                    },
                                }),
                            },
                        },
                    },
                }}
            >
                <Page
                    withCenteredRoot
                    withCenteredContent
                    withXLargePaddedContent
                    withLargeContent
                >
                    <MetricsCatalogPanel
                        metricCatalogView={metricCatalogView}
                    />
                </Page>
            </MantineProvider>
        </Provider>
    );
};

export default MetricsCatalog;
