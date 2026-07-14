import { useEffect, type FC } from 'react';
import { Provider } from 'react-redux';
import Page from '../components/common/Page/Page';
import useEmbed from '../ee/providers/Embed/useEmbed';
import { MetricsCatalogPanel } from '../features/metricsCatalog';
import {
    setActiveMetric,
    toggleMetricExploreModal,
} from '../features/metricsCatalog/store/metricsCatalogSlice';
import { MetricCatalogView } from '../features/metricsCatalog/types';
import { store } from '../features/sqlRunner/store';
import { useAppDispatch } from '../features/sqlRunner/store/hooks';

type MetricsCatalogProps = {
    metricCatalogView?: MetricCatalogView;
};

const MetricsCatalogContent: FC<MetricsCatalogProps> = ({
    metricCatalogView = MetricCatalogView.LIST,
}) => {
    const dispatch = useAppDispatch();
    const { embedToken } = useEmbed();

    useEffect(() => {
        // Close any open modals when leaving this page.
        return () => {
            dispatch(toggleMetricExploreModal(undefined));
            dispatch(setActiveMetric(undefined));
        };
    }, [dispatch]);

    const content = (
        <MetricsCatalogPanel metricCatalogView={metricCatalogView} />
    );

    return embedToken ? (
        content
    ) : (
        <Page withCenteredRoot withCenteredContent withXLargePaddedContent>
            {content}
        </Page>
    );
};

const MetricsCatalog: FC<MetricsCatalogProps> = ({
    metricCatalogView = MetricCatalogView.LIST,
}) => {
    return (
        <Provider store={store}>
            <MetricsCatalogContent metricCatalogView={metricCatalogView} />
        </Provider>
    );
};

export default MetricsCatalog;
