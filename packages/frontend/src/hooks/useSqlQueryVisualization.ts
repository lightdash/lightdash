import {
    ApiQueryResults,
    ChartConfig,
    ChartType,
    CompiledDimension,
    Explore,
    fieldId,
    FieldId,
    FieldType,
    friendlyName,
    getResultColumnTotals,
    isNumericItem,
    SupportedDbtAdapter,
} from '@lightdash/common';
import { useMemo, useState } from 'react';
import { getValidChartConfig } from '../providers/ExplorerProvider';
import { useSqlQueryMutation } from './useSqlQuery';
import { SqlRunnerState } from './useSqlRunnerRoute';

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

    const totals = useMemo<Record<FieldId, number | undefined>>(() => {
        if (resultsData && sqlQueryDimensions) {
            return getResultColumnTotals(
                resultsData.rows,
                Object.values(sqlQueryDimensions).filter((field) =>
                    isNumericItem(field),
                ),
            );
        }
        return {};
    }, [sqlQueryDimensions, resultsData]);

    return {
        initialChartConfig: initialState?.chartConfig,
        initialPivotDimensions: initialState?.pivotConfig?.columns,
        explore,
        resultsData,
        chartType,
        columnOrder: dimensions,
        createSavedChart,
        totals,
        setChartType,
        setChartConfig,
        setPivotFields,
    };
};

export default useSqlQueryVisualization;
