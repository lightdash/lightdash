import { Stack } from '@mantine/core';
import { FC, memo } from 'react';
import { useParams } from 'react-router-dom';

import { useExplorerContext } from '../../providers/ExplorerProvider';
import DrillDownModal from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import { CustomMetricModal } from './CustomMetricModal';
import ExplorerHeader from './ExplorerHeader';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC<{ hideHeader?: boolean }> = memo(
    ({ hideHeader = false }) => {
        const unsavedChartVersionTableName = useExplorerContext(
            (context) => context.state.unsavedChartVersion.tableName,
        );
        const unsavedChartVersionMetricQuery = useExplorerContext(
            (context) => context.state.unsavedChartVersion.metricQuery,
        );
        const { projectUuid } = useParams<{ projectUuid: string }>();

        return (
            <MetricQueryDataProvider
                metricQuery={unsavedChartVersionMetricQuery}
                tableName={unsavedChartVersionTableName}
            >
                <Stack sx={{ flexGrow: 1 }}>
                    {!hideHeader && <ExplorerHeader />}

                    <FiltersCard />

                    <VisualizationCard projectUuid={projectUuid} />

                    <ResultsCard />

                    <SqlCard projectUuid={projectUuid} />
                </Stack>

                <UnderlyingDataModal />
                <DrillDownModal />
                <CustomMetricModal />
            </MetricQueryDataProvider>
        );
    },
);

export default Explorer;
