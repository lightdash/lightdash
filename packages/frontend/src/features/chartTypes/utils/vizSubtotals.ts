import {
    isMetric,
    isTableCalculation,
    type DataAppVizFieldMapping,
    type DataAppVizSchema,
    type DataAppVizSubtotalsRequest,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { z } from 'zod';

type VizSubtotalParentValues = DataAppVizSubtotalsRequest['parentValues'];

export const getVizHierarchyDimensions = (
    schema: DataAppVizSchema | null | undefined,
    mapping: DataAppVizFieldMapping,
): string[] | null => {
    if (!schema?.hierarchy) return null;
    const hierarchyField = schema.fields.find(
        (field) => field.name === schema.hierarchy?.field,
    );
    if (
        hierarchyField?.type !== 'dimension' ||
        hierarchyField.multiple !== true
    )
        return null;
    const dimensions = mapping[schema.hierarchy.field];
    return Array.isArray(dimensions) &&
        dimensions.length > 0 &&
        dimensions.every(
            (dimension): dimension is string =>
                typeof dimension === 'string' && dimension.trim().length > 0,
        ) &&
        new Set(dimensions).size === dimensions.length
        ? dimensions
        : null;
};

// A query that returns no metric or table calculation has nothing to subtotal.
export const hasVizSubtotalValues = (queryItemsMap: ItemsMap): boolean =>
    Object.values(queryItemsMap).some(
        (item) => isMetric(item) || isTableCalculation(item),
    );

const subtotalIntent = z
    .object({
        level: z.number().int().nonnegative(),
        parentValues: z.array(
            z.union([z.string(), z.number(), z.boolean(), z.null()]),
        ),
    })
    .strict();

export const parseVizSubtotalIntent = (
    dimensions: string[],
    intent: unknown,
): {
    subtotalDimensions: string[];
    parentValues: VizSubtotalParentValues;
} => {
    const parsed = subtotalIntent.safeParse(intent);
    if (!parsed.success) {
        throw new Error(
            'A subtotal request needs a level and an array of parentValues.',
        );
    }
    const { level, parentValues } = parsed.data;
    if (level >= dimensions.length || parentValues.length !== level) {
        throw new Error('The subtotal level must follow its parent path.');
    }
    return {
        subtotalDimensions: dimensions.slice(0, level + 1),
        parentValues,
    };
};

export const filterRowsToParent = (
    rows: ResultRow[],
    dimensions: string[],
    parentValues: VizSubtotalParentValues,
): ResultRow[] =>
    rows.filter((row) =>
        parentValues.every((parentValue, index) => {
            const raw: unknown = row[dimensions[index]]?.value.raw;
            return parentValue === null
                ? raw === null || raw === undefined
                : raw === parentValue;
        }),
    );
