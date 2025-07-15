import {
    getItemMap,
    isField,
    isMetric,
    type CompiledTable,
} from '@lightdash/common';
import { Stack } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import { useParameters } from '../../hooks/parameters/useParameters';
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

        const activeFields = useExplorerContext(
            (context) => context.state.activeFields,
        );

        let allParameterReferences: string[] = [];
        if (explore && explore.tables) {
            allParameterReferences = Object.values(explore.tables).flatMap(
                (table: CompiledTable) => table.parameterReferences || [],
            );
        }

        const { data: parameterDetails } = useParameters(projectUuid);

        const exploreItemsMap = useMemo(() => {
            return explore ? getItemMap(explore) : undefined;
        }, [explore]);

        const parameterReferencesInActiveFields: string[] = useMemo(() => {
            if (!exploreItemsMap) return [];
            const result: string[] = [];
            for (const fieldId of activeFields) {
                const item = exploreItemsMap[fieldId];
                if (
                    item &&
                    (isField(item) || isMetric(item)) &&
                    Array.isArray(item.parameterReferences)
                ) {
                    result.push(...item.parameterReferences);
                }
            }
            return result;
        }, [exploreItemsMap, activeFields]);

        console.log('explore parameters', {
            parameterReferencesInActiveFields,
            parameterDetails,
            allParameterReferences,
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

                    <FiltersCard />

                    {(parameterReferencesInActiveFields.length > 0 || true) && ( // TODO: remove this
                        <ParametersCard />
                    )}

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
