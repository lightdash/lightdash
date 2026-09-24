import { getItemId } from '@lightdash/common';
import { z } from 'zod';
import { projectUuid } from './agents';
import type { LightdashApi } from './api';

const fieldSchema = z.object({
    name: z.string(),
    table: z.string(),
    label: z.string(),
    description: z.string().optional(),
    type: z.string(),
    fieldType: z.enum(['dimension', 'metric']),
    hidden: z.boolean(),
});

export type ExploreField = z.output<typeof fieldSchema>;

const exploreSchema = z.object({
    name: z.string(),
    label: z.string(),
    baseTable: z.string(),
    tables: z.record(
        z.string(),
        z.object({
            name: z.string(),
            dimensions: z.record(z.string(), fieldSchema),
            metrics: z.record(z.string(), fieldSchema),
        }),
    ),
});

export type Explore = z.output<typeof exploreSchema>;

export const getExplore = (api: LightdashApi, exploreName: string) =>
    api.get(
        `/api/v1/projects/${projectUuid}/explores/${exploreName}`,
        exploreSchema,
    );

export const baseTableOf = (explore: Explore) => {
    const table = explore.tables[explore.baseTable];
    if (table === undefined) {
        throw new Error(`Explore ${explore.name} has no base table`);
    }
    return table;
};

export const fieldId = (field: ExploreField) => getItemId(field);

/** A base-table field by its field id, e.g. orders_status. */
export const baseField = (explore: Explore, id: string): ExploreField => {
    const table = baseTableOf(explore);
    const field = [
        ...Object.values(table.dimensions),
        ...Object.values(table.metrics),
    ].find((candidate) => fieldId(candidate) === id);
    if (field === undefined) {
        throw new Error(`Explore ${explore.name} has no field ${id}`);
    }
    return field;
};

/** The field context the explorer sends to the table calculation generators. */
export const tableCalculationFieldContext = (field: ExploreField) => ({
    name: field.name,
    table: field.table,
    label: field.label,
    type: field.type,
    description: field.description,
    fieldType: field.fieldType,
});
