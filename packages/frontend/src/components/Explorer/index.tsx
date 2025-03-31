import { ProjectType } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { memo, type FC } from 'react';
import { useParams } from 'react-router';
import { useExplore } from '../../hooks/useExplore';
import { useProjects } from '../../hooks/useProjects';
import useExplorerContext from '../../providers/Explorer/useExplorerContext';
import { DrillDownModal } from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import { CustomDimensionModal } from './CustomDimensionModal';
import { CustomMetricModal } from './CustomMetricModal';
import ExplorerHeader from './ExplorerHeader';
import FiltersCard from './FiltersCard/FiltersCard';
import { FormatModal } from './FormatModal';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';
import { WriteBackModal } from './WriteBackModal';

const Explorer: FC<{ hideHeader?: boolean }> = memo(
    ({ hideHeader = false }) => {
        const unsavedChartVersionTableName = useExplorerContext(
            (context) => context.state.unsavedChartVersion.tableName,
        );
        const unsavedChartVersionMetricQuery = useExplorerContext(
            (context) => context.state.unsavedChartVersion.metricQuery,
        );
        const isEditMode = useExplorerContext(
            (context) => context.state.isEditMode,
        );
        const { projectUuid } = useParams<{ projectUuid: string }>();

        const queryUuid = useExplorerContext(
            (context) => context.query?.data?.queryUuid,
        );

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
                queryUuid={queryUuid}
            >
                <Stack sx={{ flexGrow: 1 }}>
                    {!hideHeader && isEditMode && <ExplorerHeader />}

                    <FiltersCard />

                    <VisualizationCard
                        projectUuid={projectUuid}
                        isProjectPreview={isProjectPreview}
                    />

                    <ResultsCard />

                    {!!projectUuid && <SqlCard projectUuid={projectUuid} />}
                </Stack>

                <UnderlyingDataModal />
                <DrillDownModal />
                <CustomMetricModal />
                <CustomDimensionModal />
                <FormatModal />
                <WriteBackModal />
            </MetricQueryDataProvider>
        );
    },
);

export default Explorer;
