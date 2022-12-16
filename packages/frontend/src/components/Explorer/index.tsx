import { FC, memo } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import ExplorerHeader from './ExplorerHeader';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC = memo(() => {
    const unsavedChartVersionTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const unsavedChartVersionMetricQuery = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery,
    );
    return (
        <MetricQueryDataProvider
            metricQuery={unsavedChartVersionMetricQuery}
            tableName={unsavedChartVersionTableName}
        >
            <ExplorerHeader />
            <FiltersCard />
            <VisualizationCard />
            <ResultsCard />
            <SqlCard />
            <UnderlyingDataModal />
        </MetricQueryDataProvider>
    );
});

export default Explorer;
