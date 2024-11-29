import { MantineProvider, type MantineTheme } from '@mantine/core';
import { type FC } from 'react';
import { Provider } from 'react-redux';
import Page from '../components/common/Page/Page';
import { MetricsCatalogPanel } from '../features/metricsCatalog';
import { store } from '../features/sqlRunner/store';
import { getMantineThemeOverride } from '../mantineTheme';

const MetricsCatalog: FC = () => {
    return (
        <Provider store={store}>
            <MantineProvider
                theme={{
                    // TODO: Introduce Inter as a font in the theme globally
                    ...getMantineThemeOverride(),
                    fontFamily: `Inter, ${
                        getMantineThemeOverride().fontFamily
                    }`,
                    components: {
                        ...getMantineThemeOverride().components,
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
                                sx: (theme: MantineTheme) => ({
                                    '&[data-with-border]': {
                                        border: `1px solid ${theme.colors.gray[2]}`,
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
                    backgroundColor="#FAFAFA"
                >
                    <MetricsCatalogPanel />
                </Page>
            </MantineProvider>
        </Provider>
    );
};

export default MetricsCatalog;
