import { FeatureFlags } from '@lightdash/common';
import { type FC } from 'react';
import { Navigate, useParams } from 'react-router';
import { MetricCatalogView } from '../features/metricsCatalog/types';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import MetricsCatalog from './MetricsCatalog';

const MetricsTree: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedMetricsTreeFlag, isLoading } = useServerFeatureFlag(
        FeatureFlags.SavedMetricsTree,
    );

    if (isLoading) {
        return null;
    }

    if (!savedMetricsTreeFlag?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/metrics`} replace />;
    }

    return <MetricsCatalog metricCatalogView={MetricCatalogView.TREE} />;
};

export default MetricsTree;
