import { FC } from 'react';
import { useExplorer } from '../../providers/ExplorerProvider';
import UnderlyingDataModal from '../UnderlyingData/UnderlyingDataModal';
import UnderlyingDataProvider from '../UnderlyingData/UnderlyingDataProvider';
import { ExplorerWrapper } from './Explorer.styles';
import ExplorerHeader from './ExplorerHeader';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC = () => {
    const {
        state: { unsavedChartVersion },
    } = useExplorer();
    return (
        <ExplorerWrapper>
            <ExplorerHeader />
            <FiltersCard />
            <UnderlyingDataProvider
                filters={unsavedChartVersion.metricQuery.filters}
                tableName={unsavedChartVersion.tableName}
            >
                <VisualizationCard />
                <UnderlyingDataModal />
            </UnderlyingDataProvider>

            <ResultsCard />
            <SqlCard />
        </ExplorerWrapper>
    );
};

export default Explorer;
