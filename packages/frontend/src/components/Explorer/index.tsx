import { FeatureFlags, ProjectType } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { FC, memo } from 'react';
import { useParams } from 'react-router-dom';
import { useExplore } from '../../hooks/useExplore';
import { useFeatureFlagEnabled } from '../../hooks/useFeatureFlagEnabled';
import { useProjects } from '../../hooks/useProjects';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import { DrillDownModal } from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import { CustomDimensionModal } from './CustomDimensionModal';
import { CustomMetricModal } from './CustomMetricModal';
import ExplorerHeader from './ExplorerHeader';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import { ResultsDrawer } from './ResultsDrawer';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC<{ hideHeader?: boolean }> = memo(
    ({ hideHeader = false }) => {
        const { ref, width } = useElementSize();

        const isResultsTableDrawerFeatureEnabled = !useFeatureFlagEnabled(
            FeatureFlags.ResultsTableDrawer,
        );
        const unsavedChartVersionTableName = useExplorerContext(
            (context) => context.state.unsavedChartVersion.tableName,
        );
        const unsavedChartVersionMetricQuery = useExplorerContext(
            (context) => context.state.unsavedChartVersion.metricQuery,
        );
        const { projectUuid } = useParams<{ projectUuid: string }>();

        const { data: projects } = useProjects({ refetchOnMount: false });
        const isProjectPreview = !!projects?.find(
            (project) =>
                project.projectUuid === projectUuid &&
                project.type === ProjectType.PREVIEW,
        );
        const { data: explore } = useExplore(unsavedChartVersionTableName);

        return (
            <MetricQueryDataProvider
                metricQuery={unsavedChartVersionMetricQuery}
                tableName={unsavedChartVersionTableName}
                explore={explore}
            >
                <Stack sx={{ flexGrow: 1 }} ref={ref}>
                    {!hideHeader && <ExplorerHeader />}

                    <FiltersCard />

                    <VisualizationCard
                        projectUuid={projectUuid}
                        isProjectPreview={isProjectPreview}
                    />

                    {!isResultsTableDrawerFeatureEnabled && <ResultsCard />}

                    <SqlCard projectUuid={projectUuid} />
                </Stack>
                {isResultsTableDrawerFeatureEnabled && (
                    <ResultsDrawer w={width} />
                )}

                <UnderlyingDataModal />
                <DrillDownModal />
                <CustomMetricModal />
                <CustomDimensionModal />
            </MetricQueryDataProvider>
        );
    },
);

export default Explorer;
