import { subject } from '@casl/ability';
import {
    getExploreParameterDefinitions,
    getReferencedParameterDefinitions,
} from '@lightdash/common';
import { Stack } from '@mantine/core';
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
    selectIsChartTypeAuthoring,
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
import { MergeAutoRun } from '../../features/mergeQuery/components/MergeAutoRun';
import { MergeReadOnlyBar } from '../../features/mergeQuery/components/MergeReadOnlyBar';
import { MergeRelationshipCard } from '../../features/mergeQuery/components/MergeRelationshipCard';
import { useMergeSafe } from '../../features/mergeQuery/context/useMerge';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useParameters } from '../../hooks/parameters/useParameters';
import { useCompiledSql } from '../../hooks/useCompiledSql';
import useDefaultSortField from '../../hooks/useDefaultSortField';
import { useExplore } from '../../hooks/useExplore';
import { useExplorerQuery } from '../../hooks/useExplorerQuery';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { Can } from '../../providers/Ability';
import useFullscreen from '../../providers/Fullscreen/useFullscreen';
import ScreenshotReadyIndicator from '../common/ScreenshotReadyIndicator';
import { DrillDownModal } from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import RefreshDbtButton from '../RefreshDbtButton';
import { CustomDimensionModal } from './CustomDimensionModal';
import { CustomMetricModal } from './CustomMetricModal';
import classes from './Explorer.module.css';
import ExplorerHeader from './ExplorerHeader';
import FiltersCard from './FiltersCard/FiltersCard';
import { FormatModal } from './FormatModal';
import ParametersCard from './ParametersCard/ParametersCard';
import { PeriodOverPeriodComparisonModal } from './PeriodOverPeriodComparisonModal/PeriodOverPeriodComparisonModal';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';
import { WriteBackModal } from './WriteBackModal';

const EMPTY_PARAMETER_REFERENCES: string[] = [];

const Explorer: FC<{ hideHeader?: boolean; chartView?: boolean }> = memo(
    ({ hideHeader = false, chartView = false }) => {
        const tableName = useExplorerSelector(selectTableName);
        const dimensions = useExplorerSelector(selectDimensions);
        const metrics = useExplorerSelector(selectMetrics);
        const columnOrder = useExplorerSelector(selectColumnOrder);
        const sorts = useExplorerSelector(selectSorts);
        const metricQuery = useExplorerSelector(selectMetricQuery);
        const isEditMode = useExplorerSelector(selectIsEditMode);
        const showQueryBuilder = isEditMode || !chartView;
        const showMinimalChart = chartView && !isEditMode;
        // Authoring a chart type opens the builder modal over the page; the
        // query keeps running underneath so the preview renders against it.
        const isAuthoring = useExplorerSelector(selectIsChartTypeAuthoring);
        const parameterReferencesFromRedux = useExplorerSelector(
            selectParameterReferences,
        );
        const parameters = useExplorerSelector(selectParameters);
        const mergeParameterReferences =
            useMergeSafe()?.parameterReferences ?? EMPTY_PARAMETER_REFERENCES;
        const effectiveParameterReferences = useMemo(
            () =>
                Array.from(
                    new Set([
                        ...(parameterReferencesFromRedux ?? []),
                        ...mergeParameterReferences,
                    ]),
                ),
            [parameterReferencesFromRedux, mergeParameterReferences],
        );

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

        // Seed the default sort once per explore; without this guard, clearing
        // all sorts would re-seed and override the user's intent.
        const lastSeededTableRef = useRef<string | null>(null);
        useEffect(() => {
            if (!tableName) return;
            if (lastSeededTableRef.current === tableName) return;
            if (sorts.length === 0 && !defaultSort) return;
            if (sorts.length === 0 && defaultSort) {
                dispatch(explorerActions.setSortFields([defaultSort]));
            }
            lastSeededTableRef.current = tableName;
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
            effectiveParameterReferences,
            {
                enabled: effectiveParameterReferences.length > 0,
            },
        );

        const exploreParameterDefinitions = useMemo(() => {
            return getExploreParameterDefinitions(explore);
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

        // Only user-editable parameters drive the Parameters card. A reserved system
        // variable referenced on its own (no user definition) should not show the card.
        const hasReferencedUserParameters = useMemo(
            () =>
                Object.keys(
                    getReferencedParameterDefinitions(
                        parameterDefinitions,
                        effectiveParameterReferences,
                    ),
                ).length > 0,
            [parameterDefinitions, effectiveParameterReferences],
        );

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

        // In fullscreen only the visualization is shown, so it can use the
        // whole viewport
        const { isFullscreen } = useFullscreen();

        return (
            <MetricQueryDataProvider
                tableName={tableName}
                explore={explore}
                metricQuery={metricQuery}
                queryUuid={queryUuid}
                parameters={parameters}
                resolvedTimezone={query.data?.resolvedTimezone}
            >
                <Stack className={classes.stack}>
                    <MergeAutoRun />
                    {!hideHeader &&
                        (isEditMode ? (
                            <ExplorerHeader />
                        ) : (
                            !savedChart && <RefreshDbtButton />
                        ))}

                    {!isFullscreen && showQueryBuilder && <MergeReadOnlyBar />}

                    {!isFullscreen && showQueryBuilder && (
                        <MergeRelationshipCard />
                    )}

                    {!isFullscreen &&
                        showQueryBuilder &&
                        !!tableName &&
                        hasReferencedUserParameters && (
                            <ParametersCard
                                parameterReferences={
                                    effectiveParameterReferences
                                }
                            />
                        )}

                    {!isFullscreen && showQueryBuilder && <FiltersCard />}

                    {/* The card also hosts the authoring modal, which needs
                        its visualization context. The chart itself pauses
                        while the type is authored so it doesn't render twice. */}
                    <VisualizationCard
                        projectUuid={projectUuid}
                        renderVisualization={!isAuthoring}
                        onScreenshotReady={handleScreenshotReady}
                        onScreenshotError={handleScreenshotError}
                        minimal={showMinimalChart}
                    />

                    {!isFullscreen && showQueryBuilder && (
                        <>
                            <ResultsCard />

                            <Can
                                I="manage"
                                this={subject('Explore', {
                                    organizationUuid: org?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                {!!projectUuid && (
                                    <SqlCard projectUuid={projectUuid} />
                                )}
                            </Can>
                        </>
                    )}
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
