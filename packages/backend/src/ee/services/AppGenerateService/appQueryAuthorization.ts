import {
    ForbiddenError,
    getCustomSqlFieldKey,
    getTotalFilterRules,
    isCustomBinDimension,
    isCustomSqlDimension,
    isSqlTableCalculation,
    type ExtractedQueryReference,
    type PersistedDataAppDataReferences,
} from '@lightdash/common';
import type { ExecuteAsyncMetricQueryArgs } from '../../../services/AsyncQueryService/types';

export type DataAppQueryInputs = Pick<
    ExecuteAsyncMetricQueryArgs,
    | 'metricQuery'
    | 'parameters'
    | 'dashboardFilters'
    | 'dateZoom'
    | 'pivotConfiguration'
>;

// Match the query SDK's field qualification, including joined-table dot refs.
const qualify = (explore: string, field: string): string => {
    if (field.includes('.')) return field.replace('.', '_');
    return field.startsWith(`${explore}_`) ? field : `${explore}_${field}`;
};

// Local metric names can be qualified with a joined table, not just the
// explore. Their aliases never grant access to a same-named modeled field.
const isLocalId = (id: string, names: Iterable<string>): boolean =>
    Array.from(names).some((name) => id === name || id.endsWith(`_${name}`));

/**
 * Consumer access grants the fields referenced by an immutable app version,
 * not its exact queries. Filters, grouping and limits may change. Never infer
 * permission from an unresolved reference or from a client-defined field name.
 */
export function assertDataAppQueryAllowed(
    dataReferences: PersistedDataAppDataReferences,
    {
        metricQuery,
        parameters,
        dashboardFilters,
        dateZoom,
        pivotConfiguration,
    }: DataAppQueryInputs,
): void {
    const deny = (): never => {
        throw new ForbiddenError(
            'This query is not authorized by the data app version’s saved data references',
        );
    };
    const explore = metricQuery.exploreName;
    const references = dataReferences.references.filter(
        (ref): ref is ExtractedQueryReference =>
            ref.kind === 'query' &&
            ref.explore === explore &&
            ref.unresolved.length === 0,
    );
    // These inputs can introduce fields/SQL not described by the references:
    // pivot SQL has a separate shape, and date zoom can substitute a different
    // modeled time dimension (including one with custom SQL).
    if (references.length === 0 || pivotConfiguration || dateZoom?.granularity)
        deny();

    const fields = new Set<string>();
    const localNames = new Set<string>();
    const parameterKeys = new Set<string>();
    const tableCalculationSqls = new Set<string>();
    const customDimensionSqls = new Set<string>();
    const additionalMetricSqls = new Set<string>();
    for (const ref of references) {
        ref.localFields.forEach((field) => localNames.add(field));
        [
            ...ref.dimensions,
            ...ref.metrics,
            ...ref.dimensionFilterFields,
            ...ref.metricFilterFields,
            ...ref.sortFields,
        ].forEach((field) => {
            const id = qualify(explore, field);
            if (!isLocalId(id, ref.localFields)) fields.add(id);
        });
        ref.parameterKeys.forEach((key) => parameterKeys.add(key));
        ref.customSql?.tableCalculations.forEach((sql) =>
            tableCalculationSqls.add(sql),
        );
        ref.customSql?.customDimensions.forEach((field) =>
            customDimensionSqls.add(getCustomSqlFieldKey(field)),
        );
        ref.customSql?.additionalMetrics.forEach((field) =>
            additionalMetricSqls.add(getCustomSqlFieldKey(field)),
        );
    }
    for (const ref of dataReferences.references) {
        if (
            ref.kind === 'globalFilter' &&
            ref.explore === explore &&
            ref.unresolved.length === 0
        ) {
            (ref.fields ?? (ref.field ? [ref.field] : [])).forEach((field) => {
                const id = qualify(explore, field);
                if (!isLocalId(id, localNames)) fields.add(id);
            });
        }
    }

    const assertField = (field: string) => {
        if (!fields.has(field)) deny();
    };
    const addLocalField = (name: string, id: string) => {
        if (!localNames.has(name)) deny();
        fields.add(id);
    };
    // SQL must come from this version, even when another chart the consumer
    // can view would satisfy the normal custom-SQL provenance check.
    for (const dimension of metricQuery.customDimensions ?? []) {
        if (isCustomSqlDimension(dimension)) {
            if (!customDimensionSqls.has(getCustomSqlFieldKey(dimension)))
                deny();
        } else if (isCustomBinDimension(dimension)) {
            assertField(dimension.dimensionId);
        } else deny();
        addLocalField(dimension.id, dimension.id);
    }
    for (const metric of metricQuery.additionalMetrics ?? []) {
        if (!additionalMetricSqls.has(getCustomSqlFieldKey(metric))) deny();
        // These additional SQL inputs are not recorded by the validator yet.
        if (
            metric.distinctKeys?.length ||
            metric.generationType ||
            metric.baseMetricId ||
            metric.timeDimensionId
        )
            deny();
        if (metric.baseDimensionName)
            assertField(`${metric.table}_${metric.baseDimensionName}`);
        if (metric.baseMetricName)
            assertField(`${metric.table}_${metric.baseMetricName}`);
        metric.filters?.forEach((filter) =>
            assertField(qualify(metric.table, filter.target.fieldRef)),
        );
        addLocalField(metric.name, `${metric.table}_${metric.name}`);
    }
    for (const calculation of metricQuery.tableCalculations) {
        // Formula/template definitions are not persisted in data_references.
        if (
            !isSqlTableCalculation(calculation) ||
            'formula' in calculation ||
            'template' in calculation ||
            !tableCalculationSqls.has(calculation.sql)
        )
            deny();
        addLocalField(calculation.name, calculation.name);
    }

    [
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...metricQuery.sorts.map((sort) => sort.fieldId),
        ...(metricQuery.pivotDimensions ?? []),
        ...getTotalFilterRules(metricQuery.filters).map(
            (filter) => filter.target.fieldId,
        ),
        ...Object.values(dashboardFilters ?? {}).flatMap((filters) =>
            filters.map((filter) => filter.target.fieldId),
        ),
        ...(dateZoom?.xAxisFieldId ? [dateZoom.xAxisFieldId] : []),
    ].forEach(assertField);
    Object.keys(parameters ?? {}).forEach((key) => {
        if (!parameterKeys.has(key)) deny();
    });
}
