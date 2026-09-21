import {
    convertFieldRefToFieldId,
    getItemId,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    lightdashVariablePattern,
    type MetricQuery,
    type TableCalculation,
    type TableCalculationTemplate,
} from '@lightdash/common';

const templateReferences = (template: TableCalculationTemplate): string[] => {
    const referenced: string[] = [];
    if (template.fieldId) referenced.push(template.fieldId);
    if ('orderBy' in template) {
        for (const sort of template.orderBy ?? [])
            referenced.push(sort.fieldId);
    }
    if ('partitionBy' in template) {
        referenced.push(...(template.partitionBy ?? []));
    }
    return referenced;
};

/**
 * What a table calculation needs selected beside itself: query field ids and
 * the names of other table calculations. Null when a reference cannot be
 * resolved, which the preview treats as "not bindable" rather than sending a
 * query the warehouse would reject.
 *
 * Formula calculations name their columns in a grammar this module does not
 * parse, so they resolve to null and stay out of the preview's pools.
 */
const tableCalculationReferences = (
    calc: TableCalculation,
    fieldIds: ReadonlySet<string>,
    calcNames: ReadonlySet<string>,
): string[] | null => {
    const resolve = (reference: string): string | null => {
        if (calcNames.has(reference) || fieldIds.has(reference)) {
            return reference;
        }
        try {
            const fieldId = convertFieldRefToFieldId(reference);
            return fieldIds.has(fieldId) ? fieldId : null;
        } catch {
            return null;
        }
    };

    const raw = isSqlTableCalculation(calc)
        ? [...calc.sql.matchAll(lightdashVariablePattern)].map(
              (match) => match[1],
          )
        : isTemplateTableCalculation(calc)
          ? templateReferences(calc.template)
          : null;
    if (raw === null) return null;

    const resolved: string[] = [];
    for (const reference of raw) {
        const id = resolve(reference);
        if (id === null) return null;
        if (!resolved.includes(id)) resolved.push(id);
    }
    return resolved;
};

/**
 * The table calculations a query can actually offer as columns: every
 * reference resolves, including through other calculations it builds on.
 */
export const bindableTableCalculations = (
    metricQuery: MetricQuery,
): TableCalculation[] => {
    const fieldIds = new Set([
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
    ]);
    const byName = new Map(
        metricQuery.tableCalculations.map((calc) => [getItemId(calc), calc]),
    );
    const calcNames = new Set(byName.keys());
    const verdicts = new Map<string, boolean>();

    const resolves = (name: string, visiting: Set<string>): boolean => {
        const cached = verdicts.get(name);
        if (cached !== undefined) return cached;
        // A cycle cannot be compiled; treat it as unresolvable.
        if (visiting.has(name)) return false;
        const calc = byName.get(name);
        if (!calc) return false;
        visiting.add(name);
        const references = tableCalculationReferences(
            calc,
            fieldIds,
            calcNames,
        );
        const verdict =
            references !== null &&
            references.every(
                (id) => !calcNames.has(id) || resolves(id, visiting),
            );
        visiting.delete(name);
        verdicts.set(name, verdict);
        return verdict;
    };

    return metricQuery.tableCalculations.filter((calc) =>
        resolves(getItemId(calc), new Set()),
    );
};

/**
 * The table calculations a binding keeps, and the query columns they need.
 *
 * A preview narrows a saved chart's columns to the bound inputs, so a
 * calculation that referenced a dropped column can no longer compile. Only
 * the bound calculations survive, together with the ones they build on.
 */
export const retainBoundTableCalculations = (
    metricQuery: MetricQuery,
    boundCalcNames: string[],
): { tableCalculations: TableCalculation[]; referencedFieldIds: string[] } => {
    const fieldIds = new Set([
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
    ]);
    const byName = new Map(
        metricQuery.tableCalculations.map((calc) => [getItemId(calc), calc]),
    );
    const calcNames = new Set(byName.keys());
    const keptNames = new Set<string>();
    const referencedFieldIds: string[] = [];

    const visit = (name: string): void => {
        if (keptNames.has(name)) return;
        const calc = byName.get(name);
        if (!calc) return;
        keptNames.add(name);
        for (const id of tableCalculationReferences(
            calc,
            fieldIds,
            calcNames,
        ) ?? []) {
            if (calcNames.has(id)) visit(id);
            else if (!referencedFieldIds.includes(id)) {
                referencedFieldIds.push(id);
            }
        }
    };
    boundCalcNames.forEach(visit);

    return {
        tableCalculations: metricQuery.tableCalculations.filter((calc) =>
            keptNames.has(getItemId(calc)),
        ),
        referencedFieldIds,
    };
};
