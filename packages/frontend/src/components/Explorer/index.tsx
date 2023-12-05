import { Alert, Stack, Text } from '@mantine/core';
import { FC, memo } from 'react';
import { useParams } from 'react-router-dom';

import { ProjectType } from '@lightdash/common';
import { IconAlertCircle } from '@tabler/icons-react';
import { useProjects } from '../../hooks/useProjects';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import MantineIcon from '../common/MantineIcon';
import { CustomVisualizationProvider } from '../CustomVisualization';
import DrillDownModal from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import { CustomDimensionModal } from './CustomDimensionModal';
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
        const showLimitWarning = useExplorerContext(
            (context) =>
                context.queryResults.data &&
                context.queryResults.data.rows.length >=
                    context.state.unsavedChartVersion.metricQuery.limit,
        );
        const limit = useExplorerContext(
            (context) => context.state.unsavedChartVersion.metricQuery.limit,
        );
        const { projectUuid } = useParams<{ projectUuid: string }>();

        const { data: projects } = useProjects({ refetchOnMount: false });
        const isProjectPreview = !!projects?.find(
            (project) =>
                project.projectUuid === projectUuid &&
                project.type === ProjectType.PREVIEW,
        );

        return (
            <MetricQueryDataProvider
                metricQuery={unsavedChartVersionMetricQuery}
                tableName={unsavedChartVersionTableName}
            >
                <Stack sx={{ flexGrow: 1 }}>
                    {!hideHeader && <ExplorerHeader />}

                    {showLimitWarning && (
                        <Alert
                            icon={<MantineIcon icon={IconAlertCircle} />}
                            color="yellow"
                            title="Results may be incomplete"
                            variant={'outline'}
                        >
                            <Text color="gray.6">
                                Query limit of {limit} reached. There may be
                                additional results that have not been displayed.
                                To see more, increase the query limit or try
                                narrowing filters.
                            </Text>
                        </Alert>
                    )}

                    <FiltersCard />

                    <CustomVisualizationProvider>
                        <VisualizationCard
                            projectUuid={projectUuid}
                            isProjectPreview={isProjectPreview}
                        />
                    </CustomVisualizationProvider>

                    <ResultsCard />

                    <SqlCard projectUuid={projectUuid} />
                </Stack>

                <UnderlyingDataModal />
                <DrillDownModal />
                <CustomMetricModal />
                <CustomDimensionModal />
            </MetricQueryDataProvider>
        );
    },
);

export default Explorer;
