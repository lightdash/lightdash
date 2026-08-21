import {
    serializeCustomChartTypeForPrompt,
    type CustomChartTypeLibrary,
} from '@lightdash/common';

/**
 * The `availableCustomChartTypes` system prompt block. Empty string for an
 * empty library — the section (including its header) disappears entirely.
 */
export const renderAvailableCustomChartTypes = ({
    types,
    totalCount,
}: CustomChartTypeLibrary): string => {
    if (types.length === 0) return '';
    const remainder = totalCount - types.length;
    const lines = [
        '## Available custom chart types',
        "This project has custom chart types — the team's own reusable visualizations, identified by slug. When the user asks about one, answer from the list below; call `findCustomChartTypes` with a slug to read a type's full schema (field slots and config options), or with a query to search the library.",
        '<availableCustomChartTypes>',
        ...types.map(serializeCustomChartTypeForPrompt),
        ...(remainder > 0
            ? [
                  `${remainder} more types exist — use findCustomChartTypes to search the whole library.`,
              ]
            : []),
        '</availableCustomChartTypes>',
    ];
    return lines.join('\n');
};
