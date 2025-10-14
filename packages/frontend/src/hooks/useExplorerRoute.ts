import {
    ChartType,
    CustomDimensionType,
    DateGranularity,
    getItemId,
    isCartesianChartConfig,
    type ChartConfig,
    type CreateSavedChartVersion,
    type CustomBinDimension,
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
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import {
    defaultQueryExecution,
    defaultState,
} from '../providers/Explorer/defaultState';
import {
    ExplorerSection,
    type ExplorerReduceState,
} from '../providers/Explorer/types';
import useExplorerContext from '../providers/Explorer/useExplorerContext';
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
    const newParams = new URLSearchParams();

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

    return {
        pathname: `/projects/${projectUuid}/tables/${createSavedChart.tableName}`,
        search: newParams.toString(),
    };
};

export const useDateZoomGranularitySearch = (): DateGranularity | undefined => {
    const { search } = useLocation();

    const searchParams = new URLSearchParams(search);
    const dateZoomParam = searchParams.get('dateZoom');
    const dateZoom = Object.values(DateGranularity).find(
        (granularity) =>
            granularity.toLowerCase() === dateZoomParam?.toLowerCase(),
    );
    return dateZoom;
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
            metricQuery: {
                ...parsedValue.metricQuery,
                exploreName:
                    parsedValue.metricQuery.exploreName ||
                    parsedValue.tableName,
                customDimensions:
                    parsedValue.metricQuery.customDimensions?.map<CustomDimension>(
                        (customDimension) => {
                            if (customDimension.type === undefined) {
                                return {
                                    ...(customDimension as CustomBinDimension),
                                    type: CustomDimensionType.BIN, // add type for backwards compatibility
                                };
                            } else {
                                return customDimension;
                            }
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

    const reduxDispatch = useExplorerDispatch();
    const setTableNameContext = useExplorerContext(
        (context) => context.actions.setTableName,
    );
    const clearExplore = useExplorerContext(
        (context) => context.actions.clearExplore,
    );
    const mergedUnsavedChartVersion = useExplorerContext(
        (context) => context.state.mergedUnsavedChartVersion,
    );
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const tableName = useExplorerSelector(selectTableName);

    // Update url params based on pristine state
    // Only sync URL when we're actually on a table page (pathParams.tableId exists)
    useEffect(() => {
        if (pathParams.tableId && metricQuery && tableName) {
            void navigate(
                getExplorerUrlFromCreateSavedChartVersion(
                    pathParams.projectUuid,
                    {
                        ...mergedUnsavedChartVersion,
                        metricQuery,
                    },
                ),
                { replace: true },
            );
        }
    }, [
        metricQuery,
        navigate,
        pathParams.projectUuid,
        pathParams.tableId,
        mergedUnsavedChartVersion,
        tableName,
    ]);

    useEffect(() => {
        if (!pathParams.tableId) {
            reduxDispatch(explorerActions.reset(defaultState));
            reduxDispatch(explorerActions.resetQueryExecution());
            clearExplore();
        } else {
            setTableNameContext(pathParams.tableId);
        }
    }, [pathParams.tableId, reduxDispatch, setTableNameContext, clearExplore]);
};

export const useExplorerUrlState = (): ExplorerReduceState | undefined => {
    const { showToastError } = useToaster();
    const { search } = useLocation();
    const pathParams = useParams<{
        projectUuid: string;
        tableId: string | undefined;
    }>();

    const [searchParams] = useSearchParams();
    const fromDashboard = searchParams.get('fromDashboard');

    return useMemo(() => {
        if (pathParams.tableId) {
            try {
                const unsavedChartVersion = parseChartFromExplorerSearchParams(
                    search,
                ) || {
                    tableName: pathParams.tableId,
                    metricQuery: {
                        exploreName: pathParams.tableId,
                        dimensions: [],
                        metrics: [],
                        filters: {},
                        sorts: [],
                        limit: 500,
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
                    expandedSections: unsavedChartVersion
                        ? [
                              ExplorerSection.VISUALIZATION,
                              ExplorerSection.RESULTS,
                          ]
                        : [ExplorerSection.RESULTS],
                    unsavedChartVersion,
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
                    },
                    parameters: {},
                    fromDashboard: fromDashboard ?? undefined,
                    queryExecution: defaultQueryExecution,
                };
            } catch (e: any) {
                const errorMessage = e.message ? ` Error: "${e.message}"` : '';
                showToastError({
                    title: 'Error parsing url',
                    subtitle: `URL is invalid or incomplete.${errorMessage}`,
                });
            }
        }
    }, [pathParams, search, showToastError, fromDashboard]);
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
