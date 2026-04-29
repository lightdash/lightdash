import {
    isCustomSqlDimension,
    isSqlTableCalculation,
    type CustomDimension,
    type CustomSqlDimension,
    type SqlTableCalculation,
    type TableCalculation,
} from '../types/field';
import { type MetricQuery } from '../types/metricQuery';

export type SqlAuthoredFields = {
    customDimensions: CustomSqlDimension[];
    tableCalculations: SqlTableCalculation[];
};

const getSqlCustomDimensions = (
    metricQuery: Pick<MetricQuery, 'customDimensions'> | null | undefined,
): CustomSqlDimension[] =>
    (metricQuery?.customDimensions ?? []).filter(isCustomSqlDimension);

const getSqlTableCalculations = (
    metricQuery: Pick<MetricQuery, 'tableCalculations'> | null | undefined,
): SqlTableCalculation[] =>
    (metricQuery?.tableCalculations ?? []).filter(isSqlTableCalculation);

export const hasSqlAuthoredFields = (
    metricQuery:
        | Pick<MetricQuery, 'customDimensions' | 'tableCalculations'>
        | null
        | undefined,
): boolean =>
    getSqlCustomDimensions(metricQuery).length > 0 ||
    getSqlTableCalculations(metricQuery).length > 0;

// Empty incoming sql against a non-empty saved value is treated as preserved
// — supports stripped-on-encode round-trips where the body never travels.
const isPreservedSqlBody = (incoming: string, saved: string): boolean =>
    incoming === saved || (incoming === '' && saved !== '');

export const getModifiedSqlAuthoredFields = (
    incoming:
        | Pick<MetricQuery, 'customDimensions' | 'tableCalculations'>
        | null
        | undefined,
    saved:
        | Pick<MetricQuery, 'customDimensions' | 'tableCalculations'>
        | null
        | undefined,
): SqlAuthoredFields => {
    const incomingDims = getSqlCustomDimensions(incoming);
    const savedDimsById = new Map(
        getSqlCustomDimensions(saved).map((dim) => [dim.id, dim]),
    );
    const modifiedCustomDimensions = incomingDims.filter((dim) => {
        const savedDim = savedDimsById.get(dim.id);
        return !savedDim || !isPreservedSqlBody(dim.sql, savedDim.sql);
    });

    const incomingCalcs = getSqlTableCalculations(incoming);
    const savedCalcsByName = new Map(
        getSqlTableCalculations(saved).map((calc) => [calc.name, calc]),
    );
    const modifiedTableCalculations = incomingCalcs.filter((calc) => {
        const savedCalc = savedCalcsByName.get(calc.name);
        return !savedCalc || !isPreservedSqlBody(calc.sql, savedCalc.sql);
    });

    return {
        customDimensions: modifiedCustomDimensions,
        tableCalculations: modifiedTableCalculations,
    };
};

// Strips the `sql` body from custom SQL dims and SQL table calcs — used for
// serialising metric queries into URLs without leaking authored SQL.
export const stripSqlBodiesFromMetricQuery = <
    T extends Pick<MetricQuery, 'customDimensions' | 'tableCalculations'>,
>(
    metricQuery: T,
): T => ({
    ...metricQuery,
    customDimensions: metricQuery.customDimensions?.map(
        (dim): CustomDimension =>
            isCustomSqlDimension(dim) ? { ...dim, sql: '' } : dim,
    ),
    tableCalculations: metricQuery.tableCalculations.map(
        (calc): TableCalculation =>
            isSqlTableCalculation(calc) ? { ...calc, sql: '' } : calc,
    ),
});

// Replaces empty `sql` bodies on incoming SQL fields with the saved chart's
// SQL where ids/names match — enables stripped-on-encode round-trips.
// Stripped SQL table calcs are identified structurally because
// `isSqlTableCalculation` requires a non-empty sql body.
const hasEmptySqlBody = (calc: TableCalculation): boolean =>
    'sql' in calc &&
    typeof (calc as { sql?: unknown }).sql === 'string' &&
    (calc as { sql: string }).sql === '';

export const mergeSavedSqlBodiesIntoMetricQuery = <T extends MetricQuery>(
    incoming: T,
    saved:
        | Pick<MetricQuery, 'customDimensions' | 'tableCalculations'>
        | null
        | undefined,
): T => {
    if (!saved) return incoming;
    const savedSqlDimsById = new Map(
        getSqlCustomDimensions(saved).map((dim) => [dim.id, dim]),
    );
    const savedSqlCalcsByName = new Map(
        getSqlTableCalculations(saved).map((calc) => [calc.name, calc]),
    );
    return {
        ...incoming,
        customDimensions: incoming.customDimensions?.map(
            (dim): CustomDimension => {
                if (!isCustomSqlDimension(dim) || dim.sql !== '') return dim;
                const savedDim = savedSqlDimsById.get(dim.id);
                return savedDim?.sql ? { ...dim, sql: savedDim.sql } : dim;
            },
        ),
        tableCalculations: incoming.tableCalculations.map(
            (calc): TableCalculation => {
                if (!hasEmptySqlBody(calc)) return calc;
                const savedCalc = savedSqlCalcsByName.get(calc.name);
                return savedCalc?.sql
                    ? ({ ...calc, sql: savedCalc.sql } as TableCalculation)
                    : calc;
            },
        ),
    };
};

export const hasModifiedSqlAuthoredFields = (
    incoming:
        | Pick<MetricQuery, 'customDimensions' | 'tableCalculations'>
        | null
        | undefined,
    saved:
        | Pick<MetricQuery, 'customDimensions' | 'tableCalculations'>
        | null
        | undefined,
): boolean => {
    const modified = getModifiedSqlAuthoredFields(incoming, saved);
    return (
        modified.customDimensions.length > 0 ||
        modified.tableCalculations.length > 0
    );
};
