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

    const resultsData: ApiQueryResults | undefined = useMemo(
        () =>
            data?.rows
                ? {
                      metricQuery: {
                          dimensions: dimensions,
                          metrics: [],
                          filters: {},
                          sorts: [],
                          limit: 0,
                          tableCalculations: [],
                      },
                      rows: data.rows.map((row) =>
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
                  }
                : undefined,
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

    const createSavedChart: CreateSavedChartVersion | undefined = useMemo(
        () =>
            resultsData
                ? {
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
                  }
                : undefined,
        [
            chartConfig,
            chartType,
            dimensions,
            explore.name,
            pivotFields,
            resultsData,
        ],
    );

    return {
        initialChartConfig: initialState?.chartConfig,
        initialPivotDimensions: initialState?.pivotConfig?.columns,
        explore,
        sqlQueryDimensions,
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
