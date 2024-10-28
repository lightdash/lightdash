import { type FC } from 'react';
import Page from '../components/common/Page/Page';
import { MetricsCatalogPanel } from '../features/metricsCatalog';

const MetricsCatalog: FC = () => {
    return (
        <Page
            withFitContent
            withPaddedContent
            withRightSidebar
            withLargeContent
        >
            <MetricsCatalogPanel />
        </Page>
    );
};

export default MetricsCatalog;
