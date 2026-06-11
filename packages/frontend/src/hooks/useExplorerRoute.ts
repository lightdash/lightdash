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
import { useEffect, useMemo } from 'react';
import {
    useLocation,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import {
    explorerActions,
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

export const getExplorerUrlFromCreateSavedChartVersion = (
    projectUuid: string | undefined,
    createSavedChart: CreateSavedChartVersion,
    // Pass true to preserve long url. This is sometimes desireable when we want
    // all of the information in the URL, but don't use it for navigation.
    // For example, the explore from here button uses the entire URL to create
    // shareable, shortened links.
    preserveLongUrl?: boolean,
): { pathname: string; search: string } => {
    if (!projectUuid) {
        return { pathname: '', search: '' };
    }
    // Preserve existing search params (like fromSpace, fromDashboard, etc)
    const newParams = new URLSearchParams(window.location.search);

    let stringifiedChart = JSON.stringify(createSavedChart);
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
        stringifiedChart = JSON.stringify(reducedCreateSavedChart);
        console.info(
            `Reduced chart config size from "${stringifiedChartSize}" to "${stringifiedChart.length}"`,
        );
    }
    newParams.set('create_saved_chart_version', stringifiedChart);

    // Always set isExploreFromHere to true when creating the url for shareable links this ensures the query is executed when the url is loaded
    newParams.set('isExploreFromHere', 'true');

    return {
        pathname: `/projects/${projectUuid}/tables/${createSavedChart.tableName}`,
        search: newParams.toString(),
    };
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

// To handle older url params where exploreName wasn't required
type BackwardsCompatibleCreateSavedChartVersionUrlParam = Omit<
    CreateSavedChartVersion,
    'metricQuery'
> & {
    metricQuery: Omit<MetricQuery, 'exploreName'> & { exploreName?: string };
};

const parseChartFromExplorerSearchParams = (
    search: string,
): CreateSavedChartVersion | undefined => {
    const searchParams = new URLSearchParams(search);
    const chartConfigSearchParam = searchParams.get(
        'create_saved_chart_version',
    );
    if (chartConfigSearchParam) {
        const parsedValue: BackwardsCompatibleCreateSavedChartVersionUrlParam =
            JSON.parse(chartConfigSearchParam);
        return {
            ...parsedValue,
            tableConfig: parsedValue.tableConfig ?? { columnOrder: [] },
            metricQuery: {
                ...parsedValue.metricQuery,
                exploreName:
                    parsedValue.metricQuery.exploreName ||
                    parsedValue.tableName,
                customDimensions:
                    parsedValue.metricQuery.customDimensions?.map<CustomDimension>(
                        (customDimension) => {
                            if (customDimension.type === undefined) {
                                // backwards compat: old URLs lack type field and use flat shape
                                const raw =
                                    customDimension as unknown as Record<
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
                                            binWidth:
                                                (raw.binWidth as number) || 1,
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
    }
};

export const useExplorerRoute = () => {
    const navigate = useNavigate();
    const pathParams = useParams<{
        projectUuid: string;
        tableId: string | undefined;
    }>();

    const dispatch = useExplorerDispatch();

    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const tableName = useExplorerSelector(selectTableName);

    // Update url params based on pristine state
    // Only sync URL when we're actually on a table page (pathParams.tableId exists)
    useEffect(() => {
        if (pathParams.tableId && metricQuery && tableName) {
            void navigate(
                getExplorerUrlFromCreateSavedChartVersion(
                    pathParams.projectUuid,
                    unsavedChartVersion,
                ),
                { replace: true },
            );
        }
    }, [
        metricQuery,
        navigate,
        pathParams.projectUuid,
        pathParams.tableId,
        unsavedChartVersion,
        tableName,
    ]);

    useEffect(() => {
        if (!pathParams.tableId) {
            dispatch(explorerActions.reset(defaultState));
            dispatch(explorerActions.resetQueryExecution());
        } else {
            dispatch(explorerActions.setTableName(pathParams.tableId));
        }
    }, [pathParams.tableId, dispatch]);
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
                    chartConfig: {
                        type: ChartType.CARTESIAN,
                        config: { layout: {}, eChartsConfig: {} },
                    },
                };

                return {
                    parameterReferences: [],
                    parameterDefinitions: {},
                    cachedChartConfigs: {},
                    expandedSections: parsedChart
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
                    queryExecution: defaultQueryExecution,
                    preAggregate: defaultState.preAggregate,
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
