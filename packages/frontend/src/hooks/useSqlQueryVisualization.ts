import {
    ApiQueryResults,
    ChartConfig,
    ChartType,
    CompiledDimension,
    CreateSavedChartVersion,
    Explore,
    fieldId,
    FieldId,
    FieldType,
    friendlyName,
    SupportedDbtAdapter,
} from '@lightdash/common';
import { useEffect, useMemo, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useApp } from '../providers/AppProvider';
import { getValidChartConfig } from '../providers/ExplorerProvider';
import { parseExplorerSearchParams } from './useExplorerRoute';
import { useSqlQueryMutation } from './useSqlQuery';

type SqlRunnerState = {
    createSavedChart: CreateSavedChartVersion | undefined;
    sqlRunner: { sql: string } | undefined;
};

export const getSqlRunnerUrlFromCreateSavedChartVersion = (
    projectUuid: string,
    sqlRunnerState: SqlRunnerState,
): { pathname: string; search: string } => {
    const newParams = new URLSearchParams();
    newParams.set(
        'create_saved_chart_version',
        JSON.stringify(sqlRunnerState.createSavedChart),
    );
    newParams.set('sql_runner', JSON.stringify(sqlRunnerState.sqlRunner));
    return {
        pathname: `/projects/${projectUuid}/sqlRunner`,
        search: newParams.toString(),
    };
};

export const useSqlRunnerRoute = (sqlRunnerState: SqlRunnerState) => {
    const history = useHistory();
    const pathParams = useParams<{
        projectUuid: string;
    }>();

    useEffect(() => {
        if (sqlRunnerState) {
            history.replace(
                getSqlRunnerUrlFromCreateSavedChartVersion(
                    pathParams.projectUuid,
                    sqlRunnerState,
                ),
            );
        }
    }, [sqlRunnerState, history, pathParams.projectUuid]);
};

export const useSqlRunnerUrlState = (): SqlRunnerState | undefined => {
    const { showToastError } = useApp();
    const { search } = useLocation();

    return useMemo(() => {
        try {
            const searchParams = new URLSearchParams(search);
            const sqlRunnerSearchParam = searchParams.get('sql_runner');
            const sqlRunner = sqlRunnerSearchParam
                ? JSON.parse(sqlRunnerSearchParam)
                : undefined;
            const createSavedChart = parseExplorerSearchParams(search);

            return {
                createSavedChart,
                sqlRunner,
            };
        } catch (e: any) {
            showToastError({ title: 'Error parsing url', subtitle: e });
        }
    }, [search, showToastError]);
};

const SQL_RESULTS_TABLE_NAME = 'sql_runner';

type Args = {
    initialState: SqlRunnerState['createSavedChart'];
    sqlQueryMutation: ReturnType<typeof useSqlQueryMutation>;
};

const useSqlQueryVisualization = ({
    initialState,
    sqlQueryMutation: { data },
}: Args) => {
    const sqlQueryDimensions: Record<FieldId, CompiledDimension> = useMemo(
        () =>
            Object.entries(data?.fields || []).reduce(
                (acc, [key, { type }]) => {
                    const dimension: CompiledDimension = {
                        fieldType: FieldType.DIMENSION,
                        type,
                        name: key,
                        label: friendlyName(key),
                        table: SQL_RESULTS_TABLE_NAME,
                        tableLabel: '',
                        sql: '',
                        compiledSql: '',
                        hidden: false,
                    };
                    return { ...acc, [fieldId(dimension)]: dimension };
                },
                {},
            ),
        [data],
    );

    const dimensions: string[] = useMemo(() => {
        return Object.keys(sqlQueryDimensions);
    }, [sqlQueryDimensions]);

    const resultsData: ApiQueryResults = useMemo(
        () => ({
            metricQuery: {
                dimensions: dimensions,
                metrics: [],
                filters: {},
                sorts: [],
                limit: 0,
                tableCalculations: [],
            },
            rows: (data?.rows || []).map((row) =>
                Object.keys(row).reduce((acc, columnName) => {
                    const raw = row[columnName];
                    return {
                        ...acc,
                        [`${SQL_RESULTS_TABLE_NAME}_${columnName}`]: {
                            value: {
                                raw,
                                formatted: `${raw}`,
                            },
                        },
                    };
                }, {}),
            ),
        }),
        [data?.rows, dimensions],
    );
    const explore: Explore = useMemo(
        () => ({
            name: SQL_RESULTS_TABLE_NAME,
            label: '',
            tags: [],
            baseTable: SQL_RESULTS_TABLE_NAME,
            joinedTables: [],
            tables: {
                [SQL_RESULTS_TABLE_NAME]: {
                    name: SQL_RESULTS_TABLE_NAME,
                    label: '',
                    database: '',
                    schema: '',
                    sqlTable: '',
                    dimensions: sqlQueryDimensions,
                    metrics: {},
                    lineageGraph: {},
                },
            },
            targetDatabase: SupportedDbtAdapter.POSTGRES,
        }),
        [sqlQueryDimensions],
    );

    const [chartType, setChartType] = useState<ChartType>(
        initialState?.chartConfig?.type || ChartType.CARTESIAN,
    );
    const [chartConfig, setChartConfig] = useState<ChartConfig['config']>(
        initialState?.chartConfig?.config,
    );
    const [pivotFields, setPivotFields] = useState<string[] | undefined>(
        initialState?.pivotConfig?.columns,
    );

    const createSavedChart = useMemo(
        () => ({
            tableName: explore.name,
            metricQuery: resultsData.metricQuery,
            pivotConfig: pivotFields
                ? {
                      columns: pivotFields,
                  }
                : undefined,
            chartConfig: getValidChartConfig(chartType, chartConfig),
            tableConfig: {
                columnOrder: dimensions,
            },
        }),
        [
            chartConfig,
            chartType,
            dimensions,
            explore.name,
            pivotFields,
            resultsData.metricQuery,
        ],
    );

    return {
        initialChartConfig: initialState?.chartConfig,
        initialPivotDimensions: initialState?.pivotConfig?.columns,
        explore,
        resultsData,
        chartType,
        columnOrder: dimensions,
        createSavedChart,
        setChartType,
        setChartConfig,
        setPivotFields,
    };
};

export default useSqlQueryVisualization;
