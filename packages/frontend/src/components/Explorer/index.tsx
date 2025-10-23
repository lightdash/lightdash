import { subject } from '@casl/ability';
import { getAvailableParametersFromTables } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { lazy, memo, Suspense, useEffect, useMemo, type FC } from 'react';
import {
    explorerActions,
    selectAdditionalMetricModal,
    selectColumnOrder,
    selectDimensions,
    selectFormatModal,
    selectIsEditMode,
    selectMetricQuery,
    selectMetrics,
    selectParameterReferences,
    selectParameters,
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
import { DrillDownModal } from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import { CustomDimensionModal } from './CustomDimensionModal';
import { CustomMetricModal } from './CustomMetricModal';
import { FormatModal } from './FormatModal';
import { WriteBackModal } from './WriteBackModal';

const LazyExplorerHeader = lazy(() => import('./ExplorerHeader'));
const LazyFiltersCard = lazy(() => import('./FiltersCard/FiltersCard'));
const LazyResultsCard = lazy(() => import('./ResultsCard/ResultsCard'));
const LazySqlCard = lazy(() => import('./SqlCard/SqlCard'));
const LazyParametersCard = lazy(
    () => import('./ParametersCard/ParametersCard'),
);
const LazyVisualizationCard = lazy(
    () => import('./VisualizationCard/VisualizationCard'),
);

const Explorer: FC<{ hideHeader?: boolean }> = memo(
    ({ hideHeader = false }) => {
        const tableName = useExplorerSelector(selectTableName);
        const dimensions = useExplorerSelector(selectDimensions);
        const metrics = useExplorerSelector(selectMetrics);
        const columnOrder = useExplorerSelector(selectColumnOrder);
        const sorts = useExplorerSelector(selectSorts);
        const metricQuery = useExplorerSelector(selectMetricQuery);
        const isEditMode = useExplorerSelector(selectIsEditMode);
        const parameterReferencesFromRedux = useExplorerSelector(
            selectParameterReferences,
        );
        const parameters = useExplorerSelector(selectParameters);

        const { isOpen: isAdditionalMetricModalOpen } = useExplorerSelector(
            selectAdditionalMetricModal,
        );
        const { isOpen: isFormatModalOpen } =
            useExplorerSelector(selectFormatModal);

        const dispatch = useExplorerDispatch();

        const projectUuid = useProjectUuid();

        const { query } = useExplorerQuery();
        const queryUuid = query.data?.queryUuid;

        const { data: explore } = useExplore(tableName);

        const { data: { parameterReferences } = {}, isError } = useCompiledSql({
            enabled: !!tableName,
        });

        const chartVersionForSort = useMemo(
            () => ({
                tableName,
                metricQuery: {
                    dimensions,
                    metrics,
                },
                tableConfig: {
                    columnOrder,
                },
            }),
            [tableName, dimensions, metrics, columnOrder],
        );

        const defaultSort = useDefaultSortField(chartVersionForSort as any);

        useEffect(() => {
            if (tableName && !sorts.length && defaultSort) {
                dispatch(explorerActions.setSortFields([defaultSort]));
            }
        }, [tableName, sorts.length, defaultSort, dispatch]);

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

        const { data: projectParameters } = useParameters(
            projectUuid,
            parameterReferencesFromRedux ?? undefined,
            {
                enabled: !!parameterReferencesFromRedux?.length,
            },
        );

        const exploreParameterDefinitions = useMemo(() => {
            return explore
                ? getAvailableParametersFromTables(
                      Object.values(explore.tables),
                  )
                : {};
        }, [explore]);

        const parameterDefinitions = useMemo(() => {
            return {
                ...(projectParameters ?? {}),
                ...(exploreParameterDefinitions ?? {}),
            };
        }, [projectParameters, exploreParameterDefinitions]);

        useEffect(() => {
            dispatch(
                explorerActions.setParameterDefinitions(parameterDefinitions),
            );
        }, [parameterDefinitions, dispatch]);

        const { data: org } = useOrganization();

        return (
            <MetricQueryDataProvider
                tableName={tableName}
                explore={explore}
                metricQuery={metricQuery}
                queryUuid={queryUuid}
                parameters={parameters}
            >
                <Stack sx={{ flexGrow: 1 }}>
                    {!hideHeader && isEditMode && (
                        <Suspense>
                            <LazyExplorerHeader />
                        </Suspense>
                    )}

                    {!!tableName &&
                        parameterReferencesFromRedux &&
                        parameterReferencesFromRedux?.length > 0 && (
                            <Suspense>
                                <LazyParametersCard
                                    parameterReferences={
                                        parameterReferencesFromRedux
                                    }
                                />
                            </Suspense>
                        )}

                    <Suspense>
                        <LazyFiltersCard />
                    </Suspense>

                    <Suspense>
                        <LazyVisualizationCard projectUuid={projectUuid} />
                    </Suspense>

                    <Suspense>
                        <LazyResultsCard />
                    </Suspense>

                    <Can
                        I="manage"
                        this={subject('Explore', {
                            organizationUuid: org?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        {!!projectUuid && (
                            <Suspense>
                                <LazySqlCard projectUuid={projectUuid} />
                            </Suspense>
                        )}
                    </Can>
                </Stack>

                {/* These use the metricQueryDataProvider context */}
                <UnderlyingDataModal />
                <DrillDownModal />

                {/* These return safely when unopened */}
                <CustomDimensionModal />
                <WriteBackModal />

                {isAdditionalMetricModalOpen && <CustomMetricModal />}
                {isFormatModalOpen && <FormatModal />}
            </MetricQueryDataProvider>
        );
    },
);

Explorer.displayName = 'Explorer';

export default Explorer;
