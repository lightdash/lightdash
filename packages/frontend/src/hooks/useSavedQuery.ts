import {
    ApiError,
    CartesianSeriesType,
    ChartConfig,
    CreateSavedChart,
    CreateSavedChartVersion,
    DBChartTypes,
    MetricQuery,
    SavedChart,
    UpdateSavedChart,
} from 'common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useHistory, useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

// Temporary types
type ValidSeriesLayout = {
    xDimension: string;
    yMetrics: string[];
    groupDimension: string | undefined;
};
type SeriesLayout = Partial<ValidSeriesLayout>;

export type SavedQuery = {
    uuid: string;
    projectUuid: string;
    name: string;
    tableName: string;
    metricQuery: MetricQuery;
    chartConfig: {
        chartType: DBChartTypes;
        seriesLayout: SeriesLayout;
    };
    tableConfig: {
        columnOrder: string[];
    };
    updatedAt: Date;
};

type CreateSavedQuery = Omit<SavedQuery, 'uuid' | 'updatedAt'>;

export type CreateSavedQueryVersion = Omit<
    SavedQuery,
    'uuid' | 'name' | 'updatedAt' | 'projectUuid'
>;

type UpdateSavedQuery = Pick<SavedQuery, 'name'>;

const v1ToV2ChartConfig = (
    data: Pick<SavedQuery, 'chartConfig'>,
): Pick<SavedChart, 'chartConfig' | 'pivotConfig'> => {
    const pivotConfig = data.chartConfig.seriesLayout.groupDimension
        ? { columns: [data.chartConfig.seriesLayout.groupDimension] }
        : undefined;
    let convertedChartType: ChartConfig['type'] = 'cartesian';
    let convertedChartConfig: ChartConfig['config'] | undefined;
    switch (data.chartConfig.chartType) {
        case DBChartTypes.BIG_NUMBER:
            convertedChartType = 'big_number';
            convertedChartConfig = undefined;
            break;
        case DBChartTypes.TABLE:
            convertedChartType = 'table';
            convertedChartConfig = undefined;
            break;
        case DBChartTypes.COLUMN:
        case DBChartTypes.LINE:
        case DBChartTypes.SCATTER:
        case DBChartTypes.BAR:
            convertedChartType = 'cartesian';
            const { xDimension } = data.chartConfig.seriesLayout;
            let cartesianType: CartesianSeriesType;
            switch (data.chartConfig.chartType) {
                case DBChartTypes.BAR:
                case DBChartTypes.COLUMN:
                    cartesianType = CartesianSeriesType.BAR;
                    break;
                case DBChartTypes.SCATTER:
                    cartesianType = CartesianSeriesType.SCATTER;
                    break;
                case DBChartTypes.LINE:
                    cartesianType = CartesianSeriesType.LINE;
                    break;
                default:
                    const never: never = data.chartConfig.chartType;
            }
            if (xDimension && data.chartConfig.seriesLayout.yMetrics) {
                convertedChartConfig = {
                    series: data.chartConfig.seriesLayout.yMetrics.map(
                        (yField) => ({
                            xField: xDimension,
                            yField,
                            type: cartesianType,
                            flipAxes:
                                data.chartConfig.chartType === DBChartTypes.BAR,
                        }),
                    ),
                };
            } else {
                convertedChartConfig = { series: [] };
            }
            break;
        default:
            const never: never = data.chartConfig.chartType;
    }
    return {
        chartConfig: {
            type: convertedChartType,
            config: convertedChartConfig,
        } as ChartConfig,
        ...(pivotConfig ? { pivotConfig } : {}),
    };
};

const v2ToV1 = (chart: SavedChart): SavedQuery => {
    const groupDimension = chart.pivotConfig
        ? chart.pivotConfig.columns[0]
        : undefined;
    let xDimension: string | undefined;
    let yMetrics: string[] = [];
    let chartType: DBChartTypes = DBChartTypes.LINE;
    const initialType = chart.chartConfig.type;
    switch (initialType) {
        case 'big_number':
            chartType = DBChartTypes.BIG_NUMBER;
            break;
        case 'table':
            chartType = DBChartTypes.TABLE;
            break;
        case 'cartesian':
            const chartConfig = chart.chartConfig.config;
            if (!chartConfig?.series) {
                chartType = DBChartTypes.LINE;
            } else {
                const [firstSeries] = chartConfig.series;
                switch (firstSeries.type) {
                    case CartesianSeriesType.BAR:
                        chartType = firstSeries.flipAxes
                            ? DBChartTypes.BAR
                            : DBChartTypes.COLUMN;
                        break;
                    case CartesianSeriesType.LINE:
                        chartType = DBChartTypes.LINE;
                        break;
                    case CartesianSeriesType.SCATTER:
                        chartType = DBChartTypes.SCATTER;
                        break;
                    default:
                        const never: never = firstSeries.type;
                }
                xDimension = firstSeries.xField;
                yMetrics = chartConfig.series.map((item) => item.yField);
            }
            break;
        default:
            const never: never = initialType;
    }
    return {
        uuid: chart.uuid,
        projectUuid: chart.projectUuid,
        name: chart.name,
        tableName: chart.tableName,
        updatedAt: chart.updatedAt,
        metricQuery: chart.metricQuery,
        chartConfig: {
            chartType,
            seriesLayout: {
                xDimension,
                groupDimension,
                yMetrics,
            },
        },
        tableConfig: chart.tableConfig,
    };
};

const createSavedQuery = async (
    projectUuid: string,
    data: CreateSavedQuery,
): Promise<SavedQuery> => {
    const { pivotConfig, chartConfig } = v1ToV2ChartConfig(data);
    const payload: CreateSavedChart = {
        name: data.name,
        tableName: data.tableName,
        pivotConfig,
        tableConfig: data.tableConfig,
        metricQuery: data.metricQuery,
        chartConfig,
    };
    const chart = await lightdashApi<SavedChart>({
        url: `/projects/${projectUuid}/saved`,
        method: 'POST',
        body: JSON.stringify(payload),
    });
    return v2ToV1(chart);
};

const deleteSavedQuery = async (id: string) =>
    lightdashApi<undefined>({
        url: `/saved/${id}`,
        method: 'DELETE',
        body: undefined,
    });

const updateSavedQuery = async (
    id: string,
    data: UpdateSavedQuery,
): Promise<SavedQuery> => {
    const payload: UpdateSavedChart = {
        name: data.name,
    };
    const chart = await lightdashApi<SavedChart>({
        url: `/saved/${id}`,
        method: 'PATCH',
        body: JSON.stringify(payload),
    });
    return v2ToV1(chart);
};

const getSavedQuery = async (id: string): Promise<SavedQuery> => {
    const chart = await lightdashApi<SavedChart>({
        url: `/saved/${id}`,
        method: 'GET',
        body: undefined,
    });
    return v2ToV1(chart);
};

const addVersionSavedQuery = async ({
    uuid,
    data,
}: {
    uuid: string;
    data: CreateSavedQueryVersion;
}): Promise<SavedQuery> => {
    const { chartConfig, pivotConfig } = v1ToV2ChartConfig(data);
    const payload: CreateSavedChartVersion = {
        tableName: data.tableName,
        chartConfig,
        pivotConfig,
        tableConfig: data.tableConfig,
        metricQuery: data.metricQuery,
    };
    const chart = await lightdashApi<SavedChart>({
        url: `/saved/${uuid}/version`,
        method: 'POST',
        body: JSON.stringify(payload),
    });
    return v2ToV1(chart);
};

interface Args {
    id?: string;
}

export const useSavedQuery = ({ id }: Args = {}) =>
    useQuery<SavedQuery, ApiError>({
        queryKey: ['saved_query', id],
        queryFn: () => getSavedQuery(id || ''),
        enabled: id !== undefined,
        retry: false,
    });

export const useDeleteMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<undefined, ApiError, string>(deleteSavedQuery, {
        mutationKey: ['saved_query_create'],
        onSuccess: async () => {
            await queryClient.invalidateQueries('spaces');
            showToastSuccess({
                title: `Success! Chart was deleted.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete chart`,
                subtitle: error.error.message,
            });
        },
    });
};

export const useUpdateMutation = (savedQueryUuid?: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<SavedQuery, ApiError, UpdateSavedQuery>(
        (data) => {
            if (savedQueryUuid) {
                return updateSavedQuery(savedQueryUuid, data);
            }
            throw new Error('Saved chart ID is undefined');
        },
        {
            mutationKey: ['saved_query_create'],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries('spaces');
                queryClient.setQueryData(['saved_query', data.uuid], data);
                showToastSuccess({
                    title: `Success! Chart was saved.`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to save chart`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useCreateMutation = () => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<SavedQuery, ApiError, CreateSavedQuery>(
        (data) => createSavedQuery(projectUuid, data),
        {
            mutationKey: ['saved_query_create'],
            onSuccess: (data) => {
                queryClient.setQueryData(['saved_query', data.uuid], data);
                showToastSuccess({
                    title: `Success! Chart was updated.`,
                });
                history.push({
                    pathname: `/projects/${projectUuid}/saved/${data.uuid}`,
                    state: {
                        fromExplorer: true,
                    },
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to save chart`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useAddVersionMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<
        SavedQuery,
        ApiError,
        { uuid: string; data: CreateSavedQueryVersion }
    >(addVersionSavedQuery, {
        mutationKey: ['saved_query_version'],
        onSuccess: (data) => {
            queryClient.setQueryData(['saved_query', data.uuid], data);
            showToastSuccess({
                title: `Success! Chart was saved.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to save chart`,
                subtitle: error.error.message,
            });
        },
    });
};
