import {
    ChartType,
    CustomDimensionType,
    DateGranularity,
    DimensionType,
    getDateDimension,
    getItemId,
    isCartesianChartConfig,
    type CreateSavedChartVersion,
    type CustomBinDimension,
    type CustomDimension,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
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

export const createMetricPreviewUnsavedChartVersion = (
    metric: Record<'name' | 'tableName', string>,
    explore: Explore,
): CreateSavedChartVersion => {
    // Find the best date dimension to use
    const dateDimensions = Object.entries(
        explore.tables[metric.tableName].dimensions,
    ).filter(([_, dim]) =>
        [DimensionType.DATE, DimensionType.TIMESTAMP].includes(dim.type),
    );

    // Try to find a dimension with a date granularity, if not, leave empty
    let dateWithGranularity = dateDimensions.find(([dimId]) => {
        const { baseDimensionId, newTimeFrame } = getDateDimension(dimId);
        return !!baseDimensionId && !!newTimeFrame;
    });

    if (!dateWithGranularity) {
        // Look through all other tables for date dimensions when no date dimension is found in the current table - there could be a joined table with a date dimension
        dateWithGranularity = Object.entries(explore.tables)
            .filter(([tableName]) => tableName !== metric.tableName)
            .flatMap(([_, table]) =>
                Object.entries(table.dimensions).filter(([__, dim]) =>
                    [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                        dim.type,
                    ),
                ),
            )
            .find(([dimId]) => {
                const { baseDimensionId, newTimeFrame } =
                    getDateDimension(dimId);
                return !!baseDimensionId && !!newTimeFrame;
            });
    }

    return {
        ...DEFAULT_EMPTY_EXPLORE_CONFIG,
        tableName: metric.tableName,
        metricQuery: {
            ...DEFAULT_EMPTY_EXPLORE_CONFIG.metricQuery,
            exploreName: metric.tableName,
            dimensions: dateWithGranularity
                ? [getItemId(dateWithGranularity[1])]
                : [],
            metrics: [
                getItemId({
                    name: metric.name,
                    table: metric.tableName,
                }),
            ],
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
