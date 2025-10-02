import { subject } from '@casl/ability';
import { getAvailableParametersFromTables } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { memo, useEffect, useMemo, type FC } from 'react';
import {
    explorerActions,
    selectColumnOrder,
    selectDimensions,
    selectFromDashboard,
    selectIsEditMode,
    selectMetricQuery,
    selectMetrics,
    selectParameterReferences,
    selectPivotConfig,
    selectPreviouslyFetchedState,
    selectSorts,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../features/explorer/store';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useParameters } from '../../hooks/parameters/useParameters';
import { useCompiledSql } from '../../hooks/useCompiledSql';
import useDefaultSortField from '../../hooks/useDefaultSortField';
import { useExplore } from '../../hooks/useExplore';
import { useExplorerQuery } from '../../hooks/useExplorerQuery';
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
        // Get state from Redux
        const tableName = useExplorerSelector(selectTableName);
        const dimensions = useExplorerSelector(selectDimensions);
        const metrics = useExplorerSelector(selectMetrics);
        const columnOrder = useExplorerSelector(selectColumnOrder);
        const metricQuery = useExplorerSelector(selectMetricQuery);
        const isEditMode = useExplorerSelector(selectIsEditMode);
        const parameterReferencesFromRedux = useExplorerSelector(
            selectParameterReferences,
        );
        const sorts = useExplorerSelector(selectSorts);
        const dimensions = useExplorerSelector(selectDimensions);
        const metricsFromRedux = useExplorerSelector(selectMetrics);
        const columnOrder = useExplorerSelector(selectColumnOrder);
        const dispatch = useExplorerDispatch();

        const projectUuid = useProjectUuid();

        // Get query state and actions from hook
        const { query, fetchResults } = useExplorerQuery();
        const queryUuid = query.data?.queryUuid;

        const { data: explore } = useExplore(tableName);

        const { data: { parameterReferences } = {}, isError } = useCompiledSql({
            enabled: !!tableName,
        });

        // Keep reading savedChart from Context for now (will migrate when we add to Redux)
        const isSavedChart = useExplorerContext(
            (context) => !!context.state.savedChart,
        );

        // Get navigation context from Redux
        const fromDashboard = useExplorerSelector(selectFromDashboard);
        const previouslyFetchedState = useExplorerSelector(
            selectPreviouslyFetchedState,
        );
        const pivotConfig = useExplorerSelector(selectPivotConfig);

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
                dispatch(explorerActions.setParameterReferences([]));
            } else {
                // While there's no parameter references array the request hasn't run, so we set it explicitly to null
                dispatch(
                    explorerActions.setParameterReferences(
                        parameterReferences ?? null,
                    ),
                );
            }
        }, [parameterReferences, dispatch, isError]);

        // Fetch project parameters based on parameter references
        const { data: projectParameters } = useParameters(
            projectUuid,
            parameterReferencesFromRedux ?? undefined,
            {
                enabled: !!parameterReferencesFromRedux?.length,
            },
        );

        // Compute parameter definitions from explore tables
        const exploreParameterDefinitions = useMemo(() => {
            return explore
                ? getAvailableParametersFromTables(
                      Object.values(explore.tables),
                  )
                : {};
        }, [explore]);

        // Merge project and explore parameter definitions
        const parameterDefinitions = useMemo(() => {
            return {
                ...(projectParameters ?? {}),
                ...(exploreParameterDefinitions ?? {}),
            };
        }, [projectParameters, exploreParameterDefinitions]);

        // Sync parameter definitions to Redux
        useEffect(() => {
            dispatch(
                explorerActions.setParameterDefinitions(parameterDefinitions),
            );
        }, [parameterDefinitions, dispatch]);

        // Construct object for default sort calculation from Redux state
        const chartVersionForSort = useMemo(
            () => ({
                tableName,
                metricQuery: {
                    dimensions,
                    metrics: metricsFromRedux,
                },
                tableConfig: {
                    columnOrder,
                },
            }),
            [tableName, dimensions, metricsFromRedux, columnOrder],
        );

        const defaultSort = useDefaultSortField(chartVersionForSort as any);

        // Set default sort when table changes and no sorts exist
        useEffect(() => {
            if (tableName && !sorts.length && defaultSort) {
                dispatch(explorerActions.setSortFields([defaultSort]));
            }
        }, [tableName, sorts.length, defaultSort, dispatch]);

        const { data: org } = useOrganization();

        return (
            <MetricQueryDataProvider
                metricQuery={metricQuery}
                tableName={tableName}
                explore={explore}
                queryUuid={queryUuid}
            >
                <Stack sx={{ flexGrow: 1 }}>
                    {!hideHeader && isEditMode && <ExplorerHeader />}

                    {!!tableName &&
                        parameterReferencesFromRedux &&
                        parameterReferencesFromRedux?.length > 0 && (
                            <ParametersCard
                                parameterReferences={
                                    parameterReferencesFromRedux
                                }
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
