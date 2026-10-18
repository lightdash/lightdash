import { type ReadyQueryResultsPage } from '../types/api';
import {
    DimensionType,
    FieldType,
    friendlyName,
    MetricType,
    type Dimension,
    type ItemsMap,
    type Metric,
} from '../types/field';
import { type MetricQuery } from '../types/metricQuery';
import { type PivotConfiguration } from '../types/pivot';
import {
    type RawResultRow,
    type ResultColumn,
    type ResultColumns,
    type ResultRow,
} from '../types/results';
import assertUnreachable from './assertUnreachable';

/**
 * Whether a result column plays the dimension or the metric part when its
 * result is charted. Semantic columns know; the rest is inferred, in one
 * place, and can be overridden per column.
 */
export type ResultColumnRole = 'dimension' | 'metric';

export type ResultColumnItemsOptions = {
    /**
     * The table the synthesized fields belong to and the prefix of their
     * field ids (`<table>_<reference>`). A composer artifact uses the node id.
     */
    table: string;
    tableLabel?: string;
    /** Explicit roles, by column reference. They win over every inference. */
    roles?: Partial<Record<string, ResultColumnRole>>;
    /** The pivot the result was produced with: index and group-by columns are dimensions, value columns are metrics. */
    pivotConfiguration?: Pick<
        PivotConfiguration,
        'indexColumn' | 'valuesColumns' | 'groupByColumns'
    > | null;
};

export type ResultColumnItems = {
    itemsMap: ItemsMap;
    /** The query the fields imply: dimensions then metrics, in column order, nothing else. */
    metricQuery: MetricQuery;
    roles: Record<string, ResultColumnRole>;
    fieldIdByColumn: Record<string, string>;
    columnByFieldId: Record<string, string>;
};

const RESULT_ITEMS_DEFAULT_LIMIT = 500;

export const getResultColumnFieldId = (table: string, reference: string) =>
    `${table}_${reference}`;

const pivotIndexReferences = (
    indexColumn: PivotConfiguration['indexColumn'],
): string[] => {
    if (!indexColumn) return [];
    return (Array.isArray(indexColumn) ? indexColumn : [indexColumn]).map(
        (column) => column.reference,
    );
};

/** The role of a column: explicit, then what the producer declared, then the pivot it came from, then its type. */
export const getResultColumnRole = (
    column: ResultColumn,
    options: Pick<ResultColumnItemsOptions, 'roles' | 'pivotConfiguration'>,
): ResultColumnRole => {
    const explicit = options.roles?.[column.reference];
    if (explicit) return explicit;
    const declared = column.provenance?.fieldType;
    if (declared !== undefined) {
        switch (declared) {
            case FieldType.DIMENSION:
                return 'dimension';
            case FieldType.METRIC:
                return 'metric';
            default:
                return assertUnreachable(
                    declared,
                    'Unknown result column field type',
                );
        }
    }
    const pivot = options.pivotConfiguration;
    if (pivot) {
        if (pivotIndexReferences(pivot.indexColumn).includes(column.reference))
            return 'dimension';
        if (
            pivot.groupByColumns?.some(
                (groupBy) => groupBy.reference === column.reference,
            )
        )
            return 'dimension';
        if (
            pivot.valuesColumns.some(
                (value) => value.reference === column.reference,
            )
        )
            return 'metric';
    }
    return column.type === DimensionType.NUMBER ? 'metric' : 'dimension';
};

const metricTypeOf = (type: DimensionType): MetricType => {
    switch (type) {
        case DimensionType.NUMBER:
            return MetricType.NUMBER;
        case DimensionType.STRING:
            return MetricType.STRING;
        case DimensionType.DATE:
            return MetricType.DATE;
        case DimensionType.TIMESTAMP:
            return MetricType.TIMESTAMP;
        case DimensionType.BOOLEAN:
            return MetricType.BOOLEAN;
        default:
            return assertUnreachable(type, 'Unknown result column type');
    }
};

/**
 * Turns the columns of any query result into the items the chart stack
 * draws from, so a composer, SQL or Python result charts exactly like a
 * metric query result. Rows keyed by column reference must be rekeyed with
 * `fieldIdByColumn` (see `rekeyRawRows`), the way merged results are.
 *
 * The items are honest about what they are not: they carry no `sql`, no
 * provenance to an explore, and interaction capabilities that need a
 * semantic field (drill-down, underlying data, URLs) stay off.
 */
export const buildResultColumnItems = (
    columns: ResultColumns,
    options: ResultColumnItemsOptions,
): ResultColumnItems => {
    const itemsMap: ItemsMap = {};
    const roles: Record<string, ResultColumnRole> = {};
    const fieldIdByColumn: Record<string, string> = {};
    const columnByFieldId: Record<string, string> = {};
    const dimensions: string[] = [];
    const metrics: string[] = [];

    Object.values(columns).forEach((column) => {
        const role = getResultColumnRole(column, options);
        const fieldId = getResultColumnFieldId(options.table, column.reference);
        const base = {
            name: column.reference,
            table: options.table,
            tableLabel: options.tableLabel ?? '',
            label: column.label ?? friendlyName(column.reference),
            sql: '',
            hidden: false,
            ...(column.format ? { format: column.format } : {}),
            ...(column.formatOptions
                ? { formatOptions: column.formatOptions }
                : {}),
            ...(column.separator ? { separator: column.separator } : {}),
        };
        switch (role) {
            case 'dimension': {
                const dimension: Dimension = {
                    ...base,
                    fieldType: FieldType.DIMENSION,
                    type: column.type,
                    ...(column.timeInterval
                        ? { timeInterval: column.timeInterval }
                        : {}),
                    ...(column.shiftsTimezone === false
                        ? { skipTimezoneConversion: true }
                        : {}),
                };
                itemsMap[fieldId] = dimension;
                dimensions.push(fieldId);
                break;
            }
            case 'metric': {
                const metric: Metric = {
                    ...base,
                    fieldType: FieldType.METRIC,
                    type: metricTypeOf(column.type),
                    ...(column.timeInterval
                        ? { baseDimensionTimeInterval: column.timeInterval }
                        : {}),
                };
                itemsMap[fieldId] = metric;
                metrics.push(fieldId);
                break;
            }
            default:
                assertUnreachable(role, 'Unknown result column role');
        }
        roles[column.reference] = role;
        fieldIdByColumn[column.reference] = fieldId;
        columnByFieldId[fieldId] = column.reference;
    });

    return {
        itemsMap,
        metricQuery: {
            exploreName: options.table,
            dimensions,
            metrics,
            filters: {},
            sorts: [],
            limit: RESULT_ITEMS_DEFAULT_LIMIT,
            tableCalculations: [],
            additionalMetrics: [],
            customDimensions: [],
        },
        roles,
        fieldIdByColumn,
        columnByFieldId,
    };
};

const rekey = <T>(
    row: Record<string, T>,
    fieldIdByColumn: Record<string, string>,
): Record<string, T> =>
    Object.fromEntries(
        Object.entries(row).map(([column, value]) => [
            fieldIdByColumn[column] ?? column,
            value,
        ]),
    );

/** Rows keyed by column reference, keyed by field id instead. Keys without a field (pivot value columns) are kept. */
export const rekeyRawRows = (
    rows: RawResultRow[],
    fieldIdByColumn: Record<string, string>,
): RawResultRow[] => rows.map((row) => rekey(row, fieldIdByColumn));

export const rekeyResultRows = (
    rows: ResultRow[],
    fieldIdByColumn: Record<string, string>,
): ResultRow[] => rows.map((row) => rekey(row, fieldIdByColumn));

type PivotDetails = NonNullable<ReadyQueryResultsPage['pivotDetails']>;

/** Pivot details whose column references name fields instead of result columns. Pivot column names are row keys and stay. */
export const rekeyPivotDetails = (
    pivotDetails: PivotDetails,
    fieldIdByColumn: Record<string, string>,
): PivotDetails => {
    const fieldIdOf = (reference: string) =>
        fieldIdByColumn[reference] ?? reference;
    const rekeyIndex = (
        indexColumn: PivotDetails['indexColumn'],
    ): PivotDetails['indexColumn'] => {
        if (!indexColumn) return indexColumn;
        if (Array.isArray(indexColumn))
            return indexColumn.map((column) => ({
                ...column,
                reference: fieldIdOf(column.reference),
            }));
        return { ...indexColumn, reference: fieldIdOf(indexColumn.reference) };
    };
    return {
        ...pivotDetails,
        indexColumn: rekeyIndex(pivotDetails.indexColumn),
        valuesColumns: pivotDetails.valuesColumns.map((column) => ({
            ...column,
            referenceField: fieldIdOf(column.referenceField),
            pivotValues: column.pivotValues.map((pivotValue) => ({
                ...pivotValue,
                referenceField: fieldIdOf(pivotValue.referenceField),
            })),
        })),
        groupByColumns: pivotDetails.groupByColumns?.map((column) => ({
            ...column,
            reference: fieldIdOf(column.reference),
        })),
        sortBy: pivotDetails.sortBy?.map((sort) => ({
            ...sort,
            reference: fieldIdOf(sort.reference),
        })),
        originalColumns: Object.fromEntries(
            Object.entries(pivotDetails.originalColumns).map(
                ([reference, column]) => [
                    fieldIdOf(reference),
                    { ...column, reference: fieldIdOf(column.reference) },
                ],
            ),
        ),
        passthroughDimensions: pivotDetails.passthroughDimensions?.map(
            (column) => ({
                ...column,
                reference: fieldIdOf(column.reference),
            }),
        ),
    };
};

/** A pivot configuration addressed by field id, addressed by result column instead, for the engine that runs it. */
export const pivotConfigurationToColumns = (
    pivotConfiguration: PivotConfiguration,
    columnByFieldId: Record<string, string>,
): PivotConfiguration => {
    const columnOf = (fieldId: string) => columnByFieldId[fieldId] ?? fieldId;
    const toColumnsIndex = (
        indexColumn: PivotConfiguration['indexColumn'],
    ): PivotConfiguration['indexColumn'] => {
        if (!indexColumn) return indexColumn;
        if (Array.isArray(indexColumn))
            return indexColumn.map((column) => ({
                ...column,
                reference: columnOf(column.reference),
            }));
        return { ...indexColumn, reference: columnOf(indexColumn.reference) };
    };
    return {
        ...pivotConfiguration,
        indexColumn: toColumnsIndex(pivotConfiguration.indexColumn),
        valuesColumns: pivotConfiguration.valuesColumns.map((column) => ({
            ...column,
            reference: columnOf(column.reference),
        })),
        groupByColumns: pivotConfiguration.groupByColumns?.map((column) => ({
            ...column,
            reference: columnOf(column.reference),
        })),
        sortBy: pivotConfiguration.sortBy?.map((sort) => ({
            ...sort,
            reference: columnOf(sort.reference),
        })),
        sortOnlyColumns: pivotConfiguration.sortOnlyColumns?.map((column) => ({
            ...column,
            reference: columnOf(column.reference),
        })),
        sortOnlyDimensions: pivotConfiguration.sortOnlyDimensions?.map(
            (column) => ({ ...column, reference: columnOf(column.reference) }),
        ),
    };
};
