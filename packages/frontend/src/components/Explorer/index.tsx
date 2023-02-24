import { FC, memo } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../providers/AppProvider';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import DrillDownModal from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider, {
    useMetricQueryDataContext,
} from '../MetricQueryData/MetricQueryDataProvider';
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
    const { track } = useTracking();
    const { isUnderlyingDataModalOpen, isDrillDownModalOpen } =
        useMetricQueryDataContext();
    const { user } = useApp();
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();
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
            {isUnderlyingDataModalOpen &&
                track({
                    name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                    properties: {
                        organizationId: user?.data?.organizationUuid,
                        userId: user?.data?.userUuid,
                        projectId: projectUuid,
                    },
                })}
            <DrillDownModal />
            {isDrillDownModalOpen &&
                track({
                    name: EventName.DRILL_BY_CLICKED,
                    properties: {
                        organizationId: user?.data?.organizationUuid,
                        userId: user?.data?.userUuid,
                        projectId: projectUuid,
                    },
                })}
        </MetricQueryDataProvider>
    );
});

export default Explorer;
