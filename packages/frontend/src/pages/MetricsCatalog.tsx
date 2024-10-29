import { type FC } from 'react';
import { Provider } from 'react-redux';
import Page from '../components/common/Page/Page';
import { MetricsCatalogPanel } from '../features/metricsCatalog';
import { store } from '../features/sqlRunner/store';

const MetricsCatalog: FC = () => {
    return (
        <Provider store={store}>
            <Page
                withFitContent
                withPaddedContent
                withRightSidebar
                withLargeContent
            >
                <MetricsCatalogPanel />
            </Page>
        </Provider>
    );
};

export default MetricsCatalog;
