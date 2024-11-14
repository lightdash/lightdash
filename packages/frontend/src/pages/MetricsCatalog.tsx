import { MantineProvider } from '@mantine/core';
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
