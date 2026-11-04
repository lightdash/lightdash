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
        "This project has custom chart types: the team's own reusable visualizations, listed below by slug with their field labels and options. Answer questions about a type from this list, and read its full schema with `findCustomChartTypes` before rendering a chart through it.",
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
