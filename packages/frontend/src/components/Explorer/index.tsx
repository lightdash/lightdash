import { FC, memo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { Context } from '../../providers/ExplorerProvider';
import UnderlyingDataModal from '../UnderlyingData/UnderlyingDataModal';
import UnderlyingDataProvider from '../UnderlyingData/UnderlyingDataProvider';
import { ExplorerWrapper } from './Explorer.styles';
import ExplorerHeader from './ExplorerHeader';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC = memo(() => {
    const unsavedChartVersionTableName = useContextSelector(
        Context,
        (context) => context!.state.unsavedChartVersion.tableName,
    );
    const unsavedChartVersionFilters = useContextSelector(
        Context,
        (context) => context!.state.unsavedChartVersion.metricQuery.filters,
    );
    return (
        <ExplorerWrapper>
            <ExplorerHeader />
            <FiltersCard />
            <UnderlyingDataProvider
                filters={unsavedChartVersionFilters}
                tableName={unsavedChartVersionTableName}
            >
                <VisualizationCard />
                <UnderlyingDataModal />
            </UnderlyingDataProvider>
            <ResultsCard />
            <SqlCard />
        </ExplorerWrapper>
    );
});

export default Explorer;
