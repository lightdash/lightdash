import { subject } from '@casl/ability';
import {
    ExploreType,
    getAvailableParametersFromTables,
    getItemId,
    getItemMap,
    isDimension,
    isMetric,
} from '@lightdash/common';
import { Stack } from '@mantine/core';
import { memo, useEffect, useMemo, type FC } from 'react';
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
    selectSavedChart,
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
import RefreshDbtButton from '../RefreshDbtButton';
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

        const savedChart = useExplorerSelector(selectSavedChart);

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
        const isSemanticLayerExplore =
            explore?.type === ExploreType.SEMANTIC_LAYER;

        const canCompileSql =
            !!tableName && !!explore && !isSemanticLayerExplore;
        const { data: { parameterReferences } = {}, isError } = useCompiledSql({
            enabled: canCompileSql,
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
            if (isSemanticLayerExplore) {
                dispatch(explorerActions.setParameterReferences([]));
                return;
            }
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
        }, [parameterReferences, dispatch, isError, isSemanticLayerExplore]);

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

        useEffect(() => {
            if (!explore || !isSemanticLayerExplore) return;

            const itemsMap = getItemMap(explore);
            const isSameArray = (a: string[], b: string[]) =>
                a.length === b.length &&
                a.every((value, index) => value === b[index]);

            const cleanedDimensions = dimensions.filter((fieldId) => {
                const item = itemsMap[fieldId];
                return item && isDimension(item);
            });
            const cleanedMetrics = metrics.filter((fieldId) => {
                const item = itemsMap[fieldId];
                return item && isMetric(item);
            });
            const cleanedSorts = sorts.filter((sort) => itemsMap[sort.fieldId]);
            const cleanedColumnOrder = columnOrder.filter(
                (fieldId) => itemsMap[fieldId],
            );

            const hasDimensionChanges = !isSameArray(
                cleanedDimensions,
                dimensions,
            );
            const hasMetricChanges = !isSameArray(cleanedMetrics, metrics);
            const hasSortChanges =
                cleanedSorts.length !== sorts.length ||
                cleanedSorts.some(
                    (sort, index) =>
                        sorts[index]?.fieldId !== sort.fieldId ||
                        sorts[index]?.descending !== sort.descending,
                );
            const hasColumnOrderChanges = !isSameArray(
                cleanedColumnOrder,
                columnOrder,
            );

            if (metricQuery.tableCalculations.length > 0) {
                dispatch(explorerActions.setTableCalculations([]));
            }
            if (metricQuery.customDimensions?.length) {
                dispatch(explorerActions.setCustomDimensions([]));
            }
            if (metricQuery.additionalMetrics?.length) {
                metricQuery.additionalMetrics.forEach((metric) => {
                    dispatch(
                        explorerActions.removeAdditionalMetric(
                            getItemId(metric),
                        ),
                    );
                });
            }
            if (hasDimensionChanges) {
                dispatch(explorerActions.setDimensions(cleanedDimensions));
            }
            if (hasMetricChanges) {
                dispatch(explorerActions.setMetrics(cleanedMetrics));
            }
            if (hasSortChanges) {
                dispatch(explorerActions.setSortFields(cleanedSorts));
            }
            if (hasColumnOrderChanges) {
                dispatch(explorerActions.setColumnOrder(cleanedColumnOrder));
            }
        }, [
            columnOrder,
            dimensions,
            dispatch,
            explore,
            isSemanticLayerExplore,
            metricQuery.additionalMetrics,
            metricQuery.customDimensions,
            metricQuery.tableCalculations,
            metrics,
            sorts,
        ]);

        return (
            <MetricQueryDataProvider
                tableName={tableName}
                explore={explore}
                metricQuery={metricQuery}
                queryUuid={queryUuid}
                parameters={parameters}
            >
                <Stack sx={{ flexGrow: 1 }}>
                    {!hideHeader &&
                        (isEditMode ? (
                            <ExplorerHeader />
                        ) : (
                            !savedChart && <RefreshDbtButton />
                        ))}

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

                {!isSemanticLayerExplore && (
                    <>
                        {/* These use the metricQueryDataProvider context */}
                        <UnderlyingDataModal />
                        <DrillDownModal />

                        {/* These return safely when unopened */}
                        <CustomDimensionModal />
                        <WriteBackModal />

                        {isAdditionalMetricModalOpen && <CustomMetricModal />}
                    </>
                )}
                {isFormatModalOpen && <FormatModal />}
            </MetricQueryDataProvider>
        );
    },
);

Explorer.displayName = 'Explorer';

export default Explorer;
