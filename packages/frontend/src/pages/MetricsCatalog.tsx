import { type FC } from 'react';
import { Provider } from 'react-redux';
import Page from '../components/common/Page/Page';
import { MetricsCatalogPanel } from '../features/metricsCatalog';
import { MetricCatalogView } from '../features/metricsCatalog/types';
import { store } from '../features/sqlRunner/store';

type MetricsCatalogProps = {
    metricCatalogView?: MetricCatalogView;
};

const MetricsCatalog: FC<MetricsCatalogProps> = ({
    metricCatalogView = MetricCatalogView.LIST,
}) => {
    return (
        <Provider store={store}>
            <Page
                withCenteredRoot
                withCenteredContent
                withXLargePaddedContent
                withLargeContent
            >
                <MetricsCatalogPanel metricCatalogView={metricCatalogView} />
            </Page>
        </Provider>
    );
};

export default MetricsCatalog;
