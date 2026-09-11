import {
    BinType,
    ChartType,
    CustomDimensionType,
    DateGranularity,
    getItemId,
    isCartesianChartConfig,
    type BinRange,
    type ChartConfig,
    type CreateSavedChartVersion,
    type CustomDimension,
    type Metric,
    type MetricQuery,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo } from 'react';
import {
    useLocation,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import { validate as isUuidString } from 'uuid';
import {
    explorerActions,
    selectChartSidebarStep,
    selectIsVisualizationConfigOpen,
    selectMetricQuery,
    selectTableName,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import useApp from '../providers/App/useApp';
import {
    defaultQueryExecution,
    defaultState,
} from '../providers/Explorer/defaultState';
import {
    ExplorerSection,
    type ExplorerReduceState,
} from '../providers/Explorer/types';
import useToaster from './toaster/useToaster';

const CHART_SIDEBAR_PARAM = 'chartSidebar';

export const DEFAULT_EMPTY_EXPLORE_CONFIG: CreateSavedChartVersion = {
    tableName: '',
    metricQuery: {
        exploreName: '',
        dimensions: [],
        metrics: [],
        tableCalculations: [],
        filters: {},
        sorts: [],
        limit: 500,
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {},
            eChartsConfig: {},
        },
    },
    tableConfig: {
        columnOrder: [],
    },
};

// Pass preserveLongUrl to keep the whole chart. This is sometimes desireable
// when we want all of the information in the URL, but don't use it for
// navigation. For example, the explore from here button uses the entire URL to
// create shareable, shortened links.
const stringifyCreateSavedChartVersion = (
    createSavedChart: CreateSavedChartVersion,
    preserveLongUrl?: boolean,
): string => {
    const stringifiedChart = JSON.stringify(createSavedChart);
    const stringifiedChartSize = stringifiedChart.length;
    if (
        stringifiedChartSize > 3000 &&
        !preserveLongUrl &&
        isCartesianChartConfig(createSavedChart.chartConfig.config)
    ) {
        console.warn(
            `Chart config is too large to store in url "${stringifiedChartSize}", removing series to reduce size`,
        );
        const reducedCreateSavedChart = {
            ...createSavedChart,
            chartConfig: {
                ...createSavedChart.chartConfig,
                config: {
                    ...createSavedChart.chartConfig.config,
                    eChartsConfig: {},
                },
            },
        };
        const reducedStringifiedChart = JSON.stringify(reducedCreateSavedChart);
        console.info(
            `Reduced chart config size from "${stringifiedChartSize}" to "${reducedStringifiedChart.length}"`,
        );
        return reducedStringifiedChart;
    }
    return stringifiedChart;
};

/**
 * The saved chart's edit page carrying an unsaved version, so an editing
 * session started elsewhere (the in-dashboard chart editor) survives the move.
 */
export const getSavedChartEditUrlFromCreateSavedChartVersion = ({
    projectUuid,
    chartSlug,
    createSavedChart,
    fromDashboardUuid,
}: {
    projectUuid: string;
    chartSlug: string;
    createSavedChart: CreateSavedChartVersion;
    fromDashboardUuid: string | null;
}): { pathname: string; search: string } => {
    const params = new URLSearchParams();
    // Trimmed like the explore route's url, so the address bar stays short
    // enough to share and reopen from a fresh load.
    params.set(
        'create_saved_chart_version',
        stringifyCreateSavedChartVersion(createSavedChart),
    );
    if (fromDashboardUuid) {
        params.set('fromDashboard', fromDashboardUuid);
    }

    return {
        pathname: `/projects/${projectUuid}/saved/${chartSlug}/edit`,
        search: params.toString(),
    };
};

/** The explore route's url without the serialised chart version. */
const getExplorerBaseUrl = (
    projectUuid: string | undefined,
    tableName: string,
): { pathname: string; search: string } => {
    if (!projectUuid) {
        return { pathname: '', search: '' };
    }
    // Preserve existing search params (like fromSpace, fromDashboard, etc)
    const newParams = new URLSearchParams(window.location.search);

    // Always set isExploreFromHere to true when creating the url for shareable links this ensures the query is executed when the url is loaded
    newParams.set('isExploreFromHere', 'true');

    return {
        pathname: `/projects/${projectUuid}/tables/${tableName}`,
        search: newParams.toString(),
    };
};

export const getExplorerUrlFromCreateSavedChartVersion = (
    projectUuid: string | undefined,
    createSavedChart: CreateSavedChartVersion,
    preserveLongUrl?: boolean,
): { pathname: string; search: string } => {
    const { pathname, search } = getExplorerBaseUrl(
        projectUuid,
        createSavedChart.tableName,
    );
    if (!projectUuid) {
        return { pathname, search };
    }

    const newParams = new URLSearchParams(search);
    newParams.set(
        'create_saved_chart_version',
        stringifyCreateSavedChartVersion(createSavedChart, preserveLongUrl),
    );

    return { pathname, search: newParams.toString() };
};

export const useDateZoomGranularitySearch = ():
    | DateGranularity
    | string
    | undefined => {
    const { search } = useLocation();

    const searchParams = new URLSearchParams(search);
    const dateZoomParam = searchParams.get('dateZoom');
    if (!dateZoomParam) return undefined;

    const standardMatch = Object.values(DateGranularity).find(
        (granularity) =>
            granularity.toLowerCase() === dateZoomParam.toLowerCase(),
    );
    // Return standard match if found, otherwise use the param directly
    // (supports custom granularity keys like "slt_week")
    return standardMatch ?? dateZoomParam;
};

// Url params come from outside the app (old agent share links, hand-crafted
// urls), so any key can be missing: older urls lack exploreName, and links
// generated from AI answers can omit chartConfig, tableConfig, or metricQuery
// sub-fields entirely.
type BackwardsCompatibleCreateSavedChartVersionUrlParam = Omit<
    CreateSavedChartVersion,
    'metricQuery' | 'chartConfig' | 'tableConfig'
> & {
    chartConfig?: CreateSavedChartVersion['chartConfig'];
    tableConfig?: CreateSavedChartVersion['tableConfig'];
    metricQuery: Omit<
        MetricQuery,
        | 'exploreName'
        | 'dimensions'
        | 'metrics'
        | 'filters'
        | 'sorts'
        | 'tableCalculations'
    > & {
        exploreName?: string;
        dimensions?: MetricQuery['dimensions'];
        metrics?: MetricQuery['metrics'];
        filters?: MetricQuery['filters'];
        sorts?: MetricQuery['sorts'];
        tableCalculations?: MetricQuery['tableCalculations'];
    };
};

/**
 * The chart type a "Preview in explorer" link carries. The search string
 * survives picking a table in the explore sidebar, so the link can be minted
 * before a table is known.
 */
export const parseDataAppVizUuidFromSearchParams = (
    search: string,
): string | null => {
    const dataAppVizUuid = new URLSearchParams(search).get('dataAppVizUuid');
    return dataAppVizUuid && isUuidString(dataAppVizUuid)
        ? dataAppVizUuid
        : null;
};

// The param carries the open step, so its absence means a closed sidebar.
const parseChartSidebarFromSearchParams = (
    search: string,
): Pick<
    ExplorerReduceState,
    'isVisualizationConfigOpen' | 'chartSidebarStep'
> => {
    const step = new URLSearchParams(search).get(CHART_SIDEBAR_PARAM);

    if (step === 'choose' || step === 'configure') {
        return {
            isVisualizationConfigOpen: true,
            chartSidebarStep: step,
        };
    }

    return {
        isVisualizationConfigOpen: false,
        chartSidebarStep: defaultState.chartSidebarStep,
    };
};

export const parseChartFromExplorerSearchParams = (
    search: string,
): CreateSavedChartVersion | undefined => {
    const chartConfigSearchParam = new URLSearchParams(search).get(
        'create_saved_chart_version',
    );
    return chartConfigSearchParam
        ? parseCreateSavedChartVersionParam(chartConfigSearchParam)
        : undefined;
};

/** The raw `create_saved_chart_version` value; throws on malformed json. */
const parseCreateSavedChartVersionParam = (
    chartConfigSearchParam: string,
): CreateSavedChartVersion => {
    const parsedValue: BackwardsCompatibleCreateSavedChartVersionUrlParam =
        JSON.parse(chartConfigSearchParam);
    return {
        ...parsedValue,
        chartConfig:
            parsedValue.chartConfig ?? DEFAULT_EMPTY_EXPLORE_CONFIG.chartConfig,
        tableConfig: parsedValue.tableConfig ?? { columnOrder: [] },
        metricQuery: {
            ...parsedValue.metricQuery,
            exploreName:
                parsedValue.metricQuery.exploreName || parsedValue.tableName,
            dimensions: parsedValue.metricQuery.dimensions ?? [],
            metrics: parsedValue.metricQuery.metrics ?? [],
            filters: parsedValue.metricQuery.filters ?? {},
            sorts: parsedValue.metricQuery.sorts ?? [],
            tableCalculations: parsedValue.metricQuery.tableCalculations ?? [],
            customDimensions:
                parsedValue.metricQuery.customDimensions?.map<CustomDimension>(
                    (customDimension) => {
                        if (customDimension.type === undefined) {
                            // backwards compat: old URLs lack type field and use flat shape
                            const raw = customDimension as unknown as Record<
                                string,
                                unknown
                            >;
                            const base = {
                                id: raw.id as string,
                                name: raw.name as string,
                                type: CustomDimensionType.BIN as const,
                                dimensionId: raw.dimensionId as string,
                                table: raw.table as string,
                            };
                            switch (raw.binType) {
                                case BinType.FIXED_WIDTH:
                                    return {
                                        ...base,
                                        binType: BinType.FIXED_WIDTH,
                                        binWidth: (raw.binWidth as number) || 1,
                                    };
                                case BinType.CUSTOM_RANGE:
                                    return {
                                        ...base,
                                        binType: BinType.CUSTOM_RANGE,
                                        customRange:
                                            (raw.customRange as BinRange[]) ||
                                            [],
                                    };
                                case BinType.FIXED_NUMBER:
                                default:
                                    return {
                                        ...base,
                                        binType: BinType.FIXED_NUMBER,
                                        binNumber:
                                            (raw.binNumber as number) || 1,
                                    };
                            }
                        }
                        return customDimension;
                    },
                ),
        },
    };
};

/**
 * Same param, for routes that treat it as optional extra state: a malformed
 * value leaves the page on whatever it loaded instead of throwing.
 */
export const tryParseCreateSavedChartVersionParam = (
    chartConfigSearchParam: string,
): CreateSavedChartVersion | undefined => {
    try {
        return parseCreateSavedChartVersionParam(chartConfigSearchParam);
    } catch {
        return undefined;
    }
};

/**
 * Keeps the address bar on the unsaved chart version: every change to it is
 * serialised into `create_saved_chart_version` and replaced into the url, so a
 * reload or a shared link reopens the session in progress. The caller owns the
 * pathname and the params the version joins.
 */
const useChartVersionUrlSync = ({
    enabled,
    getTarget,
    currentSearch,
}: {
    enabled: boolean;
    /** Returns null when there is nothing to write. */
    getTarget: (
        unsavedChartVersion: CreateSavedChartVersion,
    ) => { pathname: string; search: string } | null;
    /** When given, a write that changes nothing does not navigate. */
    currentSearch?: string;
}) => {
    const navigate = useNavigate();

    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const isVisualizationConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );
    const chartSidebarStep = useExplorerSelector(selectChartSidebarStep);

    useEffect(() => {
        if (!enabled) return;

        const target = getTarget(unsavedChartVersion);
        if (!target) return;

        const searchParams = new URLSearchParams(target.search);
        searchParams.set(
            'create_saved_chart_version',
            stringifyCreateSavedChartVersion(unsavedChartVersion),
        );
        searchParams.delete('dataAppVizUuid');
        if (isVisualizationConfigOpen) {
            searchParams.set(CHART_SIDEBAR_PARAM, chartSidebarStep);
        } else {
            searchParams.delete(CHART_SIDEBAR_PARAM);
        }

        const search = searchParams.toString();
        if (
            currentSearch !== undefined &&
            search === new URLSearchParams(currentSearch).toString()
        ) {
            return;
        }

        void navigate({ pathname: target.pathname, search }, { replace: true });
    }, [
        enabled,
        getTarget,
        currentSearch,
        navigate,
        unsavedChartVersion,
        isVisualizationConfigOpen,
        chartSidebarStep,
    ]);
};

export const useExplorerRoute = () => {
    const pathParams = useParams<{
        projectUuid: string;
        tableId: string | undefined;
    }>();

    const dispatch = useExplorerDispatch();

    const metricQuery = useExplorerSelector(selectMetricQuery);
    const tableName = useExplorerSelector(selectTableName);

    const { projectUuid, tableId } = pathParams;
    const getTarget = useCallback(
        (unsavedChartVersion: CreateSavedChartVersion) =>
            getExplorerBaseUrl(projectUuid, unsavedChartVersion.tableName),
        [projectUuid],
    );

    // Update url params based on pristine state
    // Only sync URL when we're actually on a table page (tableId exists)
    useChartVersionUrlSync({
        enabled: Boolean(tableId && metricQuery && tableName),
        getTarget,
    });

    useEffect(() => {
        if (!tableId) {
            dispatch(explorerActions.reset(defaultState));
            dispatch(explorerActions.resetQueryExecution());
        } else {
            dispatch(explorerActions.setTableName(tableId));
        }
    }, [tableId, dispatch]);
};

/**
 * The saved chart's edit page follows its edits the way the explore page does.
 * Only the search changes: the pathname carries the project and chart the user
 * opened, which may be slugs.
 */
export const useSavedChartEditRoute = ({ enabled }: { enabled: boolean }) => {
    const { pathname, search } = useLocation();
    const tableName = useExplorerSelector(selectTableName);

    const getTarget = useCallback(() => {
        // A navigation away moves the address bar before this render sees the
        // new location; writing then would pull the page back to where it was
        if (window.location.pathname !== pathname) return null;
        return { pathname, search };
    }, [pathname, search]);

    useChartVersionUrlSync({
        // The store holds an empty version for a commit, until the page's
        // reset lands; writing that would put an empty chart in the url.
        enabled: enabled && tableName !== '',
        getTarget,
        currentSearch: search,
    });
};

export const useExplorerUrlState = (): ExplorerReduceState | undefined => {
    const { showToastError } = useToaster();
    const { search } = useLocation();
    const { health } = useApp();
    const pathParams = useParams<{
        projectUuid: string;
        tableId: string | undefined;
    }>();

    const [searchParams] = useSearchParams();
    const fromDashboard = searchParams.get('fromDashboard');
    const isExploreFromHere = useMemo(() => {
        return searchParams.get('isExploreFromHere') === 'true';
    }, [searchParams]);

    return useMemo(() => {
        if (pathParams.tableId) {
            try {
                const parsedChart = parseChartFromExplorerSearchParams(search);
                // A "Preview in explorer" link preselects the chart type;
                // explicit chart state wins over the hint.
                const dataAppVizUuid = parsedChart
                    ? null
                    : parseDataAppVizUuidFromSearchParams(search);
                const unsavedChartVersion = parsedChart || {
                    tableName: pathParams.tableId,
                    metricQuery: {
                        exploreName: pathParams.tableId,
                        dimensions: [],
                        metrics: [],
                        filters: {},
                        sorts: [],
                        limit: health.data?.query.defaultLimit ?? 500,
                        tableCalculations: [],
                        additionalMetrics: [],
                    },
                    pivotConfig: undefined,
                    tableConfig: {
                        columnOrder: [],
                    },
                    chartConfig: dataAppVizUuid
                        ? {
                              type: ChartType.DATA_APP_VIZ,
                              config: {
                                  dataAppVizUuid,
                                  fieldMapping: {},
                                  optionValues: {},
                              },
                          }
                        : {
                              type: ChartType.CARTESIAN,
                              config: { layout: {}, eChartsConfig: {} },
                          },
                };

                return {
                    parameterReferences: [],
                    parameterDefinitions: {},
                    cachedChartConfigs: {},
                    expandedSections:
                        parsedChart || dataAppVizUuid
                            ? [
                                  ExplorerSection.VISUALIZATION,
                                  ExplorerSection.RESULTS,
                              ]
                            : [ExplorerSection.RESULTS],
                    unsavedChartVersion,
                    unsavedColorPaletteUuid: null,
                    modals: {
                        format: {
                            isOpen: false,
                        },
                        additionalMetric: {
                            isOpen: false,
                        },
                        customDimension: {
                            isOpen: false,
                        },
                        writeBack: {
                            isOpen: false,
                        },
                        itemDetail: {
                            isOpen: false,
                        },
                        periodOverPeriodComparison: {
                            isOpen: false,
                        },
                    },
                    parameters: {},
                    fromDashboard: fromDashboard ?? undefined,
                    isExploreFromHere: isExploreFromHere,
                    ...parseChartSidebarFromSearchParams(search),
                    queryExecution: defaultQueryExecution,
                    preAggregate: defaultState.preAggregate,
                    chartTypeAuthoring: null,
                };
            } catch (e: any) {
                const errorMessage = e.message ? ` Error: "${e.message}"` : '';
                showToastError({
                    title: 'Error parsing url',
                    subtitle: `URL is invalid or incomplete.${errorMessage}`,
                });
            }
        }
    }, [
        pathParams,
        search,
        showToastError,
        fromDashboard,
        isExploreFromHere,
        health.data?.query.defaultLimit,
    ]);
};

export const createMetricPreviewUnsavedChartVersion = (
    metric: Pick<Metric, 'name' | 'table'>,
): CreateSavedChartVersion => {
    let chartConfig: ChartConfig = {
        type: ChartType.BIG_NUMBER,
        config: {},
    };

    return {
        ...DEFAULT_EMPTY_EXPLORE_CONFIG,
        tableName: metric.table,
        chartConfig,
        metricQuery: {
            ...DEFAULT_EMPTY_EXPLORE_CONFIG.metricQuery,
            exploreName: metric.table,
            dimensions: [],
            metrics: [
                getItemId({
                    name: metric.name,
                    table: metric.table,
                }),
            ],
        },
    };
};
