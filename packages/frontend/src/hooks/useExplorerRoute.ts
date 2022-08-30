import { ChartType, CreateSavedChartVersion } from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useContextSelector } from 'use-context-selector';
import { useApp } from '../providers/AppProvider';
import {
    Context,
    ExplorerReduceState,
    ExplorerSection,
} from '../providers/ExplorerProvider';

export const getExplorerUrlFromCreateSavedChartVersion = (
    projectUuid: string,
    createSavedChart: CreateSavedChartVersion,
): { pathname: string; search: string } => {
    const newParams = new URLSearchParams();
    newParams.set(
        'create_saved_chart_version',
        JSON.stringify(createSavedChart),
    );
    return {
        pathname: `/projects/${projectUuid}/tables/${createSavedChart.tableName}`,
        search: newParams.toString(),
    };
};

export const parseExplorerSearchParams = (
    search: string,
): CreateSavedChartVersion | undefined => {
    const searchParams = new URLSearchParams(search);
    const chartConfigSearchParam = searchParams.get(
        'create_saved_chart_version',
    );
    return chartConfigSearchParam
        ? JSON.parse(chartConfigSearchParam)
        : undefined;
};

export const useExplorerRoute = () => {
    const history = useHistory();
    const pathParams = useParams<{
        projectUuid: string;
        tableId: string | undefined;
    }>();
    const unsavedChartVersion = useContextSelector(
        Context,
        (context) => context!.state.unsavedChartVersion,
    );
    const queryResultsData = useContextSelector(
        Context,
        (context) => context!.queryResults.data,
    );
    const clear = useContextSelector(
        Context,
        (context) => context!.actions.clear,
    );
    const setTableName = useContextSelector(
        Context,
        (context) => context!.actions.setTableName,
    );

    // Update url params based on pristine state
    useEffect(() => {
        if (queryResultsData?.metricQuery) {
            history.replace(
                getExplorerUrlFromCreateSavedChartVersion(
                    pathParams.projectUuid,
                    {
                        ...unsavedChartVersion,
                        metricQuery: queryResultsData.metricQuery,
                    },
                ),
            );
        }
    }, [
        queryResultsData,
        history,
        pathParams.projectUuid,
        unsavedChartVersion,
    ]);

    useEffect(() => {
        if (!pathParams.tableId) {
            clear();
        } else {
            setTableName(pathParams.tableId);
        }
    }, [pathParams.tableId, clear, setTableName]);
};

export const useExplorerUrlState = (): ExplorerReduceState | undefined => {
    const { showToastError } = useApp();
    const { search } = useLocation();
    const pathParams = useParams<{
        projectUuid: string;
        tableId: string | undefined;
    }>();

    return useMemo(() => {
        if (pathParams.tableId) {
            const unsavedChartVersion = parseExplorerSearchParams(search) || {
                tableName: '',
                metricQuery: {
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
            try {
                return {
                    shouldFetchResults: true,
                    expandedSections: unsavedChartVersion
                        ? [
                              ExplorerSection.VISUALIZATION,
                              ExplorerSection.RESULTS,
                          ]
                        : [ExplorerSection.RESULTS],
                    unsavedChartVersion,
                };
            } catch (e: any) {
                showToastError({ title: 'Error parsing url', subtitle: e });
            }
        }
    }, [pathParams, search, showToastError]);
};
