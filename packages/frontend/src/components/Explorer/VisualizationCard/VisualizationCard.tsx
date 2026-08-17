import { subject } from '@casl/ability';
import {
    derivePivotConfigurationFromChart,
    ECHARTS_DEFAULT_COLORS,
    getFieldsFromMetricQuery,
    getHiddenTableFields,
    getPivotConfig,
    NotFoundError,
    type ApiErrorDetail,
    type ChartConfig,
    type ChartType,
    type EChartsSeries,
    type FieldId,
} from '@lightdash/common';
import { Button, useComputedColorScheme } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useLayoutEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { createPortal } from 'react-dom';
import ErrorBoundary from '../../../features/errorBoundary/ErrorBoundary';
import {
    explorerActions,
    selectIsEditMode,
    selectIsVisualizationConfigOpen,
    selectIsVisualizationExpanded,
    selectSavedChart,
    selectSorts,
    selectTableCalculationsMetadata,
    selectUnsavedChartVersion,
    selectUnsavedColorPaletteUuid,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useMergeSafe } from '../../../features/mergeQuery/context/useMerge';
import { resolveMergeColumnOrder } from '../../../features/mergeQuery/utils/resolveMergeColumnOrder';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import { useProjectColorPalette } from '../../../hooks/appearance/useProjectColorPalette';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useFullscreen from '../../../providers/Fullscreen/useFullscreen';
import ChartDownloadMenu from '../../common/ChartDownload/ChartDownloadMenu';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import LightdashVisualization from '../../LightdashVisualization';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { type EchartsSeriesClickEvent } from '../../SimpleChart';
import SortButton from '../../SortButton';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';
import { DevCopyChartDebugData } from '../ExplorerHeader/DevCopyChartDebugData';
import VisualizationConfig from '../VisualizationCard/VisualizationConfig';
import { SeriesContextMenu } from './SeriesContextMenu';
import VisualizationTimezone from './VisualizationTimezone';
import VisualizationWarning from './VisualizationWarning';

export type EchartsClickEvent = {
    event: EchartsSeriesClickEvent;
    dimensions: string[];
    series: EChartsSeries[];
};

type Props = {
    projectUuid?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const VisualizationCard: FC<Props> = memo((props) => {
    const {
        projectUuid: fallBackUUid,
        onScreenshotReady,
        onScreenshotError,
    } = props;
    const { health } = useApp();
    const { data: org } = useOrganization();
    const colorScheme = useComputedColorScheme();
    const dispatch = useExplorerDispatch();
    // In fullscreen the chart card header is hidden so the chart owns the viewport
    const { isFullscreen } = useFullscreen();

    // Get savedChart from Redux
    const savedChart = useExplorerSelector(selectSavedChart);

    const sorts = useExplorerSelector(selectSorts);

    const projectUuid = savedChart?.projectUuid || fallBackUUid;
    const stagedColorPaletteUuid = useExplorerSelector(
        selectUnsavedColorPaletteUuid,
    );
    // When the user has explicitly cleared a previously-set chart-level
    // palette, ask the resolver to skip the chart-level branch but seed
    // the space walk from the chart's own space — otherwise the resolver
    // loses the space cascade entirely and falls back to project/org.
    const isClearingChartLevelPalette =
        stagedColorPaletteUuid === null && savedChart?.colorPaletteUuid != null;
    const { data: resolvedPalette } = useProjectColorPalette(projectUuid, {
        chartUuid: isClearingChartLevelPalette ? undefined : savedChart?.uuid,
        spaceUuid: isClearingChartLevelPalette
            ? savedChart?.spaceUuid
            : undefined,
        dashboardUuid: savedChart?.dashboardUuid ?? undefined,
    });

    const { data: palettes } = useColorPalettes({
        enabled: stagedColorPaletteUuid !== null,
    });
    const stagedPalette = useMemo(() => {
        if (stagedColorPaletteUuid === null) {
            return undefined;
        }
        return palettes?.find(
            (p) => p.colorPaletteUuid === stagedColorPaletteUuid,
        );
    }, [stagedColorPaletteUuid, palettes]);

    const colorPalette = useMemo(() => {
        if (stagedPalette) {
            if (colorScheme === 'dark' && stagedPalette.darkColors) {
                return stagedPalette.darkColors;
            }
            return stagedPalette.colors;
        }
        if (colorScheme === 'dark' && resolvedPalette?.darkColors) {
            return resolvedPalette.darkColors;
        }
        return resolvedPalette?.colors ?? ECHARTS_DEFAULT_COLORS;
    }, [colorScheme, resolvedPalette, stagedPalette]);

    const {
        query,
        queryResults,
        isLoading,
        getDownloadQueryUuid,
        validQueryArgs,
    } = useExplorerQuery();
    // A configured merge replaces the query it was built from: its result is
    // the chart's result, so running both would cost two warehouse queries to
    // show one of them.
    const merge = useMergeSafe();
    const mergeResults = merge?.mergeResults ?? null;
    // A restored merge is the chart. Until it lands, the primary source's rows are the
    // wrong numbers wearing the right config — show loading, not them.
    const awaitingRestoredMerge =
        !!merge?.isMerging &&
        merge.wasRestored &&
        !mergeResults &&
        !merge.runError &&
        merge.runErrors.length === 0;
    const suppressPrimaryResults =
        awaitingRestoredMerge ||
        (!!merge?.isMerging &&
            !mergeResults &&
            (merge.isRunning ||
                !!merge.runError ||
                merge.runErrors.length > 0));
    const isLoadingQueryResults = mergeResults
        ? mergeResults.results.isFetchingRows
        : !!merge?.isRunning ||
          awaitingRestoredMerge ||
          isLoading ||
          queryResults.isFetchingRows;

    const resultsData = useMemo(() => {
        if (mergeResults) {
            return {
                ...mergeResults.results,
                metricQuery: mergeResults.metricQuery,
                fields: mergeResults.fields,
                resolvedTimezone: undefined,
            };
        }
        // No fields and no rows while the restored merge is pending: the
        // chart config validates its layout against whatever fields it is
        // given, and primary-source fields would fail the saved merged layout and
        // rebuild it from defaults — silently discarding the saved config.
        if (suppressPrimaryResults) {
            return {
                ...queryResults,
                rows: [],
                metricQuery: undefined,
                fields: undefined,
                resolvedTimezone: undefined,
            };
        }
        return {
            ...queryResults,
            metricQuery: query.data?.metricQuery,
            fields: query.data?.fields,
            resolvedTimezone: query.data?.resolvedTimezone ?? undefined,
        };
    }, [query.data, queryResults, mergeResults, suppressPrimaryResults]);

    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const visualizationMetricQuery = suppressPrimaryResults
        ? undefined
        : (mergeResults?.metricQuery ?? unsavedChartVersion.metricQuery);
    const visualizationColumnOrder = mergeResults
        ? resolveMergeColumnOrder(
              mergeResults.columnOrder,
              unsavedChartVersion.tableConfig.columnOrder,
          )
        : unsavedChartVersion.tableConfig.columnOrder;

    const handleSetPivotFields = useCallback(
        (fields: FieldId[] = []) => {
            dispatch(explorerActions.setPivotColumns(fields));
        },
        [dispatch],
    );

    const handleSetPivotRows = useCallback(
        (rows: FieldId[] = []) => {
            dispatch(explorerActions.setPivotRows(rows));
        },
        [dispatch],
    );

    const handleSetChartType = useCallback(
        (chartType: ChartType) => {
            dispatch(explorerActions.setChartType({ chartType }));
        },
        [dispatch],
    );

    const handleSetChartConfig = useCallback(
        (chartConfig: ChartConfig) => {
            dispatch(
                explorerActions.setChartConfig({
                    chartConfig,
                }),
            );
        },
        [dispatch],
    );

    const isVisualizationExpanded = useExplorerSelector(
        selectIsVisualizationExpanded,
    );
    // Without the heading there is no way to expand the card, so force it open
    const isOpen = isVisualizationExpanded || isFullscreen;
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const isVisualizationConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );
    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );

    const tableCalculationsMetadata = useExplorerSelector(
        selectTableCalculationsMetadata,
    );

    const toggleSection = useCallback(
        () => toggleExpandedSection(ExplorerSection.VISUALIZATION),
        [toggleExpandedSection],
    );

    const { data: explore } = useExplore(unsavedChartVersion.tableName);

    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartsClickEvent>();

    const openVisualizationConfig = useCallback(
        () => dispatch(explorerActions.openVisualizationConfig()),
        [dispatch],
    );
    const closeVisualizationConfig = useCallback(
        () => dispatch(explorerActions.closeVisualizationConfig()),
        [dispatch],
    );

    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    const {
        ref: measureRef,
        width: containerWidth,
        height: containerHeight,
    } = useElementSize();

    useLayoutEffect(() => {
        if (isVisualizationConfigOpen) {
            const target = document.getElementById(VisualizationConfigPortalId);
            setPortalTarget(target);
        } else {
            setPortalTarget(null);
        }
    }, [isVisualizationConfigOpen]);

    useLayoutEffect(() => {
        if (!isEditMode) {
            closeVisualizationConfig();
        }
    }, [isEditMode, closeVisualizationConfig]);

    useLayoutEffect(() => {
        if (!isOpen) {
            closeVisualizationConfig();
        }
    }, [closeVisualizationConfig, isOpen]);

    const onSeriesContextMenu = useCallback(
        (e: EchartsSeriesClickEvent, series: EChartsSeries[]) => {
            setEchartsClickEvent({
                event: e,
                dimensions: visualizationMetricQuery?.dimensions ?? [],
                series,
            });
        },
        [visualizationMetricQuery],
    );

    const { missingRequiredParameters } = useExplorerQuery();

    const apiErrorDetail = useMemo(() => {
        const queryError = query.error?.error ?? queryResults.error?.error;

        if (merge?.runError) return merge.runError.error;
        if (merge?.runErrors.length) {
            return {
                message: merge.runErrors
                    .map((error) => error.message)
                    .join(' '),
                name: 'Error',
                statusCode: 400,
                data: {},
            } satisfies ApiErrorDetail;
        }

        return !missingRequiredParameters?.length
            ? queryError
            : // Mimicking an API Error Detail so it can be used in the EmptyState component
              ({
                  message: 'Missing required parameters',
                  name: 'Error',
                  statusCode: 400,
                  data: {},
              } satisfies ApiErrorDetail);
    }, [
        query.error?.error,
        queryResults.error?.error,
        missingRequiredParameters,
        merge?.runError,
        merge?.runErrors,
    ]);

    const dirtyPivotConfiguration = useMemo(() => {
        const fields =
            mergeResults?.fields ??
            (explore
                ? getFieldsFromMetricQuery(
                      unsavedChartVersion.metricQuery,
                      explore,
                  )
                : undefined);

        return visualizationMetricQuery && fields
            ? derivePivotConfigurationFromChart(
                  unsavedChartVersion,
                  visualizationMetricQuery,
                  fields,
              )
            : undefined;
    }, [
        unsavedChartVersion,
        explore,
        mergeResults?.fields,
        visualizationMetricQuery,
    ]);

    if (!unsavedChartVersion.tableName) {
        return <CollapsableCard title="Charts" disabled />;
    }

    const getGsheetLink = async (
        exportColumnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
    ) => {
        if (explore?.name && unsavedChartVersion?.metricQuery && projectUuid) {
            const gsheetResponse = await uploadGsheet({
                projectUuid,
                exploreId: explore?.name,
                metricQuery: unsavedChartVersion?.metricQuery,
                columnOrder: exportColumnOrder,
                showTableNames,
                customLabels,
                hiddenFields: getHiddenTableFields(
                    unsavedChartVersion.chartConfig,
                ),
                pivotConfig: getPivotConfig(unsavedChartVersion),
            });
            return gsheetResponse;
        }
        throw new NotFoundError('no metric query defined');
    };

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <ErrorBoundary>
            <VisualizationProvider
                key={savedChart?.uuid}
                chartConfig={unsavedChartVersion.chartConfig}
                initialPivotDimensions={
                    unsavedChartVersion.pivotConfig?.columns
                }
                initialPivotRows={unsavedChartVersion.pivotConfig?.rows}
                unsavedMetricQuery={visualizationMetricQuery}
                resultsData={resultsData}
                apiErrorDetail={apiErrorDetail}
                isLoading={isLoadingQueryResults}
                columnOrder={visualizationColumnOrder}
                onSeriesContextMenu={onSeriesContextMenu}
                savedChartUuid={isEditMode ? undefined : savedChart?.uuid}
                onChartConfigChange={handleSetChartConfig}
                onChartTypeChange={handleSetChartType}
                onPivotDimensionsChange={handleSetPivotFields}
                onPivotRowsChange={handleSetPivotRows}
                colorPalette={colorPalette}
                tableCalculationsMetadata={tableCalculationsMetadata}
                parameters={
                    mergeResults?.usedParametersValues ??
                    query.data?.usedParametersValues
                }
                containerWidth={containerWidth}
                containerHeight={containerHeight}
                isDashboard={false}
                isEditMode={isEditMode}
                invalidateCache={validQueryArgs?.invalidateCache}
            >
                <CollapsableCard
                    title="Chart"
                    isOpen={isOpen}
                    isVisualizationCard
                    hideHeading={isFullscreen}
                    onToggle={toggleSection}
                    headerElement={
                        isOpen && (
                            <>
                                {sorts.length > 0 && (
                                    <SortButton
                                        sorts={sorts}
                                        isEditMode={isEditMode}
                                    />
                                )}
                                <VisualizationWarning
                                    dirtyPivotConfiguration={
                                        dirtyPivotConfiguration
                                    }
                                    chartConfig={
                                        unsavedChartVersion.chartConfig
                                    }
                                    resultsData={resultsData}
                                    isLoading={isLoadingQueryResults}
                                    maxColumnLimit={
                                        health.data?.pivotTable?.maxColumnLimit
                                    }
                                />
                            </>
                        )
                    }
                    rightHeaderElement={
                        isOpen && (
                            <>
                                <VisualizationTimezone
                                    resolvedTimezone={
                                        query.data?.resolvedTimezone
                                    }
                                    timezoneSetting={
                                        query.data?.metricQuery?.timezone
                                    }
                                />
                                {isEditMode ? (
                                    <Button
                                        {...COLLAPSABLE_CARD_BUTTON_PROPS}
                                        onClick={
                                            isVisualizationConfigOpen
                                                ? closeVisualizationConfig
                                                : openVisualizationConfig
                                        }
                                        rightSection={
                                            <MantineIcon
                                                icon={
                                                    isVisualizationConfigOpen
                                                        ? IconLayoutSidebarLeftCollapse
                                                        : IconLayoutSidebarLeftExpand
                                                }
                                            />
                                        }
                                    >
                                        {isVisualizationConfigOpen
                                            ? 'Close configure'
                                            : 'Configure'}
                                    </Button>
                                ) : null}

                                {/*
                                 * NOTE: not using Mantine Portal because this page lacks a MantineProvider
                                 * TODO: use Mantine Portal with reuseTargetNode flag to avoid rendering additional divs
                                 */}
                                {portalTarget &&
                                    createPortal(
                                        <VisualizationConfig
                                            chartType={
                                                unsavedChartVersion.chartConfig
                                                    .type
                                            }
                                            onClose={closeVisualizationConfig}
                                        />,
                                        portalTarget,
                                    )}

                                <Can
                                    I="manage"
                                    this={subject('Explore', {
                                        organizationUuid: org?.organizationUuid,
                                        projectUuid,
                                    })}
                                >
                                    {!!projectUuid && (
                                        <ChartDownloadMenu
                                            getDownloadQueryUuid={
                                                mergeResults && merge
                                                    ? merge.getDownloadQueryUuid
                                                    : getDownloadQueryUuid
                                            }
                                            projectUuid={projectUuid}
                                            chartName={savedChart?.name}
                                            getGsheetLink={
                                                mergeResults
                                                    ? undefined
                                                    : getGsheetLink
                                            }
                                        />
                                    )}
                                </Can>

                                {import.meta.env.DEV && (
                                    <DevCopyChartDebugData />
                                )}
                            </>
                        )
                    }
                >
                    <LightdashVisualization
                        ref={measureRef}
                        className="sentry-block ph-no-capture"
                        data-testid="visualization"
                        onScreenshotReady={onScreenshotReady}
                        onScreenshotError={onScreenshotError}
                    />
                    <SeriesContextMenu
                        echartsSeriesClickEvent={echartsClickEvent?.event}
                        dimensions={echartsClickEvent?.dimensions}
                        series={echartsClickEvent?.series}
                        explore={explore}
                    />
                </CollapsableCard>
            </VisualizationProvider>
        </ErrorBoundary>
    );
});

export default VisualizationCard;
