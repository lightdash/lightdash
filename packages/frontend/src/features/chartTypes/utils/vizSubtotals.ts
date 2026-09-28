import {
    ChartType,
    type ChartConfig,
    type DataAppVizFieldMapping,
    type DataAppVizSchema,
} from '@lightdash/common';
import { z } from 'zod';

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

export const getVizSubtotalDimensions = (
    chartConfig: ChartConfig,
    schema: DataAppVizSchema | null | undefined,
): string[] | null => {
    if (chartConfig.type !== ChartType.DATA_APP_VIZ) return null;
    return getVizHierarchyDimensions(
        schema,
        chartConfig.config?.fieldMapping ?? {},
    );
};

const subtotalIntent = z
    .object({
        level: z.number().int().nonnegative(),
        parentValues: z.array(
            z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
        ),
    })
    .strict();

export const buildVizSubtotalRequest = (
    dimensions: string[],
    intent: unknown,
) => {
    const { level, parentValues } = subtotalIntent.parse(intent);
    if (level >= dimensions.length || parentValues.length !== level) {
        throw new Error('The subtotal level must follow its parent path.');
    }
    return {
        subtotalDimensions: [dimensions[level]],
        parent: parentValues.map((value, index) => ({
            dimensionId: dimensions[index],
            value,
        })),
    };
};
