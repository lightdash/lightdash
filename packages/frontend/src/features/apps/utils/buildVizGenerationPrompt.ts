import {
    getItemId,
    getItemLabel,
    isDimension,
    isField,
    type Item,
    type ItemsMap,
} from '@lightdash/common';
import { getDataAppVizFieldItems } from './getDataAppVizFieldItems';

/** A result column offered to the generator, in the order the panel lists it. */
export type VizPromptColumn = {
    id: string;
    label: string;
    role: 'dimension' | 'metric';
    /** Warehouse type for dimensions (`string`, `date`, …); null for metrics. */
    dataType: string | null;
};

/** The query's result columns, split by role, for the composer's chips. */
export const getVizPromptColumns = (itemsMap: ItemsMap): VizPromptColumn[] => {
    const { dimensions, metrics } = getDataAppVizFieldItems(itemsMap);
    const toColumn = (
        item: Item,
        role: 'dimension' | 'metric',
    ): VizPromptColumn => ({
        id: getItemId(item),
        label: getItemLabel(item),
        role,
        dataType:
            role === 'dimension' && isField(item) && isDimension(item)
                ? item.type
                : null,
    });
    return [
        ...dimensions.map((d) => toColumn(d, 'dimension')),
        ...metrics.map((m) => toColumn(m, 'metric')),
    ];
};

/**
 * Marks where the author's own words end and the machine framing begins. The
 * generate API takes a single `prompt` string, so the column manifest has to
 * ride inside it — but the conversation should only ever show what was typed.
 */
const VIZ_PROMPT_CONTEXT_HEADER =
    'This visualization renders the results of a query with these columns:';

/** Recover the author's description from a stored prompt. */
export const stripVizPromptContext = (prompt: string): string => {
    const index = prompt.indexOf(VIZ_PROMPT_CONTEXT_HEADER);
    return (index === -1 ? prompt : prompt.slice(0, index)).trim();
};

const describeColumn = (column: VizPromptColumn): string =>
    column.dataType
        ? `- "${column.label}" — ${column.role} (${column.dataType})`
        : `- "${column.label}" — ${column.role}`;

/**
 * Compose what the generator actually receives: the author's description plus
 * the shape of the data the visualization will be handed.
 *
 * The generator declares a field contract; the host binds result columns to its
 * slots. Naming the columns up front is what makes the contract fit the query
 * by construction, instead of the author discovering a mismatch after a build.
 * Values are deliberately not sent — generation works from schema, rendering
 * works from rows.
 */
export const buildVizGenerationPrompt = (
    description: string,
    columns: VizPromptColumn[],
): string => {
    const trimmed = description.trim();
    if (columns.length === 0) return trimmed;
    return [
        trimmed,
        '',
        VIZ_PROMPT_CONTEXT_HEADER,
        ...columns.map(describeColumn),
        '',
        'Declare a field contract whose slots match these columns by role and type.',
    ].join('\n');
};
