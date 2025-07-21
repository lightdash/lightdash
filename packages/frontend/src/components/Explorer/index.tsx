import { Stack } from '@mantine/core';
import { memo, type FC } from 'react';
import { useParams } from 'react-router';
import { useCompiledSql } from '../../hooks/useCompiledSql';
import { useExplore } from '../../hooks/useExplore';
import useExplorerContext from '../../providers/Explorer/useExplorerContext';
import { DrillDownModal } from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import { CustomDimensionModal } from './CustomDimensionModal';
import { CustomMetricModal } from './CustomMetricModal';
import ExplorerHeader from './ExplorerHeader';
import FiltersCard from './FiltersCard/FiltersCard';
import { FormatModal } from './FormatModal';
import ParametersCard from './ParametersCard/ParametersCard';
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

        const { data: explore } = useExplore(unsavedChartVersionTableName);

        const {
            data: { parameterReferences } = {},
            isFetching: isCompiledSqlFetching,
        } = useCompiledSql({
            enabled: !!unsavedChartVersionTableName,
        });

        return (
            <MetricQueryDataProvider
                metricQuery={unsavedChartVersionMetricQuery}
                tableName={unsavedChartVersionTableName}
                explore={explore}
                queryUuid={queryUuid}
            >
                <Stack sx={{ flexGrow: 1 }}>
                    {!hideHeader && isEditMode && <ExplorerHeader />}

                    {((parameterReferences && parameterReferences.length > 0) ||
                        isCompiledSqlFetching) && (
                        <ParametersCard
                            parameterReferences={parameterReferences}
                        />
                    )}

                    <FiltersCard />

                    <VisualizationCard projectUuid={projectUuid} />

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
