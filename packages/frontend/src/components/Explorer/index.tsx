import { subject } from '@casl/ability';
import { Stack } from '@mantine/core';
import { memo, useCallback, useEffect, type FC } from 'react';
import {
    explorerActions,
    selectIsEditMode,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../features/explorer/store';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useCompiledSql } from '../../hooks/useCompiledSql';
import { useExplore } from '../../hooks/useExplore';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { Can } from '../../providers/Ability';
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
        // Redux selectors for core query state - prevents re-renders from context cascades
        const unsavedChartVersionTableName =
            useExplorerSelector(selectTableName);
        const isEditMode = useExplorerSelector(selectIsEditMode);
        const dispatch = useExplorerDispatch();

        // Still use context for complex objects until fully migrated
        const unsavedChartVersionMetricQuery = useExplorerContext(
            (context) => context.state.unsavedChartVersion.metricQuery,
        );
        const projectUuid = useProjectUuid();

        const queryUuid = useExplorerContext(
            (context) => context.query?.data?.queryUuid,
        );

        // Redux action dispatch instead of context action
        const setParameterReferences = useCallback(
            (refs: string[] | null) => {
                dispatch(explorerActions.setParameterReferences(refs));
            },
            [dispatch],
        );

        const { data: explore } = useExplore(unsavedChartVersionTableName);

        const { data: { parameterReferences } = {}, isError } = useCompiledSql({
            enabled: !!unsavedChartVersionTableName,
        });

        const isSavedChart = useExplorerContext(
            (context) => !!context.state.savedChart,
        );

        const fromDashboard = useExplorerContext(
            (context) => context.state.fromDashboard,
        );

        const previouslyFetchedState = useExplorerContext(
            (context) => context.state.previouslyFetchedState,
        );

        const fetchResults = useExplorerContext(
            (context) => context.actions.fetchResults,
        );

        const pivotConfig = useExplorerContext(
            (context) => context.state.unsavedChartVersion.pivotConfig,
        );

        const hasPivotConfig = !!pivotConfig;

        useEffect(() => {
            const shouldAutoFetch =
                !previouslyFetchedState &&
                (!!fromDashboard || isSavedChart || hasPivotConfig);

            if (shouldAutoFetch) {
                fetchResults();
            }
        }, [
            previouslyFetchedState,
            fetchResults,
            fromDashboard,
            isSavedChart,
            hasPivotConfig,
        ]);

        useEffect(() => {
            if (isError) {
                // If there's an error, we set the parameter references to an empty array
                setParameterReferences([]);
            } else {
                // While there's no parameter references array the request hasn't run, so we set it explicitly to null
                setParameterReferences(parameterReferences ?? null);
            }
        }, [parameterReferences, setParameterReferences, isError]);

        const { data: org } = useOrganization();

        return (
            <MetricQueryDataProvider
                metricQuery={unsavedChartVersionMetricQuery}
                tableName={unsavedChartVersionTableName}
                explore={explore}
                queryUuid={queryUuid}
            >
                <Stack sx={{ flexGrow: 1 }}>
                    {!hideHeader && isEditMode && <ExplorerHeader />}

                    {!!unsavedChartVersionTableName &&
                        parameterReferences &&
                        parameterReferences?.length > 0 && (
                            <ParametersCard
                                parameterReferences={parameterReferences}
                            />
                        )}

                    <FiltersCard />

                    <VisualizationCard projectUuid={projectUuid} />

                    <ResultsCard />

                    <Can
                        I="manage"
                        this={subject('Explore', {
                            organizationUuid: org?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        {!!projectUuid && <SqlCard projectUuid={projectUuid} />}
                    </Can>
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
