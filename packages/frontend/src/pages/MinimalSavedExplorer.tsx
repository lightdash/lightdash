import { ChartType } from '@lightdash/common';
import { Box } from '@mantine/core';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';
import { validate as isUuidString } from 'uuid';
import ScreenshotProgressIndicator from '../components/common/ScreenshotProgressIndicator';
import ScreenshotReadyIndicator from '../components/common/ScreenshotReadyIndicator';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../components/MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../components/MetricQueryData/UnderlyingDataModal';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    selectSavedChart,
    useExplorerSelector,
} from '../features/explorer/store';
import { useExplorerQuery } from '../hooks/useExplorerQuery';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import { useProject } from '../hooks/useProject';
import { ProjectRouteContext } from '../hooks/useProjectRoute';
import { useProjects } from '../hooks/useProjects';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import { ExplorerSection } from '../providers/Explorer/types';
import { getProjectUrlIdentifier } from '../utils/projectUrl';

type Props = {
    savedQueryUuid?: string;
};

const MinimalExplorerContent = memo(() => {
    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects({ minimal: true });

    const { health } = useApp();

    // The in-repo useResizeObserver tracks ref changes via setState (unlike
    // @mantine/hooks' useElementSize, whose [ref.current] effect dep doesn't
    // re-run on ref attachment). Without this, containerWidth/containerHeight
    // stay at 0 and Vega-Lite charts render at 0x0 in the minimal/export view.
    const [measureRef, { width: containerWidth, height: containerHeight }] =
        useResizeObserver<HTMLDivElement>();

    // Get query state from hook
    const { query, queryResults, explore } = useExplorerQuery();

    const resultsData = useMemo(
        () => ({
            ...queryResults,
            metricQuery: query.data?.metricQuery,
            fields: query.data?.fields,
            resolvedTimezone: query.data?.resolvedTimezone ?? undefined,
        }),
        [queryResults, query.data],
    );

    // Get savedChart from Redux
    const savedChart = useExplorerSelector(selectSavedChart);

    const isLoadingQueryResults =
        query.isFetching ||
        queryResults.isFetchingRows ||
        !query.data?.queryUuid ||
        queryResults.queryUuid !== query.data.queryUuid;

    const hasQueryError = !!query.error || !!queryResults.error;

    const [isScreenshotReady, setIsScreenshotReady] = useState(false);
    const [chartHasPainted, setChartHasPainted] = useState(false);
    const hasSignaledReady = useRef(false);

    // Custom (Vega-Lite) charts render asynchronously: react-vega is lazy-imported,
    // then Vega compiles the spec and constructs its view before the chart paints.
    // For this type we wait for the chart's own paint signal — gating only on
    // data-loaded fires the screenshot indicator before Vega has rendered, which
    // produces blank export PNGs.
    const needsPaintSignal = savedChart?.chartConfig.type === ChartType.CUSTOM;

    const handleChartScreenshotReady = useCallback(() => {
        setChartHasPainted(true);
    }, []);

    const handleChartScreenshotError = useCallback(() => {
        setChartHasPainted(true);
    }, []);

    useEffect(() => {
        if (hasSignaledReady.current) return;
        if (health.isInitialLoading || !health.data) return;

        const isSuccessfullyLoaded = savedChart && !isLoadingQueryResults;
        if (!isSuccessfullyLoaded && !hasQueryError) {
            return;
        }

        if (needsPaintSignal && !hasQueryError && !chartHasPainted) {
            return;
        }

        setIsScreenshotReady(true);
        hasSignaledReady.current = true;
    }, [
        savedChart,
        isLoadingQueryResults,
        hasQueryError,
        health.isInitialLoading,
        health.data,
        needsPaintSignal,
        chartHasPainted,
    ]);

    if (!savedChart || health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <MetricQueryDataProvider
            metricQuery={query.data?.metricQuery}
            tableName={savedChart.tableName ?? ''}
            explore={explore}
            queryUuid={query.data?.queryUuid}
            parameters={query.data?.usedParametersValues}
            resolvedTimezone={query.data?.resolvedTimezone}
        >
            <VisualizationProvider
                minimal
                chartConfig={savedChart.chartConfig}
                initialPivotDimensions={savedChart.pivotConfig?.columns}
                initialPivotRows={savedChart.pivotConfig?.rows}
                resultsData={resultsData}
                isLoading={isLoadingQueryResults}
                columnOrder={savedChart.tableConfig.columnOrder}
                savedChartUuid={savedChart.uuid}
                colorPalette={savedChart.colorPalette}
                parameters={query.data?.usedParametersValues}
                containerWidth={containerWidth}
                containerHeight={containerHeight}
            >
                <Box mih="inherit" h="100%">
                    <LightdashVisualization
                        ref={measureRef}
                        // get rid of the classNames once you remove analytics providers
                        className="sentry-block ph-no-capture"
                        data-testid="visualization"
                        onScreenshotReady={handleChartScreenshotReady}
                        onScreenshotError={handleChartScreenshotError}
                    />
                </Box>

                <ScreenshotProgressIndicator
                    expectedTileUuids={[savedChart.uuid]}
                    readyTileUuids={
                        isScreenshotReady && !hasQueryError
                            ? [savedChart.uuid]
                            : []
                    }
                    erroredTileUuids={
                        isScreenshotReady && hasQueryError
                            ? [savedChart.uuid]
                            : []
                    }
                />
                {isScreenshotReady && (
                    <ScreenshotReadyIndicator
                        tilesTotal={1}
                        tilesReady={hasQueryError ? 0 : 1}
                        tilesErrored={hasQueryError ? 1 : 0}
                    />
                )}
            </VisualizationProvider>
            <UnderlyingDataModal />
        </MetricQueryDataProvider>
    );
});

const MinimalSavedExplorer: FC<Props> = ({
    savedQueryUuid: queryUuidProps,
}) => {
    const params = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();
    const savedQueryUuid = queryUuidProps || params.savedQueryUuid!;
    const projectIdentifier = useProjectUuid();
    const isProjectUuid = isUuidString(projectIdentifier ?? '');
    const projectsQuery = useProjects({
        enabled: !!projectIdentifier && !isProjectUuid,
    });
    const projectUuid = isProjectUuid
        ? projectIdentifier
        : projectsQuery.data?.find(
              (project) => project.slug === projectIdentifier,
          )?.projectUuid;
    const projectQuery = useProject(projectUuid);
    const projectRouteContext = useMemo(
        () =>
            projectUuid && projectQuery.data
                ? {
                      project: projectQuery.data,
                      projectUuid,
                      projectUrlIdentifier: getProjectUrlIdentifier(
                          projectQuery.data,
                      ),
                  }
                : null,
        [projectQuery.data, projectUuid],
    );

    const { data, isInitialLoading, isError, error } = useSavedQuery({
        uuidOrSlug: savedQueryUuid,
        projectUuid,
    });

    // Create store once with useState
    const [store] = useState(() => createExplorerStore());

    // White page background for screenshot/PDF exports, regardless of theme
    useEffect(() => {
        document.documentElement.style.backgroundColor = 'white';
        document.body.style.backgroundColor = 'white';
    }, []);

    // Reset store state when data changes
    useEffect(() => {
        if (!data) return;

        const initialState = buildInitialExplorerState({
            savedChart: data,
            minimal: true,
            expandedSections: [ExplorerSection.VISUALIZATION],
        });

        store.dispatch(explorerActions.reset(initialState));
    }, [data, store]);

    if (
        projectsQuery.isError ||
        projectQuery.isError ||
        isError ||
        (!projectUuid && !projectsQuery.isInitialLoading)
    ) {
        return (
            <>
                <span>
                    {projectsQuery.error?.error.message ??
                        projectQuery.error?.error.message ??
                        error?.error.message ??
                        `Cannot find project: ${projectIdentifier}`}
                </span>
                <ScreenshotReadyIndicator
                    tilesTotal={1}
                    tilesReady={0}
                    tilesErrored={1}
                />
            </>
        );
    }

    // Early return if no data yet
    if (
        projectsQuery.isInitialLoading ||
        projectQuery.isInitialLoading ||
        isInitialLoading ||
        !projectRouteContext ||
        !data
    ) {
        return null;
    }

    return (
        <ProjectRouteContext.Provider value={projectRouteContext}>
            <Provider store={store} key={`minimal-${savedQueryUuid}`}>
                <MinimalExplorerContent />
            </Provider>
        </ProjectRouteContext.Provider>
    );
};

export default MinimalSavedExplorer;
