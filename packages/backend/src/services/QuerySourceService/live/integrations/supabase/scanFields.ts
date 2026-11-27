import { DimensionType } from '@lightdash/common';
import { z } from 'zod';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
} from '../../explores/definition';
import {
    SUPABASE_BOOLEAN_FILTERS,
    SUPABASE_DATE_FILTERS,
    SUPABASE_NUMBER_FILTERS,
    SUPABASE_STRUCTURED_FILTERS,
    SUPABASE_TEXT_FILTERS,
    SUPABASE_TIMESTAMP_FILTERS,
} from './filters';

/** Most columns one table brings in; wider tables keep their first ones. */
export const SUPABASE_MAX_COLUMNS = 200;

const columnSchema = z.object({
    type: z.string().optional(),
    format: z.string().optional(),
    description: z.string().optional(),
});

/** One table's entry under `definitions` in PostgREST's OpenAPI description. */
const tableSchema = z.object({
    properties: z.record(z.string(), columnSchema),
});

export type SupabaseColumn = {
    name: string;
    type: string | null;
    format: string | null;
    description: string | null;
};

/** The table's columns, in the order the Data API lists them; empty when the shape is unknown. */
export const readSupabaseColumns = (table: unknown): SupabaseColumn[] => {
    const parsed = tableSchema.safeParse(table);
    if (!parsed.success) {
        return [];
    }
    return Object.entries(parsed.data.properties).map(([name, column]) => ({
        name,
        type: column.type ?? null,
        format: column.format ?? null,
        description: column.description ?? null,
    }));
};

const toFieldRules = ({
    type,
    format,
}: SupabaseColumn): Pick<
    LiveDimensionDefinition,
    'type' | 'filterOperators'
> => {
    if (type === 'integer' || type === 'number') {
        return {
            type: DimensionType.NUMBER,
            filterOperators: SUPABASE_NUMBER_FILTERS,
        };
    }
    if (type === 'boolean') {
        return {
            type: DimensionType.BOOLEAN,
            filterOperators: SUPABASE_BOOLEAN_FILTERS,
        };
    }
    if (type === 'array' || type === 'object' || format?.startsWith('json')) {
        return {
            type: DimensionType.STRING,
            filterOperators: SUPABASE_STRUCTURED_FILTERS,
        };
    }
    if (format === 'date') {
        return {
            type: DimensionType.DATE,
            filterOperators: SUPABASE_DATE_FILTERS,
        };
    }
    if (format?.startsWith('timestamp')) {
        return {
            type: DimensionType.TIMESTAMP,
            filterOperators: SUPABASE_TIMESTAMP_FILTERS,
        };
    }
    return {
        type: DimensionType.STRING,
        filterOperators: SUPABASE_TEXT_FILTERS,
    };
};

/** A column's field name: lowercase letters, digits and underscores. */
const toBaseFieldName = (column: string) =>
    column
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'column';

/** "created_at" reads as "Created at". */
const toLabel = (column: string) => {
    const words = column.replace(/_+/g, ' ').trim();
    return words ? `${words[0].toUpperCase()}${words.slice(1)}` : column;
};

/** PostgREST appends key notes such as "<pk/>" to column comments. */
const toDescription = ({ name, description, format }: SupabaseColumn) => {
    const comment = (description ?? '')
        .replace(/<(pk|fk)[^>]*\/>/g, '')
        .replace(/^Note:\s*/m, '')
        .trim();
    return comment || `${name}${format ? ` (${format})` : ''}`;
};

/** The explore with one dimension per column of the table. */
export const withSupabaseColumns = (
    definition: LiveExploreDefinition,
    columns: SupabaseColumn[],
): LiveExploreDefinition => {
    const taken = new Set<string>();
    const dimensions = columns
        .slice(0, SUPABASE_MAX_COLUMNS)
        .map((column): LiveDimensionDefinition => {
            const base = toBaseFieldName(column.name);
            let name = base;
            for (let suffix = 2; taken.has(name); suffix += 1) {
                name = `${base}_${suffix}`;
            }
            taken.add(name);
            return {
                name,
                apiName: column.name,
                label: toLabel(column.name),
                description: toDescription(column),
                ...toFieldRules(column),
            };
        });
    return { ...definition, dimensions };
};
