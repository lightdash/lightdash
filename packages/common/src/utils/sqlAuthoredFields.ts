import {
    isCustomSqlDimension,
    isSqlTableCalculation,
    type CustomSqlDimension,
    type SqlTableCalculation,
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
        return !savedDim || savedDim.sql !== dim.sql;
    });

    const incomingCalcs = getSqlTableCalculations(incoming);
    const savedCalcsByName = new Map(
        getSqlTableCalculations(saved).map((calc) => [calc.name, calc]),
    );
    const modifiedTableCalculations = incomingCalcs.filter((calc) => {
        const savedCalc = savedCalcsByName.get(calc.name);
        return !savedCalc || savedCalc.sql !== calc.sql;
    });

    return {
        customDimensions: modifiedCustomDimensions,
        tableCalculations: modifiedTableCalculations,
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
