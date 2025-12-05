import { subject } from '@casl/ability';
import {
    CartesianSeriesType,
    ChartType,
    createDashboardFilterRuleFromField,
    DashboardTileTypes,
    FeatureFlags,
    getCustomLabelsFromTableConfig,
    getDimensions,
    getFields,
    getHiddenTableFields,
    getItemId,
    getItemMap,
    getPivotConfig,
    getVisibleFields,
    hasCustomBinDimension,
    isCartesianChartConfig,
    isCompleteLayout,
    isDashboardChartTileType,
    isFilterableField,
    isTableChartConfig,
    type ApiChartAndResults,
    type ApiError,
    type Dashboard,
    type DashboardFilterRule,
    type EChartsSeries,
    type Field,
    type FilterDashboardToRule,
    type DashboardChartTile as IDashboardChartTile,
    type ItemsMap,
    type PivotReference,
    type ResultValue,
    type SavedChart,
    type Series,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Group,
    HoverCard,
    Menu,
    Portal,
    Stack,
    Text,
    Tooltip,
    useMantineColorScheme,
} from '@mantine/core';
import { useClipboard, useElementSize } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconClock,
    IconCopy,
    IconFilter,
    IconFolders,
    IconStack,
    IconTableExport,
    IconTelescope,
    IconVariable,
} from '@tabler/icons-react';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type RefObject,
} from 'react';
import { useParams } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import { formatChartErrorMessage } from '../../utils/chartErrorUtils';
import { type EChartsReact } from '../EChartsReactWrapper';

type ClientSideError = {
    error: {
        name: string;
        message: string;
    };
};

type DashboardTileError = ApiError | ClientSideError;

import { DashboardTileComments } from '../../features/comments';
import { DateZoomInfoOnTile } from '../../features/dateZoom';
import { ExportToGoogleSheet } from '../../features/export';
import {
    getExpectedSeriesMap,
    mergeExistingAndExpectedSeries,
} from '../../hooks/cartesianChartConfig/utils';
import { useDashboardChartDownload } from '../../hooks/dashboard/useDashboardChartDownload';
import {
    useDashboardChartReadyQuery,
    type DashboardChartReadyQuery,
} from '../../hooks/dashboard/useDashboardChartReadyQuery';
import useDashboardFiltersForTile from '../../hooks/dashboard/useDashboardFiltersForTile';
import { uploadGsheet } from '../../hooks/gdrive/useGdrive';
import { useOrganization } from '../../hooks/organization/useOrganization';
import useToaster from '../../hooks/toaster/useToaster';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useFeatureFlagEnabled } from '../../hooks/useFeatureFlagEnabled';
import usePivotDimensions from '../../hooks/usePivotDimensions';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import {
    useInfiniteQueryResults,
    type InfiniteQueryResults,
} from '../../hooks/useQueryResults';
import { useDuplicateChartMutation } from '../../hooks/useSavedQuery';
import { useCreateShareMutation } from '../../hooks/useShare';
import { useAccount } from '../../hooks/user/useAccount';
import { Can } from '../../providers/Ability';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { FilterDashboardTo } from '../DashboardFilter/FilterDashboardTo';
import LightdashVisualization from '../LightdashVisualization';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { DrillDownModal } from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';
import { getDataFromChartClick } from '../MetricQueryData/utils';
import { type EchartsSeriesClickEvent } from '../SimpleChart';
import { getConditionalRuleLabelFromItem } from '../common/Filters/FilterInputs/utils';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import MoveChartThatBelongsToDashboardModal from '../common/modal/MoveChartThatBelongsToDashboardModal';
import { DashboardExportImage } from './DashboardExportImage';
import EditChartMenuItem from './EditChartMenuItem';
import ExportDataModal from './ExportDataModal';
import TileBase from './TileBase/index';
import { UnderlyingDataMenuItem } from './UnderlyingDataMenuItem';

interface ExportGoogleSheetProps {
    savedChart: SavedChart;
    disabled?: boolean;
}

const ExportGoogleSheet: FC<ExportGoogleSheetProps> = ({
    savedChart,
    disabled,
}) => {
    const getGsheetLink = async () => {
        return uploadGsheet({
            projectUuid: savedChart.projectUuid,
            exploreId: savedChart.tableName,
            metricQuery: savedChart.metricQuery,
            columnOrder: savedChart.tableConfig.columnOrder,
            showTableNames: isTableChartConfig(savedChart.chartConfig.config)
                ? savedChart.chartConfig.config.showTableNames ?? false
                : true,
            customLabels: getCustomLabelsFromTableConfig(
                savedChart.chartConfig.config,
            ),
            hiddenFields: getHiddenTableFields(savedChart.chartConfig),
            pivotConfig: getPivotConfig(savedChart),
        });
    };

    return (
        <ExportToGoogleSheet
            getGsheetLink={getGsheetLink}
            asMenuItem
            disabled={disabled}
        />
    );
};

/**
 * We need to compute these series on dashboards to populate properly fallbackColors in VisualizationProvider
 * otherwise, some series will appear as transparent
 * on view charts, this information is refreshed from the explore.
 * This is the most basic function that runs on useEchartsCartesianConfig to generate series
 *
 * This is passed to computedSeries prop in VisualizationProvider
 * We don't want to override the chartConfig, to cause conflicts with other visualization stuff.
 */
const computeDashboardChartSeries = (
    chart: ApiChartAndResults['chart'],
    validPivotDimensions: string[] | undefined,
    resultData: InfiniteQueryResults | undefined,
    itemsMap: ItemsMap,
) => {
    if (!chart.chartConfig || !resultData || resultData.rows.length === 0) {
        return [];
    }

    if (
        isCartesianChartConfig(chart.chartConfig.config) &&
        isCompleteLayout(chart.chartConfig.config.layout)
    ) {
        const firstSerie = chart.chartConfig.config.eChartsConfig.series?.[0];

        const expectedSeriesMap = getExpectedSeriesMap({
            defaultSmooth: firstSerie?.smooth,
            defaultShowSymbol: firstSerie?.showSymbol,
            defaultAreaStyle: firstSerie?.areaStyle,
            defaultCartesianType: CartesianSeriesType.BAR,
            availableDimensions: chart.metricQuery.dimensions,
            isStacked: false,
            pivotKeys: validPivotDimensions,
            resultsData: resultData,
            xField: chart.chartConfig.config.layout.xField,
            yFields: chart.chartConfig.config.layout.yField,
            defaultLabel: firstSerie?.label,
            itemsMap,
        });
        const newSeries = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries: chart.chartConfig.config.eChartsConfig.series || [],
        });
        return newSeries;
    }
    return [];
};

const ValidDashboardChartTile: FC<{
    tileUuid: string;
    dashboardChartReadyQuery: DashboardChartReadyQuery;
    resultsData: InfiniteQueryResults;
    isTitleHidden?: boolean;
    project: string;
    onSeriesContextMenu?: (
        e: EchartsSeriesClickEvent,
        series: EChartsSeries[],
    ) => void;
    setEchartsRef?: (ref: RefObject<EChartsReact | null> | undefined) => void;
}> = ({
    tileUuid,
    isTitleHidden = false,
    dashboardChartReadyQuery,
    resultsData,
    onSeriesContextMenu,
    setEchartsRef,
}) => {
    const addResultsCacheTime = useDashboardContext(
        (c) => c.addResultsCacheTime,
    );

    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const invalidateCache = useDashboardContext((c) => c.invalidateCache);

    const { health } = useApp();
    const { data: org } = useOrganization();
    const { colorScheme } = useMantineColorScheme();

    const {
        ref: measureRef,
        width: containerWidth,
        height: containerHeight,
    } = useElementSize();

    const {
        executeQueryResponse: { cacheMetadata, metricQuery, fields },
        chart,
    } = dashboardChartReadyQuery;

    useEffect(() => {
        addResultsCacheTime(cacheMetadata);
    }, [cacheMetadata, addResultsCacheTime]);

    const { validPivotDimensions } = usePivotDimensions(
        chart.pivotConfig?.columns,
        metricQuery,
    );

    const computedSeries: Series[] = useMemo(() => {
        return computeDashboardChartSeries(
            chart,
            validPivotDimensions,
            resultsData,
            fields,
        );
    }, [resultsData, chart, validPivotDimensions, fields]);

    const resultsDataWithQueryData = useMemo(
        () => ({
            ...resultsData,
            metricQuery:
                dashboardChartReadyQuery.executeQueryResponse.metricQuery,
            fields: dashboardChartReadyQuery.executeQueryResponse.fields,
        }),
        [
            resultsData,
            dashboardChartReadyQuery.executeQueryResponse.metricQuery,
            dashboardChartReadyQuery.executeQueryResponse.fields,
        ],
    );

    const colorPalette = useMemo(() => {
        if (colorScheme === 'dark' && org?.chartDarkColors) {
            return org.chartDarkColors;
        }
        return org?.chartColors ?? chart.colorPalette;
    }, [
        colorScheme,
        org?.chartColors,
        org?.chartDarkColors,
        chart.colorPalette,
    ]);

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            chartConfig={chart.chartConfig}
            initialPivotDimensions={chart.pivotConfig?.columns}
            resultsData={resultsDataWithQueryData}
            isLoading={resultsData.isFetchingRows}
            onSeriesContextMenu={onSeriesContextMenu}
            columnOrder={chart.tableConfig.columnOrder}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
            savedChartUuid={chart.uuid}
            dashboardFilters={dashboardFilters}
            invalidateCache={invalidateCache}
            colorPalette={colorPalette}
            setEchartsRef={setEchartsRef}
            computedSeries={computedSeries}
            parameters={
                dashboardChartReadyQuery.executeQueryResponse
                    .usedParametersValues
            }
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            isDashboard
        >
            <LightdashVisualization
                ref={measureRef}
                isDashboard
                tileUuid={tileUuid}
                isTitleHidden={isTitleHidden}
            />
        </VisualizationProvider>
    );
};

const ValidDashboardChartTileMinimal: FC<{
    tileUuid: string;
    isTitleHidden?: boolean;
    title: string;
    chart: SavedChart;
    dashboardChartReadyQuery: DashboardChartReadyQuery;
    onSeriesContextMenu?: (
        e: EchartsSeriesClickEvent,
        series: EChartsSeries[],
    ) => void;
    resultsData: InfiniteQueryResults;
    setEchartsRef?: (ref: RefObject<EChartsReact | null> | undefined) => void;
}> = ({
    tileUuid,
    chart,
    dashboardChartReadyQuery,
    resultsData,
    isTitleHidden = false,
    onSeriesContextMenu,
    setEchartsRef,
}) => {
    const { health } = useApp();
    const { data: org } = useOrganization();
    const { colorScheme } = useMantineColorScheme();

    const dashboardFilters = useDashboardFiltersForTile(tileUuid);

    const {
        ref: measureRef,
        width: containerWidth,
        height: containerHeight,
    } = useElementSize();

    const { validPivotDimensions } = usePivotDimensions(
        chart.pivotConfig?.columns,
        dashboardChartReadyQuery.executeQueryResponse.metricQuery,
    );

    const computedSeries: Series[] = useMemo(() => {
        return computeDashboardChartSeries(
            chart,
            validPivotDimensions,
            resultsData,
            dashboardChartReadyQuery.executeQueryResponse?.fields,
        );
    }, [
        resultsData,
        chart,
        validPivotDimensions,
        dashboardChartReadyQuery.executeQueryResponse?.fields,
    ]);

    const resultsDataWithQueryData = useMemo(
        () => ({
            ...resultsData,
            metricQuery:
                dashboardChartReadyQuery.executeQueryResponse.metricQuery,
            fields: dashboardChartReadyQuery.executeQueryResponse.fields,
        }),
        [
            resultsData,
            dashboardChartReadyQuery.executeQueryResponse.metricQuery,
            dashboardChartReadyQuery.executeQueryResponse.fields,
        ],
    );

    const colorPalette = useMemo(() => {
        if (colorScheme === 'dark' && org?.chartDarkColors) {
            return org.chartDarkColors;
        }
        return org?.chartColors ?? chart.colorPalette;
    }, [
        colorScheme,
        org?.chartColors,
        org?.chartDarkColors,
        chart.colorPalette,
    ]);

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            minimal
            chartConfig={chart.chartConfig}
            initialPivotDimensions={chart.pivotConfig?.columns}
            resultsData={resultsDataWithQueryData}
            isLoading={resultsData.isFetchingRows}
            onSeriesContextMenu={onSeriesContextMenu}
            columnOrder={chart.tableConfig.columnOrder}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
            savedChartUuid={chart.uuid}
            dashboardFilters={dashboardFilters}
            colorPalette={colorPalette}
            setEchartsRef={setEchartsRef}
            computedSeries={computedSeries}
            parameters={
                dashboardChartReadyQuery.executeQueryResponse
                    .usedParametersValues
            }
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            isDashboard
        >
            <LightdashVisualization
                ref={measureRef}
                isDashboard
                tileUuid={tileUuid}
                isTitleHidden={isTitleHidden}
            />
        </VisualizationProvider>
    );
};

interface DashboardChartTileMainProps
    extends Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    > {
    tile: IDashboardChartTile;
    dashboardChartReadyQuery: DashboardChartReadyQuery;
    resultsData: InfiniteQueryResults;
    onAddTiles?: (tiles: Dashboard['tiles'][number][]) => void;
    canExportCsv?: boolean;
    canExportImages?: boolean;
    canExportPagePdf?: boolean;
    canDateZoom?: boolean;
    onExplore?: (options: { chart: SavedChart }) => void;
}

const DashboardChartTileMain: FC<DashboardChartTileMainProps> = (props) => {
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const { track } = useTracking();
    const ability = useAbilityContext();
    const { data: account } = useAccount();
    const { organizationUuid } = account?.organization || {};

    const showExecutionTime = useFeatureFlagEnabled(
        FeatureFlags.ShowExecutionTime,
    );

    const {
        tile: {
            uuid: tileUuid,
            properties: {
                savedChartUuid,
                hideTitle,
                title,
                belongsToDashboard,
            },
        },
        dashboardChartReadyQuery,
        resultsData,
        isEditMode,
    } = props;

    const {
        executeQueryResponse: {
            appliedDashboardFilters,
            metricQuery,
            usedParametersValues,
        },
        chart,
        explore,
    } = dashboardChartReadyQuery;

    const { totalResults, initialQueryExecutionMs } = resultsData;

    const { dashboardUuid } = useParams<{ dashboardUuid: string }>();
    const projectUuid = useProjectUuid();

    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );
    const [echartRef, setEchartRef] = useState<
        RefObject<EChartsReact | null> | undefined
    >();
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);

    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();
    const [isMovingChart, setIsMovingChart] = useState(false);

    // State used to only track event on initial load. Excluding lazy load updates for table charts.
    const hasTrackedLoadEvent = useRef(false);
    useEffect(() => {
        if (dashboardChartReadyQuery.executeQueryResponse?.queryUuid) {
            // Reset the tracking flag when queryUuid changes
            hasTrackedLoadEvent.current = false;
        }
    }, [dashboardChartReadyQuery.executeQueryResponse?.queryUuid]);
    // Track chart loading time
    useEffect(() => {
        if (
            !hasTrackedLoadEvent.current &&
            !resultsData.isInitialLoading &&
            dashboardChartReadyQuery &&
            account?.user &&
            dashboardUuid
        ) {
            track({
                name: EventName.DASHBOARD_CHART_LOADED,
                properties: {
                    userId: account.user.id,
                    organizationId: chart.organizationUuid,
                    projectId: chart.projectUuid,
                    dashboardId: dashboardUuid,
                    chartId: chart.uuid,
                    queryId:
                        dashboardChartReadyQuery.executeQueryResponse.queryUuid,
                    warehouseExecutionTimeMs:
                        resultsData.initialQueryExecutionMs,
                    totalTimeMs: resultsData.totalClientFetchTimeMs,
                    totalResults: resultsData.totalResults || 0,
                    loadedRows: resultsData.rows.length,
                },
            });
            // track only once
            hasTrackedLoadEvent.current = true;
        }
    }, [
        hasTrackedLoadEvent,
        dashboardUuid,
        dashboardChartReadyQuery,
        resultsData,
        track,
        account?.user,
        chart.organizationUuid,
        chart.projectUuid,
        chart.uuid,
    ]);

    const userCanManageChart = ability.can(
        'manage',
        subject('SavedChart', { ...chart }),
    );
    const userCanViewExplore = ability?.can(
        'view',
        subject('Explore', {
            organizationUuid: chart.organizationUuid,
            projectUuid: chart.projectUuid,
        }),
    );
    const userCanExportData = ability.can(
        'manage',
        subject('ExportCsv', {
            organizationUuid: chart.organizationUuid,
            projectUuid: chart.projectUuid,
        }),
    );
    const userCanRunCustomSql = ability.can(
        'manage',
        subject('CustomSql', {
            organizationUuid: chart.organizationUuid,
            projectUuid: chart.projectUuid,
        }),
    );

    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const chartsWithDateZoomApplied = useDashboardContext(
        (c) => c.chartsWithDateZoomApplied,
    );

    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );

    const { openUnderlyingDataModal } = useMetricQueryDataContext();

    const [viewUnderlyingDataOptions, setViewUnderlyingDataOptions] = useState<{
        item: ItemsMap[string] | undefined;
        value: ResultValue;
        fieldValues: Record<string, ResultValue>;
        dimensions: string[];
        pivotReference?: PivotReference;
    }>();
    const { mutateAsync: createShareUrl } = useCreateShareMutation();

    const handleViewUnderlyingData = useCallback(() => {
        if (!viewUnderlyingDataOptions) return;

        const applyDateZoom =
            metricQuery?.metadata?.hasADateDimension &&
            savedChartUuid &&
            dateZoomGranularity &&
            chartsWithDateZoomApplied?.has(savedChartUuid);

        openUnderlyingDataModal({
            ...viewUnderlyingDataOptions,
            ...(applyDateZoom && {
                dateZoom: {
                    granularity: dateZoomGranularity,
                    xAxisFieldId: `${metricQuery?.metadata?.hasADateDimension.table}_${metricQuery?.metadata?.hasADateDimension.name}`,
                },
            }),
        });

        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: organizationUuid,
                userId: account?.user?.id,
                projectId: projectUuid,
            },
        });
    }, [
        viewUnderlyingDataOptions,
        dateZoomGranularity,
        openUnderlyingDataModal,
        track,
        organizationUuid,
        account?.user?.id,
        projectUuid,
        metricQuery?.metadata?.hasADateDimension,
        savedChartUuid,
        chartsWithDateZoomApplied,
    ]);

    const handleCopyToClipboard = useCallback(() => {
        if (!viewUnderlyingDataOptions) return;
        const value = viewUnderlyingDataOptions.value.formatted;

        clipboard.copy(value);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [viewUnderlyingDataOptions, clipboard, showToastSuccess]);

    const {
        data: duplicatedChart,
        mutateAsync: duplicateChart,
        reset: resetDuplicatedChart,
    } = useDuplicateChartMutation({
        showRedirectButton: false,
        autoRedirect: false,
        successMessage: `Chart duplicated and added at the bottom of this dashboard`,
    });

    useEffect(() => {
        if (duplicatedChart && props.onAddTiles) {
            // We duplicated a chart, we add it to the dashboard
            props.onAddTiles([
                {
                    uuid: uuid4(),
                    properties: {
                        savedChartUuid: duplicatedChart.uuid,
                        chartName: duplicatedChart.name ?? '',
                    },
                    type: DashboardTileTypes.SAVED_CHART,
                    x: 0,
                    y: 0,
                    h: props.tile.h,
                    w: props.tile.w,
                    tabUuid: props.tile.tabUuid,
                },
            ]);
            resetDuplicatedChart(); // Reset duplicated chart to avoid adding it multiple times
        }
    }, [props, duplicatedChart, resetDuplicatedChart]);
    const handleAddFilter = useCallback(
        (filter: DashboardFilterRule) => {
            track({
                name: EventName.ADD_FILTER_CLICKED,
                properties: {
                    mode: isEditMode ? 'edit' : 'viewer',
                },
            });

            const fields = explore ? getFields(explore) : [];
            const field = fields.find(
                (f) => getItemId(f) === filter.target.fieldId,
            );

            if (projectUuid && dashboardUuid) {
                track({
                    name: EventName.CROSS_FILTER_DASHBOARD_APPLIED,
                    properties: {
                        fieldType: field?.type,
                        projectId: projectUuid,
                        dashboardId: dashboardUuid,
                    },
                });
            }

            addDimensionDashboardFilter(filter, !isEditMode);
        },
        [
            track,
            isEditMode,
            addDimensionDashboardFilter,
            explore,
            projectUuid,
            dashboardUuid,
        ],
    );

    const handleCancelContextMenu = useCallback(
        (e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(),
        [],
    );

    const handleCreateShareUrl = useCallback(
        async (chartPathname: string, chartSearch: string) => {
            const shareUrl = await createShareUrl({
                path: chartPathname,
                params: `?` + chartSearch + `&fromDashboard=${dashboardUuid}`,
            });

            window.open(`/share/${shareUrl.nanoid}`, '_blank');
        },
        [createShareUrl, dashboardUuid],
    );

    const [dashboardTileFilterOptions, setDashboardTileFilterOptions] =
        useState<FilterDashboardToRule[]>([]);

    const [isDataExportModalOpen, setIsDataExportModalOpen] = useState(false);

    const onSeriesContextMenu = useCallback(
        (e: EchartsSeriesClickEvent, series: EChartsSeries[]) => {
            if (explore === undefined) {
                return;
            }
            const dimensions = getDimensions(explore).filter((dimension) =>
                e.dimensionNames.includes(getItemId(dimension)),
            );

            const dimensionOptions = dimensions.map((dimension) =>
                createDashboardFilterRuleFromField({
                    field: dimension,
                    availableTileFilters: {},
                    isTemporary: true,
                    value: e.data[getItemId(dimension)],
                }),
            );
            const serie = series[e.seriesIndex];
            const fields = getFields(explore);
            const pivot = chart.pivotConfig?.columns?.[0];
            const pivotField = fields.find(
                (field) => `${field.table}_${field.name}` === pivot,
            );
            const seriesName = serie.encode?.seriesName;

            const pivotValue =
                pivot && seriesName?.includes(`.${pivot}.`)
                    ? seriesName?.split(`.${pivot}.`)[1]
                    : undefined;

            const pivotOptions =
                pivot && pivotField && pivotValue
                    ? [
                          createDashboardFilterRuleFromField({
                              field: pivotField,
                              availableTileFilters: {},
                              isTemporary: true,
                              value: pivotValue,
                          }),
                      ]
                    : [];

            setDashboardTileFilterOptions([
                ...dimensionOptions,
                ...pivotOptions,
            ]);
            setContextMenuIsOpen(true);
            setContextMenuTargetOffset({
                left: e.event.event.pageX,
                top: e.event.event.pageY,
            });

            const allItemsMap = getItemMap(
                explore,
                chart.metricQuery.additionalMetrics,
                chart.metricQuery.tableCalculations,
            );

            const underlyingData = getDataFromChartClick(
                e,
                allItemsMap,
                series,
            );
            const queryDimensions = chart.metricQuery.dimensions || [];
            setViewUnderlyingDataOptions({
                ...underlyingData,
                dimensions: queryDimensions,
            });
        },
        [explore, chart],
    );
    const appliedFilterRules = appliedDashboardFilters
        ? [
              ...appliedDashboardFilters.dimensions,
              ...appliedDashboardFilters.metrics,
          ]
        : [];

    const chartWithDashboardFilters = useMemo(
        () => ({
            ...chart,
            metricQuery: metricQuery ?? chart.metricQuery,
        }),
        [chart, metricQuery],
    );
    const cannotUseCustomDimensions =
        !userCanRunCustomSql &&
        chartWithDashboardFilters.metricQuery?.customDimensions;

    const { pathname: chartPathname, search: chartSearch } = useMemo(() => {
        return getExplorerUrlFromCreateSavedChartVersion(
            chartWithDashboardFilters.projectUuid,
            chartWithDashboardFilters,
            true,
        );
    }, [chartWithDashboardFilters]);

    const [isCommentsMenuOpen, setIsCommentsMenuOpen] = useState(false);
    const showComments = useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canViewDashboardComments,
    );
    const tileHasComments = useDashboardContext((c) =>
        c.hasTileComments(tileUuid),
    );
    const dashboardComments = useMemo(
        () =>
            !!showComments && (
                <DashboardTileComments
                    opened={isCommentsMenuOpen}
                    onOpen={() => setIsCommentsMenuOpen(true)}
                    onClose={() => setIsCommentsMenuOpen(false)}
                    dashboardTileUuid={tileUuid}
                />
            ),
        [showComments, isCommentsMenuOpen, tileUuid],
    );

    const editButtonTooltipLabel = useMemo(() => {
        const canManageChartSpace = ability?.can(
            'manage',
            subject('Space', {
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
                spaceUuid: chart.spaceUuid,
            }),
        );

        if (!canManageChartSpace) {
            return (
                <Text>
                    Cannot edit chart belonging to space:{' '}
                    <Text span fw={500}>
                        {chart.spaceName}
                    </Text>
                </Text>
            );
        }

        return <Text>You do not have permission to edit this chart</Text>;
    }, [
        chart.organizationUuid,
        chart.projectUuid,
        chart.spaceName,
        chart.spaceUuid,
        ability,
    ]);

    // Use the custom hook for dashboard chart downloads
    const { getDownloadQueryUuid } = useDashboardChartDownload(
        tileUuid,
        chart.uuid,
        projectUuid,
        dashboardUuid,
        dashboardChartReadyQuery.executeQueryResponse.queryUuid,
    );

    const closeDataExportModal = useCallback(
        () => setIsDataExportModalOpen(false),
        [],
    );

    return (
        <>
            <TileBase
                lockHeaderVisibility={isCommentsMenuOpen}
                visibleHeaderElement={
                    // Dashboard comments button is always visible if they exist
                    tileHasComments ? dashboardComments : undefined
                }
                extraHeaderElement={
                    <>
                        {/* Dashboard comments button only appears on hover if there are no comments yet */}
                        {tileHasComments ? undefined : dashboardComments}
                        {appliedFilterRules.length > 0 && (
                            <HoverCard
                                withArrow
                                withinPortal
                                shadow="md"
                                position="bottom-end"
                                offset={4}
                                arrowOffset={10}
                            >
                                <HoverCard.Dropdown>
                                    <Stack spacing="xs" align="flex-start">
                                        <Text color="ldGray.7" fw={500}>
                                            Dashboard filter
                                            {appliedFilterRules.length > 1
                                                ? 's'
                                                : ''}{' '}
                                            applied:
                                        </Text>

                                        {appliedFilterRules.map(
                                            (filterRule) => {
                                                const fields: Field[] = explore
                                                    ? getVisibleFields(explore)
                                                    : [];

                                                const field = fields.find(
                                                    (f) => {
                                                        return (
                                                            getItemId(f) ===
                                                            filterRule.target
                                                                .fieldId
                                                        );
                                                    },
                                                );
                                                if (
                                                    !field ||
                                                    !isFilterableField(field)
                                                )
                                                    return `Tried to reference field with unknown id: ${filterRule.target.fieldId}`;

                                                const filterRuleLabels =
                                                    getConditionalRuleLabelFromItem(
                                                        filterRule,
                                                        field,
                                                    );
                                                return (
                                                    <Badge
                                                        key={filterRule.id}
                                                        variant="outline"
                                                        color="ldGray.4"
                                                        radius="sm"
                                                        size="lg"
                                                        fz="xs"
                                                        fw="normal"
                                                        style={{
                                                            textTransform:
                                                                'none',
                                                            color: 'black',
                                                        }}
                                                    >
                                                        <Text
                                                            fw={600}
                                                            span
                                                            color="foreground"
                                                        >
                                                            {
                                                                filterRuleLabels.field
                                                            }
                                                            :
                                                        </Text>{' '}
                                                        {filterRule.disabled ? (
                                                            <Text
                                                                color="foreground"
                                                                span
                                                            >
                                                                is any value
                                                            </Text>
                                                        ) : (
                                                            <>
                                                                <Text
                                                                    span
                                                                    color="foreground"
                                                                >
                                                                    {
                                                                        filterRuleLabels.operator
                                                                    }
                                                                </Text>{' '}
                                                                <Text
                                                                    fw={600}
                                                                    span
                                                                    color="foreground"
                                                                >
                                                                    {
                                                                        filterRuleLabels.value
                                                                    }
                                                                </Text>
                                                            </>
                                                        )}
                                                    </Badge>
                                                );
                                            },
                                        )}
                                    </Stack>
                                </HoverCard.Dropdown>

                                <HoverCard.Target>
                                    <ActionIcon size="sm">
                                        <MantineIcon icon={IconFilter} />
                                    </ActionIcon>
                                </HoverCard.Target>
                            </HoverCard>
                        )}
                        {usedParametersValues &&
                            Object.keys(usedParametersValues).length > 0 && (
                                <HoverCard
                                    withArrow
                                    withinPortal
                                    shadow="md"
                                    position="bottom-end"
                                    offset={4}
                                    arrowOffset={10}
                                >
                                    <HoverCard.Dropdown>
                                        <Text color="ldGray.7" fw={500} mb="xs">
                                            Parameters
                                        </Text>
                                        <Stack
                                            spacing="xs"
                                            align="flex-start"
                                            ml="xs"
                                        >
                                            {Object.entries(
                                                usedParametersValues,
                                            ).map(([key, value]) => (
                                                <Text
                                                    key={key}
                                                    size="xs"
                                                    color="ldGray.6"
                                                >
                                                    <Text span fw={600}>
                                                        {parameterDefinitions[
                                                            key
                                                        ]?.label || key}
                                                        :
                                                    </Text>{' '}
                                                    {Array.isArray(value)
                                                        ? value.join(', ')
                                                        : value}
                                                </Text>
                                            ))}
                                        </Stack>
                                    </HoverCard.Dropdown>

                                    <HoverCard.Target>
                                        <ActionIcon size="sm">
                                            <MantineIcon icon={IconVariable} />
                                        </ActionIcon>
                                    </HoverCard.Target>
                                </HoverCard>
                            )}
                        {showExecutionTime &&
                            initialQueryExecutionMs !== undefined &&
                            resultsData.totalClientFetchTimeMs !==
                                undefined && (
                                <HoverCard
                                    withArrow
                                    withinPortal
                                    shadow="md"
                                    position="bottom-end"
                                    offset={4}
                                    arrowOffset={10}
                                >
                                    <HoverCard.Dropdown>
                                        <Text
                                            size="xs"
                                            color="ldGray.6"
                                            fw={600}
                                        >
                                            Warehouse execution time:{' '}
                                            {initialQueryExecutionMs}
                                            ms
                                        </Text>
                                        <Text
                                            size="xs"
                                            color="ldGray.6"
                                            fw={600}
                                        >
                                            Total time:{' '}
                                            {resultsData.totalClientFetchTimeMs}
                                            ms
                                        </Text>
                                    </HoverCard.Dropdown>
                                    <HoverCard.Target>
                                        <ActionIcon size="sm">
                                            <MantineIcon icon={IconClock} />
                                        </ActionIcon>
                                    </HoverCard.Target>
                                </HoverCard>
                            )}
                    </>
                }
                titleLeftIcon={
                    metricQuery?.metadata?.hasADateDimension &&
                    savedChartUuid &&
                    dateZoomGranularity &&
                    chartsWithDateZoomApplied?.has(savedChartUuid) ? (
                        <DateZoomInfoOnTile
                            dateDimension={
                                metricQuery.metadata.hasADateDimension
                            }
                            dateZoomGranularity={dateZoomGranularity}
                        />
                    ) : null
                }
                title={title || chart.name || ''}
                chartName={chart.name}
                titleHref={`/projects/${projectUuid}/saved/${savedChartUuid}/`}
                description={chart.description}
                belongsToDashboard={belongsToDashboard}
                extraMenuItems={
                    savedChartUuid !== null &&
                    (userCanViewExplore ||
                        userCanManageChart ||
                        userCanExportData) && (
                        <>
                            <Tooltip
                                disabled={!isEditMode}
                                label="Finish editing dashboard to use these actions"
                                variant="xs"
                            >
                                <Box>
                                    <Tooltip
                                        disabled={
                                            userCanManageChart || isEditMode
                                        }
                                        label={editButtonTooltipLabel}
                                        position="top-start"
                                        variant="xs"
                                    >
                                        <Box>
                                            <EditChartMenuItem
                                                tile={props.tile}
                                                disabled={
                                                    isEditMode ||
                                                    !userCanManageChart
                                                }
                                            />
                                        </Box>
                                    </Tooltip>

                                    {userCanViewExplore && chartPathname && (
                                        <Tooltip
                                            label={
                                                'This chart contains custom dimensions, you will not be able to run custom SQL on explore.'
                                            }
                                            position="top-start"
                                            variant="xs"
                                            disabled={
                                                !cannotUseCustomDimensions
                                            }
                                        >
                                            <Menu.Item
                                                icon={
                                                    <MantineIcon
                                                        icon={IconTelescope}
                                                    />
                                                }
                                                disabled={isEditMode}
                                                onClick={() =>
                                                    handleCreateShareUrl(
                                                        chartPathname,
                                                        chartSearch,
                                                    )
                                                }
                                            >
                                                <Group>
                                                    Explore from here
                                                    {cannotUseCustomDimensions && (
                                                        <MantineIcon
                                                            icon={
                                                                IconAlertTriangle
                                                            }
                                                            color="yellow.9"
                                                        />
                                                    )}
                                                </Group>
                                            </Menu.Item>
                                        </Tooltip>
                                    )}

                                    {userCanExportData && (
                                        <>
                                            <Menu.Item
                                                icon={
                                                    <MantineIcon
                                                        icon={IconTableExport}
                                                    />
                                                }
                                                disabled={isEditMode}
                                                onClick={() =>
                                                    setIsDataExportModalOpen(
                                                        true,
                                                    )
                                                }
                                            >
                                                Download data
                                            </Menu.Item>
                                        </>
                                    )}
                                    {chart.chartConfig.type !==
                                        ChartType.TABLE &&
                                        userCanExportData &&
                                        chart.chartConfig.type !==
                                            ChartType.BIG_NUMBER && (
                                            <DashboardExportImage
                                                echartRef={echartRef}
                                                chartName={chart.name}
                                                isMinimal={false}
                                            />
                                        )}

                                    {chart.chartConfig.type ===
                                        ChartType.TABLE &&
                                        userCanExportData && (
                                            <ExportGoogleSheet
                                                savedChart={
                                                    chartWithDashboardFilters
                                                }
                                                disabled={isEditMode}
                                            />
                                        )}

                                    {chart.dashboardUuid &&
                                        userCanManageChart && (
                                            <Menu.Item
                                                icon={
                                                    <MantineIcon
                                                        icon={IconFolders}
                                                    />
                                                }
                                                onClick={() =>
                                                    setIsMovingChart(true)
                                                }
                                                disabled={isEditMode}
                                            >
                                                Move to space
                                            </Menu.Item>
                                        )}
                                </Box>
                            </Tooltip>
                            {userCanManageChart && isEditMode && (
                                <Menu.Item
                                    icon={<MantineIcon icon={IconCopy} />}
                                    onClick={() =>
                                        duplicateChart({
                                            uuid: savedChartUuid,
                                            name: `Copy of ${chart.name}`,
                                            description: chart.description,
                                        })
                                    }
                                    disabled={!isEditMode}
                                >
                                    Duplicate chart
                                </Menu.Item>
                            )}
                        </>
                    )
                }
                {...props}
            >
                <>
                    <Menu
                        opened={contextMenuIsOpen}
                        onClose={() => setContextMenuIsOpen(false)}
                        withinPortal
                        closeOnItemClick
                        closeOnEscape
                        shadow="md"
                        radius={0}
                        position="bottom-start"
                        offset={{
                            crossAxis: 0,
                            mainAxis: 0,
                        }}
                    >
                        <Portal>
                            <Menu.Target>
                                <div
                                    onContextMenu={handleCancelContextMenu}
                                    style={{
                                        position: 'absolute',
                                        ...contextMenuTargetOffset,
                                    }}
                                />
                            </Menu.Target>
                        </Portal>

                        <Menu.Dropdown>
                            {viewUnderlyingDataOptions?.value && (
                                <Menu.Item
                                    icon={<MantineIcon icon={IconCopy} />}
                                    onClick={handleCopyToClipboard}
                                >
                                    Copy value
                                </Menu.Item>
                            )}
                            <Can
                                I="view"
                                this={subject('UnderlyingData', {
                                    organizationUuid,
                                    projectUuid: projectUuid,
                                })}
                            >
                                {!hasCustomBinDimension(metricQuery) && (
                                    <Menu.Item
                                        icon={<MantineIcon icon={IconStack} />}
                                        onClick={handleViewUnderlyingData}
                                    >
                                        View underlying data
                                    </Menu.Item>
                                )}
                            </Can>

                            <Can
                                I="manage"
                                this={subject('Explore', {
                                    organizationUuid,
                                    projectUuid: projectUuid,
                                })}
                            >
                                <DrillDownMenuItem
                                    {...viewUnderlyingDataOptions}
                                    trackingData={{
                                        organizationId: organizationUuid,
                                        userId: account?.user?.id,
                                        projectId: projectUuid,
                                    }}
                                />
                            </Can>

                            {dashboardTileFilterOptions.length > 0 && (
                                <FilterDashboardTo
                                    filters={dashboardTileFilterOptions}
                                    onAddFilter={handleAddFilter}
                                />
                            )}
                        </Menu.Dropdown>
                    </Menu>

                    <ValidDashboardChartTile
                        tileUuid={tileUuid}
                        dashboardChartReadyQuery={dashboardChartReadyQuery}
                        resultsData={resultsData}
                        project={chart.projectUuid}
                        isTitleHidden={hideTitle}
                        onSeriesContextMenu={onSeriesContextMenu}
                        setEchartsRef={setEchartRef}
                    />
                </>
            </TileBase>

            {chart.spaceUuid && (
                <MoveChartThatBelongsToDashboardModal
                    className={'non-draggable'}
                    projectUuid={projectUuid}
                    uuid={chart.uuid}
                    name={chart.name}
                    spaceUuid={chart.spaceUuid}
                    spaceName={chart.spaceName}
                    opened={isMovingChart}
                    onClose={() => setIsMovingChart(false)}
                    onConfirm={() => {
                        setDashboardTiles(
                            (currentDashboardTiles) =>
                                currentDashboardTiles?.map((tile) =>
                                    tile.uuid === tileUuid &&
                                    isDashboardChartTileType(tile)
                                        ? {
                                              ...tile,
                                              properties: {
                                                  ...tile.properties,
                                                  belongsToDashboard: false,
                                              },
                                          }
                                        : tile,
                                ) ?? [],
                        );
                    }}
                />
            )}
            <ExportDataModal
                isOpen={isDataExportModalOpen}
                onClose={closeDataExportModal}
                projectUuid={projectUuid!}
                totalResults={totalResults}
                getDownloadQueryUuid={getDownloadQueryUuid}
                showTableNames={
                    isTableChartConfig(chart.chartConfig.config)
                        ? chart.chartConfig.config.showTableNames ?? false
                        : true
                }
                chartName={title || chart.name}
                columnOrder={chart.tableConfig.columnOrder}
                customLabels={getCustomLabelsFromTableConfig(
                    chart.chartConfig.config,
                )}
                hiddenFields={getHiddenTableFields(chart.chartConfig)}
                pivotConfig={getPivotConfig(chart)}
            />
        </>
    );
};

const DashboardChartTileMinimal: FC<DashboardChartTileMainProps> = (props) => {
    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();
    const [isDataExportModalOpen, setIsDataExportModalOpen] = useState(false);

    const {
        tile: {
            uuid: tileUuid,
            properties: { savedChartUuid, hideTitle, title },
        },
        dashboardChartReadyQuery,
        resultsData,
        canExportCsv,
        canExportImages,
        onExplore,
    } = props;

    const {
        chart,
        explore,
        executeQueryResponse: { metricQuery },
    } = dashboardChartReadyQuery;
    const projectUuid = useProjectUuid();
    const ability = useAbilityContext();
    const [echartRef, setEchartRef] = useState<
        RefObject<EChartsReact | null> | undefined
    >();

    const handleExploreFromHere = useCallback(() => {
        if (onExplore) {
            onExplore({ chart });
        }
    }, [onExplore, chart]);

    const canExplore = ability.can(
        'view',
        subject('Explore', {
            organizationUuid: chart.organizationUuid,
            projectUuid,
        }),
    );

    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const chartsWithDateZoomApplied = useDashboardContext(
        (c) => c.chartsWithDateZoomApplied,
    );

    const { openUnderlyingDataModal } = useMetricQueryDataContext();

    const [viewUnderlyingDataOptions, setViewUnderlyingDataOptions] = useState<{
        item: ItemsMap[string] | undefined;
        value: ResultValue;
        fieldValues: Record<string, ResultValue>;
        dimensions: string[];
        pivotReference?: PivotReference;
    }>();

    const handleViewUnderlyingData = useCallback(() => {
        if (!viewUnderlyingDataOptions) return;

        const applyDateZoom =
            metricQuery?.metadata?.hasADateDimension &&
            savedChartUuid &&
            dateZoomGranularity &&
            chartsWithDateZoomApplied?.has(savedChartUuid);

        openUnderlyingDataModal({
            ...viewUnderlyingDataOptions,
            ...(applyDateZoom && {
                dateZoom: {
                    granularity: dateZoomGranularity,
                    xAxisFieldId: `${metricQuery?.metadata?.hasADateDimension.table}_${metricQuery?.metadata?.hasADateDimension.name}`,
                },
            }),
        });
    }, [
        viewUnderlyingDataOptions,
        dateZoomGranularity,
        openUnderlyingDataModal,
        metricQuery?.metadata?.hasADateDimension,
        savedChartUuid,
        chartsWithDateZoomApplied,
    ]);

    const handleCancelContextMenu = useCallback(
        (e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(),
        [],
    );

    const onSeriesContextMenu = useCallback(
        (e: EchartsSeriesClickEvent, series: EChartsSeries[]) => {
            if (explore === undefined) {
                return;
            }

            setContextMenuIsOpen(true);
            setContextMenuTargetOffset({
                left: e.event.event.pageX,
                top: e.event.event.pageY,
            });

            const allItemsMap = getItemMap(
                explore,
                chart.metricQuery.additionalMetrics,
                chart.metricQuery.tableCalculations,
            );

            const underlyingData = getDataFromChartClick(
                e,
                allItemsMap,
                series,
            );
            const queryDimensions = chart.metricQuery.dimensions || [];
            setViewUnderlyingDataOptions({
                ...underlyingData,
                dimensions: queryDimensions,
            });
        },
        [explore, chart],
    );

    const isEmbeddedExploreEnabled =
        canExplore && typeof onExplore === 'function';

    const closeDataExportModal = useCallback(
        () => setIsDataExportModalOpen(false),
        [],
    );

    // For minimal tiles, we can reuse the existing queryUuid from dashboardChartReadyQuery
    const getDownloadQueryUuid = useCallback(
        async (_limit: number | null): Promise<string> => {
            // The query has already been executed by dashboardChartReadyQuery
            // We can simply return the queryUuid
            return dashboardChartReadyQuery.executeQueryResponse.queryUuid;
        },
        [dashboardChartReadyQuery.executeQueryResponse.queryUuid],
    );

    return (
        <>
            <TileBase
                title={title || chart.name || ''}
                titleHref={`/projects/${projectUuid}/saved/${savedChartUuid}/`}
                description={chart.description}
                isLoading={false}
                minimal={true}
                extraMenuItems={
                    canExportCsv ||
                    (canExportImages &&
                        !isTableChartConfig(chart.chartConfig.config)) ||
                    isEmbeddedExploreEnabled ? (
                        <>
                            {isEmbeddedExploreEnabled && (
                                <Menu.Item
                                    icon={<MantineIcon icon={IconTelescope} />}
                                    onClick={handleExploreFromHere}
                                >
                                    Explore from here
                                </Menu.Item>
                            )}
                            {canExportCsv && (
                                <Menu.Item
                                    icon={
                                        <MantineIcon icon={IconTableExport} />
                                    }
                                    onClick={() =>
                                        setIsDataExportModalOpen(true)
                                    }
                                >
                                    Download data
                                </Menu.Item>
                            )}
                            {canExportImages &&
                                chart.chartConfig.type !== ChartType.TABLE &&
                                chart.chartConfig.type !==
                                    ChartType.BIG_NUMBER && (
                                    <DashboardExportImage
                                        echartRef={echartRef}
                                        chartName={chart.name}
                                        isMinimal={true}
                                    />
                                )}
                        </>
                    ) : undefined
                }
                {...props}
            >
                <>
                    <Menu
                        opened={contextMenuIsOpen}
                        onClose={() => setContextMenuIsOpen(false)}
                        withinPortal
                        closeOnItemClick
                        closeOnEscape
                        shadow="md"
                        radius={0}
                        position="bottom-start"
                        offset={{
                            crossAxis: 0,
                            mainAxis: 0,
                        }}
                    >
                        <Portal>
                            <Menu.Target>
                                <div
                                    onContextMenu={handleCancelContextMenu}
                                    style={{
                                        position: 'absolute',
                                        ...contextMenuTargetOffset,
                                    }}
                                />
                            </Menu.Target>
                        </Portal>
                        <Can
                            I="view"
                            this={subject('UnderlyingData', {
                                organizationUuid: chart.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <Menu.Dropdown>
                                <UnderlyingDataMenuItem
                                    metricQuery={metricQuery}
                                    onViewUnderlyingData={
                                        handleViewUnderlyingData
                                    }
                                />
                            </Menu.Dropdown>
                        </Can>
                    </Menu>
                    <ValidDashboardChartTileMinimal
                        tileUuid={tileUuid}
                        isTitleHidden={hideTitle}
                        chart={chart}
                        dashboardChartReadyQuery={dashboardChartReadyQuery}
                        onSeriesContextMenu={onSeriesContextMenu}
                        resultsData={resultsData}
                        title={title || chart.name}
                        setEchartsRef={setEchartRef}
                    />
                </>
            </TileBase>
            {canExportCsv && (
                <ExportDataModal
                    isOpen={isDataExportModalOpen}
                    onClose={closeDataExportModal}
                    projectUuid={projectUuid!}
                    totalResults={resultsData.totalResults}
                    getDownloadQueryUuid={getDownloadQueryUuid}
                    showTableNames={
                        isTableChartConfig(chart.chartConfig.config)
                            ? chart.chartConfig.config.showTableNames ?? false
                            : true
                    }
                    chartName={title || chart.name}
                    columnOrder={chart.tableConfig.columnOrder}
                    customLabels={getCustomLabelsFromTableConfig(
                        chart.chartConfig.config,
                    )}
                    hiddenFields={getHiddenTableFields(chart.chartConfig)}
                    pivotConfig={getPivotConfig(chart)}
                />
            )}
        </>
    );
};

type DashboardChartTileProps = Omit<
    DashboardChartTileMainProps,
    'dashboardChartReadyQuery' | 'resultsData'
> & {
    minimal?: boolean;
    canExportCsv?: boolean;
    canExportImages?: boolean;
    dashboardChartReadyQuery?: DashboardChartReadyQuery;
    resultsData?: InfiniteQueryResults;
    onExplore?: (options: { chart: SavedChart }) => void;
};

// Abstraction needed for enterprise version
// ts-unused-exports:disable-next-line
export const GenericDashboardChartTile: FC<
    DashboardChartTileProps & {
        isLoading: boolean;
        error: DashboardTileError | null;
    }
> = ({
    minimal = false,
    tile,
    isEditMode,
    isLoading,
    dashboardChartReadyQuery,
    resultsData,
    error,
    canExportCsv = false,
    canExportImages = false,
    onExplore,
    ...rest
}) => {
    const { projectUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const { user } = useApp();

    const userCanManageChart =
        dashboardChartReadyQuery?.chart &&
        user.data?.ability?.can(
            'manage',
            subject('SavedChart', { ...dashboardChartReadyQuery.chart }),
        );

    if (error !== null) {
        // Show custom title if set, otherwise show chart name or fallback to "Deleted Chart"
        const tileTitle =
            tile.properties.title ||
            tile.properties.chartName ||
            'Deleted chart';

        return (
            <TileBase
                title={tileTitle}
                isEditMode={isEditMode}
                tile={tile}
                extraMenuItems={
                    tile.properties.savedChartUuid && (
                        <Tooltip
                            disabled={!isEditMode}
                            label="Finish editing dashboard to edit this chart"
                        >
                            <Box>
                                <EditChartMenuItem
                                    tile={tile}
                                    disabled={isEditMode}
                                />
                            </Box>
                        </Tooltip>
                    )
                }
                {...rest}
            >
                <SuboptimalState
                    icon={IconAlertCircle}
                    title={formatChartErrorMessage(
                        dashboardChartReadyQuery?.chart?.name ||
                            tile.properties.chartName ||
                            undefined,
                        error?.error?.message || 'No data available',
                    )}
                ></SuboptimalState>
            </TileBase>
        );
    }

    if (isLoading || !dashboardChartReadyQuery || !resultsData) {
        return (
            <TileBase
                isEditMode={isEditMode}
                chartName={tile.properties.chartName ?? ''}
                titleHref={`/projects/${projectUuid}/saved/${tile.properties.savedChartUuid}/`}
                description={''}
                belongsToDashboard={tile.properties.belongsToDashboard}
                tile={tile}
                isLoading
                title={tile.properties.title || tile.properties.chartName || ''}
                extraMenuItems={
                    !minimal &&
                    userCanManageChart &&
                    tile.properties.savedChartUuid && (
                        <EditChartMenuItem tile={tile} />
                    )
                }
                minimal={minimal}
                {...rest}
            />
        );
    }

    return (
        <MetricQueryDataProvider
            metricQuery={
                dashboardChartReadyQuery.executeQueryResponse.metricQuery
            }
            tableName={dashboardChartReadyQuery.chart.tableName || ''}
            explore={dashboardChartReadyQuery.explore}
            queryUuid={dashboardChartReadyQuery.executeQueryResponse.queryUuid}
        >
            {minimal ? (
                <DashboardChartTileMinimal
                    {...rest}
                    tile={tile}
                    isEditMode={isEditMode}
                    resultsData={resultsData}
                    dashboardChartReadyQuery={dashboardChartReadyQuery}
                    canExportCsv={canExportCsv}
                    canExportImages={canExportImages}
                    onExplore={onExplore}
                />
            ) : (
                <DashboardChartTileMain
                    {...rest}
                    tile={tile}
                    isEditMode={isEditMode}
                    resultsData={resultsData}
                    dashboardChartReadyQuery={dashboardChartReadyQuery}
                    onExplore={onExplore}
                />
            )}
            <UnderlyingDataModal />
            <DrillDownModal />
        </MetricQueryDataProvider>
    );
};

const DashboardChartTile: FC<DashboardChartTileProps> = (props) => {
    // Handle orphaned tiles where the chart was deleted but tile remains
    const orphanedChartError = useMemo((): ClientSideError | null => {
        if (props.tile.properties.savedChartUuid === null) {
            return {
                error: {
                    name: 'ChartDeleted',
                    message: 'This chart has been deleted.',
                },
            };
        }
        return null;
    }, [props.tile.properties.savedChartUuid]);

    const readyQuery = useDashboardChartReadyQuery(
        props.tile.uuid,
        props.tile.properties?.savedChartUuid,
    );

    const resultsData = useInfiniteQueryResults(
        readyQuery.data?.chart.projectUuid,
        readyQuery.data?.executeQueryResponse.queryUuid,
        readyQuery.data?.chart.name,
    );

    const isLoading = useMemo(() => {
        const isCreatingQuery = readyQuery.isFetching;
        const isFetchingFirstPage = resultsData.isFetchingFirstPage;
        const isFetchingAllRows =
            resultsData.fetchAll && !resultsData.hasFetchedAllRows;
        return (
            (isCreatingQuery || isFetchingFirstPage || isFetchingAllRows) &&
            !resultsData.error
        );
    }, [
        readyQuery.isFetching,
        resultsData.fetchAll,
        resultsData.hasFetchedAllRows,
        resultsData.isFetchingFirstPage,
        resultsData.error,
    ]);

    return (
        <GenericDashboardChartTile
            {...props}
            isLoading={isLoading}
            resultsData={resultsData}
            dashboardChartReadyQuery={readyQuery.data}
            error={orphanedChartError ?? readyQuery.error ?? resultsData.error}
        />
    );
};

export default DashboardChartTile;
