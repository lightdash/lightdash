import {
    ChartType,
    CustomDimensionType,
    DateGranularity,
    DimensionType,
    getItemId,
    getMetricExplorerDefaultGrainFilters,
    isCartesianChartConfig,
    type CreateSavedChartVersion,
    type CustomBinDimension,
    type CustomDimension,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
    ExplorerSection,
    useExplorerContext,
    type ExplorerReduceState,
} from '../providers/ExplorerProvider';
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

const getDefaultTimeDimension = (
    metric: Record<'name' | 'tableName', string>,
    explore: Explore,
) => {
    const dateDimensions = Object.values(
        explore.tables[metric.tableName].dimensions,
    ).filter((dim) =>
        [DimensionType.DATE, DimensionType.TIMESTAMP].includes(dim.type),
    );

    const defaultTimeDimension =
        explore.tables[explore.baseTable].defaultTimeDimension;
    if (!defaultTimeDimension) return;

    const dimensionName = defaultTimeDimension.field;

    const dimensionId = getItemId({
        name: dimensionName,
        table: metric.tableName,
    });

    const match = dateDimensions.find(
        (dimension) => getItemId(dimension) === dimensionId,
    );

    return match;
};

export const createMetricPreviewUnsavedChartVersion = (
    metric: Record<'name' | 'tableName', string>,
    explore: Explore,
): CreateSavedChartVersion => {
    const defaultTimeDimension = getDefaultTimeDimension(metric, explore);
    const defaultTimeFilters = defaultTimeDimension
        ? getMetricExplorerDefaultGrainFilters(
              metric.tableName,
              defaultTimeDimension.name,
              defaultTimeDimension.timeInterval,
          )
        : [];

    let chartConfig = DEFAULT_EMPTY_EXPLORE_CONFIG.chartConfig;

    // If there is no default time dimension, we want to default to a big number chart because there is no time dimension to plot a chart
    if (!defaultTimeDimension) {
        chartConfig = {
            type: ChartType.BIG_NUMBER,
            config: {},
        };
    }

    return {
        ...DEFAULT_EMPTY_EXPLORE_CONFIG,
        tableName: metric.tableName,
        chartConfig,
        metricQuery: {
            ...DEFAULT_EMPTY_EXPLORE_CONFIG.metricQuery,
            exploreName: metric.tableName,
            dimensions: defaultTimeDimension
                ? [getItemId(defaultTimeDimension)]
                : [],
            metrics: [
                getItemId({
                    name: metric.name,
                    table: metric.tableName,
                }),
            ],
            ...(defaultTimeFilters
                ? {
                      filters: {
                          dimensions: {
                              id: uuidv4(),
                              or: defaultTimeFilters,
                          },
                      },
                  }
                : null),
        },
    };
};

export const getExplorerUrlFromCreateSavedChartVersion = (
    projectUuid: string,
    createSavedChart: CreateSavedChartVersion,
    // Pass true to preserve long url. This is sometimes desireable when we want
    // all of the information in the URL, but don't use it for navigation.
    // For example, the explore from here button uses the entire URL to create
    // shareable, shortened links.
    preserveLongUrl?: boolean,
): { pathname: string; search: string } => {
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

export const parseExplorerSearchParams = (
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
    const history = useHistory();
    const pathParams = useParams<{
        projectUuid: string;
        tableId: string | undefined;
    }>();

    const dateZoom = useDateZoomGranularitySearch();
    const unsavedChartVersion = useExplorerContext(
        (context) => context.state.unsavedChartVersion,
    );
    const metricQuery = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery,
    );
    const clearExplore = useExplorerContext(
        (context) => context.actions.clearExplore,
    );
    const setTableName = useExplorerContext(
        (context) => context.actions.setTableName,
    );

    // Update url params based on pristine state
    useEffect(() => {
        if (metricQuery && unsavedChartVersion.tableName) {
            history.replace(
                getExplorerUrlFromCreateSavedChartVersion(
                    pathParams.projectUuid,
                    {
                        ...unsavedChartVersion,
                        metricQuery,
                    },
                ),
            );
        }
    }, [
        metricQuery,
        history,
        pathParams.projectUuid,
        unsavedChartVersion,
        dateZoom,
    ]);

    useEffect(() => {
        if (!pathParams.tableId) {
            clearExplore();
        } else {
            setTableName(pathParams.tableId);
        }
    }, [pathParams.tableId, clearExplore, setTableName]);
};

export const useExplorerUrlState = (): ExplorerReduceState | undefined => {
    const { showToastError } = useToaster();
    const { search } = useLocation();
    const pathParams = useParams<{
        projectUuid: string;
        tableId: string | undefined;
    }>();

    return useMemo(() => {
        if (pathParams.tableId) {
            try {
                const unsavedChartVersion = parseExplorerSearchParams(
                    search,
                ) || {
                    tableName: '',
                    metricQuery: {
                        exploreName: '',
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
                    shouldFetchResults: true,
                    expandedSections: unsavedChartVersion
                        ? [
                              ExplorerSection.VISUALIZATION,
                              ExplorerSection.RESULTS,
                          ]
                        : [ExplorerSection.RESULTS],
                    unsavedChartVersion,
                    modals: {
                        additionalMetric: {
                            isOpen: false,
                        },
                        customDimension: {
                            isOpen: false,
                        },
                    },
                };
            } catch (e: any) {
                const errorMessage = e.message ? ` Error: "${e.message}"` : '';
                showToastError({
                    title: 'Error parsing url',
                    subtitle: `URL is invalid or incomplete.${errorMessage}`,
                });
            }
        }
    }, [pathParams, search, showToastError]);
};
