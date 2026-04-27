import {
    convertFieldRefToFieldId,
    isFormulaTableCalculation,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    type TableCalculation,
} from '../types/field';
import {
    ChartType,
    type CartesianChart,
    type ChartConfig,
} from '../types/savedCharts';

/**
 * Input for detecting unused dimensions in a cartesian chart.
 */
export type UnusedDimensionsInput = {
    /** The chart configuration */
    chartType: ChartType;
    /** The chart config object (contains layout for cartesian charts) */
    chartConfig: ChartConfig['config'] | undefined;
    /** Pivot/group by dimension field IDs */
    pivotDimensions: string[];
    /** All dimension field IDs in the metric query */
    queryDimensions: string[];
    /** Table calculations in the metric query */
    queryTableCalculations?: TableCalculation[];
};

const lightdashVariablePattern = /\$\{((?!(lightdash|ld)\.)[a-zA-Z0-9_.]+)\}/g;

const getLightdashReferences = (sql: string): string[] =>
    [...sql.matchAll(new RegExp(lightdashVariablePattern.source, 'g'))].map(
        (match) => match[1],
    );

const convertReferenceToFieldId = (reference: string): string => {
    try {
        return reference.includes('.')
            ? convertFieldRefToFieldId(reference)
            : reference;
    } catch {
        return reference;
    }
};

// Identifiers that are syntactically valid in a formula but never refer to a
// user field — keywords, boolean literals, and the operators that the grammar
// accepts in identifier position. Function names are excluded separately by
// detecting `<ident>(`, so we don't need to enumerate them here.
const FORMULA_RESERVED_WORDS = new Set(['TRUE', 'FALSE', 'AND', 'OR', 'NOT']);

const getFormulaReferences = (formula: string): string[] => {
    // Drop the leading `=` and any double-quoted string literals so identifiers
    // appearing inside a string aren't mistaken for column references.
    const stripped = formula
        .replace(/^=/, '')
        .replace(/"(?:[^"\\]|\\.)*"/g, '');

    // An identifier immediately followed by `(` is a function call (CONCAT,
    // SUM, IF, …) and never a column ref.
    const functionNames = new Set(
        [...stripped.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(
            (match) => match[1],
        ),
    );

    return [...stripped.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)]
        .map((match) => match[1])
        .filter((identifier) => !functionNames.has(identifier))
        .filter(
            (identifier) =>
                !FORMULA_RESERVED_WORDS.has(identifier.toUpperCase()),
        );
};

export const getTableCalculationReferencedFieldIds = (
    tableCalculation: TableCalculation,
): string[] => {
    if (isSqlTableCalculation(tableCalculation)) {
        return getLightdashReferences(tableCalculation.sql).map(
            convertReferenceToFieldId,
        );
    }

    if (isFormulaTableCalculation(tableCalculation)) {
        return getFormulaReferences(tableCalculation.formula).map(
            convertReferenceToFieldId,
        );
    }

    if (isTemplateTableCalculation(tableCalculation)) {
        const { template } = tableCalculation;
        const fieldIdPart =
            'fieldId' in template && template.fieldId !== null
                ? [template.fieldId]
                : [];
        const orderByPart =
            'orderBy' in template
                ? template.orderBy.map((orderBy) => orderBy.fieldId)
                : [];
        const partitionByPart =
            'partitionBy' in template && template.partitionBy
                ? template.partitionBy
                : [];

        return [...fieldIdPart, ...orderByPart, ...partitionByPart];
    }

    return [];
};

const getDimensionsUsedByTableCalculations = ({
    queryDimensions,
    queryTableCalculations,
    usedTableCalculationNames,
}: {
    queryDimensions: string[];
    queryTableCalculations: TableCalculation[];
    usedTableCalculationNames: Set<string>;
}): string[] => {
    const dimensions = new Set<string>();
    const queryDimensionsSet = new Set(queryDimensions);
    const tableCalculationsByName = new Map(
        queryTableCalculations.map((tableCalculation) => [
            tableCalculation.name,
            tableCalculation,
        ]),
    );
    const visitedTableCalculationNames = new Set<string>();

    const visitTableCalculation = (tableCalculationName: string) => {
        if (visitedTableCalculationNames.has(tableCalculationName)) {
            return;
        }
        visitedTableCalculationNames.add(tableCalculationName);

        const tableCalculation =
            tableCalculationsByName.get(tableCalculationName);
        if (!tableCalculation) {
            return;
        }

        for (const fieldId of getTableCalculationReferencedFieldIds(
            tableCalculation,
        )) {
            if (queryDimensionsSet.has(fieldId)) {
                dimensions.add(fieldId);
            }
            if (tableCalculationsByName.has(fieldId)) {
                visitTableCalculation(fieldId);
            }
        }
    };

    usedTableCalculationNames.forEach(visitTableCalculation);

    return [...dimensions];
};

/**
 * Detects dimensions in the query that are not used in the chart configuration.
 *
 * For cartesian charts, dimensions should be used in one of:
 * - x-axis (xField)
 * - y-axis (yField) - though typically metrics go here
 * - group by / pivot (pivotDimensions)
 *
 * If a dimension is in the query but not used in any of these places,
 * it may cause incorrect results when using backend pivoting.
 *
 * @returns Array of unused dimension field IDs, or empty array if none
 */
export function getUnusedDimensions(input: UnusedDimensionsInput): {
    unusedDimensions: string[];
} {
    const {
        chartType,
        chartConfig,
        pivotDimensions,
        queryDimensions,
        queryTableCalculations = [],
    } = input;

    if (chartType !== ChartType.CARTESIAN) {
        return { unusedDimensions: [] };
    }

    if (queryDimensions.length === 0) {
        return { unusedDimensions: [] };
    }

    const usedDimensions = new Set<string>();
    const queryTableCalculationNames = new Set(
        queryTableCalculations.map((tableCalculation) => tableCalculation.name),
    );
    const usedTableCalculationNames = new Set<string>();

    // Get layout from cartesian chart config
    // We cast to CartesianChart since we've already verified chartType is CARTESIAN
    const cartesianConfig = chartConfig as CartesianChart | undefined;
    const layout = cartesianConfig?.layout;

    // Add xField if it's a dimension (i.e., in the queryDimensions list)
    if (layout?.xField && queryDimensions.includes(layout.xField)) {
        usedDimensions.add(layout.xField);
    }
    if (layout?.xField && queryTableCalculationNames.has(layout.xField)) {
        usedTableCalculationNames.add(layout.xField);
    }

    // Add yField items if they're dimensions
    if (layout?.yField) {
        for (const field of layout.yField) {
            if (queryDimensions.includes(field)) {
                usedDimensions.add(field);
            }
            if (queryTableCalculationNames.has(field)) {
                usedTableCalculationNames.add(field);
            }
        }
    }

    // Add all pivot dimensions (these are always dimensions by definition)
    for (const pivotDim of pivotDimensions) {
        usedDimensions.add(pivotDim);
    }

    for (const dimension of getDimensionsUsedByTableCalculations({
        queryDimensions,
        queryTableCalculations,
        usedTableCalculationNames,
    })) {
        usedDimensions.add(dimension);
    }

    // Find query dimensions that are not used anywhere
    const unusedDimensions = queryDimensions.filter(
        (dim) => !usedDimensions.has(dim),
    );

    return { unusedDimensions };
}

/**
 * Checks if a chart has unused dimensions that may cause incorrect results.
 * This is a convenience wrapper around getUnusedDimensions.
 */
export function hasUnusedDimensions(input: UnusedDimensionsInput): boolean {
    return getUnusedDimensions(input).unusedDimensions.length > 0;
}

/**
 * Input for detecting unused table calculations in a cartesian chart.
 */
export type UnusedTableCalculationsInput = {
    /** The chart configuration */
    chartType: ChartType;
    /** The chart config object (contains layout for cartesian charts) */
    chartConfig: ChartConfig['config'] | undefined;
    /** All table calculation names in the metric query */
    queryTableCalculations: string[];
};

/**
 * Detects table calculations in the query that are not used in the chart configuration.
 *
 * For cartesian charts, table calculations should be used in one of:
 * - x-axis (xField)
 * - y-axis (yField)
 *
 * If a table calculation is in the query but not used in any of these places,
 * it may cause incorrect results (extra rows that don't aggregate properly).
 *
 * @returns Array of unused table calculation names, or empty array if none
 */
export function getUnusedTableCalculations(
    input: UnusedTableCalculationsInput,
): {
    unusedTableCalculations: string[];
} {
    const { chartType, chartConfig, queryTableCalculations } = input;

    if (chartType !== ChartType.CARTESIAN) {
        return { unusedTableCalculations: [] };
    }

    if (queryTableCalculations.length === 0) {
        return { unusedTableCalculations: [] };
    }

    const usedTableCalculations = new Set<string>();

    // Get layout from cartesian chart config
    const cartesianConfig = chartConfig as CartesianChart | undefined;
    const layout = cartesianConfig?.layout;

    // Add xField if it's a table calculation
    if (layout?.xField && queryTableCalculations.includes(layout.xField)) {
        usedTableCalculations.add(layout.xField);
    }

    // Add yField items if they're table calculations
    if (layout?.yField) {
        for (const field of layout.yField) {
            if (queryTableCalculations.includes(field)) {
                usedTableCalculations.add(field);
            }
        }
    }

    // Find query table calculations that are not used anywhere
    const unusedTableCalculations = queryTableCalculations.filter(
        (tc) => !usedTableCalculations.has(tc),
    );

    return { unusedTableCalculations };
}

/**
 * Checks if a chart has unused table calculations that may cause incorrect results.
 * This is a convenience wrapper around getUnusedTableCalculations.
 */
export function hasUnusedTableCalculations(
    input: UnusedTableCalculationsInput,
): boolean {
    return getUnusedTableCalculations(input).unusedTableCalculations.length > 0;
}
