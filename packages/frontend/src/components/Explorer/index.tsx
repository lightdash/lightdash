import { subject } from '@casl/ability';
import { getAvailableParametersFromTables } from '@lightdash/common';
import { Stack } from '@mantine-8/core';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
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
    selectPeriodOverPeriodComparisonModal,
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
import ScreenshotReadyIndicator from '../common/ScreenshotReadyIndicator';
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
import { PeriodOverPeriodComparisonModal } from './PeriodOverPeriodComparisonModal/PeriodOverPeriodComparisonModal';
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

        const { isOpen: isPeriodOverPeriodComparisonModalOpen } =
            useExplorerSelector(selectPeriodOverPeriodComparisonModal);

        const dispatch = useExplorerDispatch();

        const projectUuid = useProjectUuid();

        const { query, queryResults } = useExplorerQuery();
        const queryUuid = query.data?.queryUuid;

        // Screenshot readiness tracking for EXPLORE pages (Slack unfurls).
        // We flip ready only when the rendered chart signals back via
        // onScreenshotReady — the chart-level gate already waits for all
        // rows (setFetchAll) and chart-type-specific work (e.g. map tiles).
        // A container-level gate would race against the chart's own
        // setFetchAll(true) mount effect.
        const hasQueryError = !!query.error || !!queryResults.error;

        const [isScreenshotReady, setIsScreenshotReady] = useState(false);
        const [screenshotErrored, setScreenshotErrored] = useState(false);
        const hasSignaledReady = useRef(false);

        const handleScreenshotReady = useCallback(() => {
            if (hasSignaledReady.current) return;
            hasSignaledReady.current = true;
            setIsScreenshotReady(true);
        }, []);

        const handleScreenshotError = useCallback(() => {
            if (hasSignaledReady.current) return;
            hasSignaledReady.current = true;
            setScreenshotErrored(true);
            setIsScreenshotReady(true);
        }, []);

        const { data: explore } = useExplore(tableName);

        // Fallback: if the query itself errors, no chart mounts and neither
        // onScreenshotReady nor onScreenshotError will fire. Signal ready
        // with error status so the unfurl captures the error state.
        useEffect(() => {
            if (hasSignaledReady.current) return;
            if (!hasQueryError) return;
            hasSignaledReady.current = true;
            setScreenshotErrored(true);
            setIsScreenshotReady(true);
        }, [hasQueryError]);

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

        // Seed parameter values from virtual view's savedParameterValues
        // when no parameter values have been set yet
        const hasSeededParams = useRef(false);
        useEffect(() => {
            if (
                !hasSeededParams.current &&
                explore?.savedParameterValues &&
                Object.keys(explore.savedParameterValues).length > 0 &&
                Object.keys(parameters).length === 0
            ) {
                hasSeededParams.current = true;
                Object.entries(explore.savedParameterValues).forEach(
                    ([key, value]) => {
                        dispatch(explorerActions.setParameter({ key, value }));
                    },
                );
            }
        }, [explore, parameters, dispatch]);

        const { data: org } = useOrganization();

        return (
            <MetricQueryDataProvider
                tableName={tableName}
                explore={explore}
                metricQuery={metricQuery}
                queryUuid={queryUuid}
                parameters={parameters}
                resolvedTimezone={query.data?.resolvedTimezone}
            >
                <Stack style={{ flexGrow: 1 }}>
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

                    <VisualizationCard
                        projectUuid={projectUuid}
                        onScreenshotReady={handleScreenshotReady}
                        onScreenshotError={handleScreenshotError}
                    />

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

                {/* These use the metricQueryDataProvider context */}
                <UnderlyingDataModal />
                <DrillDownModal />

                {/* These return safely when unopened */}
                <CustomDimensionModal />
                <WriteBackModal />

                {isAdditionalMetricModalOpen && <CustomMetricModal />}
                {isFormatModalOpen && <FormatModal />}
                {isPeriodOverPeriodComparisonModalOpen && (
                    <PeriodOverPeriodComparisonModal />
                )}

                {/* Screenshot readiness indicator for EXPLORE pages (Slack unfurls) */}
                {isScreenshotReady && (
                    <ScreenshotReadyIndicator
                        tilesTotal={1}
                        tilesReady={screenshotErrored ? 0 : 1}
                        tilesErrored={screenshotErrored ? 1 : 0}
                    />
                )}
            </MetricQueryDataProvider>
        );
    },
);

Explorer.displayName = 'Explorer';

export default Explorer;
