const TABLE_SELECTION_REGEX = /<slack-table\s+queryUuid="([^"<>\s]+)"\s*\/>/g;
const TABLE_SELECTION_TAG_REGEX = /<\/?slack-table\b[^>]*(?:>|$)/gi;
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

// Only successful table executions from this prompt can supply preview rows.
export const parseSlackTableSelection = (response: string): string[] => [
    ...new Set(
        [
            ...response
                .replace(FENCED_CODE_BLOCK_REGEX, '')
                .matchAll(TABLE_SELECTION_REGEX),
        ].map((match) => match[1]),
    ),
];

export const stripSlackTableSelection = (response: string): string =>
    response
        .replace(TABLE_SELECTION_TAG_REGEX, '')
        .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
        .trim();
