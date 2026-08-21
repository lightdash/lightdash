import {
    serializeCustomChartTypeForPrompt,
    type CustomChartType,
} from '@lightdash/common';

export type CustomChartTypeLibrary = {
    // Newest first, capped at the inline limit; totalCount is the whole
    // library's size so the block can point past the cap.
    types: CustomChartType[];
    totalCount: number;
};

/**
 * The `availableCustomChartTypes` system prompt block. Empty string for an
 * empty library — the section (including its header) disappears entirely.
 */
export const renderAvailableCustomChartTypes = ({
    types,
    totalCount,
}: CustomChartTypeLibrary): string => {
    if (types.length === 0) return '';
    const lines = [
        '## Available custom chart types',
        "This project has custom chart types — the team's own reusable visualizations, identified by slug. When the user asks about one, answer from the list below; call `findCustomChartTypes` with a slug to read a type's full schema (field slots and config options), or with a query to search the library.",
        '<availableCustomChartTypes>',
        ...types.map(serializeCustomChartTypeForPrompt),
        '</availableCustomChartTypes>',
    ];
    const remainder = totalCount - types.length;
    if (remainder > 0) {
        lines.push(
            `${remainder} more types exist — use findCustomChartTypes to search the whole library.`,
        );
    }
    return lines.join('\n');
};
