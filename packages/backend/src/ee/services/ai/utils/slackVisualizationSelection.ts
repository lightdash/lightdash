const TABLE_SELECTION_REGEX = /<slack-table\s+queryUuid="([^"<>\s]+)"\s*\/>/g;
const CHART_SELECTION_REGEX = /<slack-chart\s+versionUuid="([^"<>\s]+)"\s*\/>/g;
const SELECTION_TAG_REGEX =
    /<\/?slack-(?:table|chart)\b[^>\n]*(?:>|(?=\n|$))/gi;
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

const selectedReferences = (prose: string, pattern: RegExp): string[] => [
    ...new Set([...prose.matchAll(pattern)].map((match) => match[1])),
];

// These are presentation references only. Each selected execution or artifact
// version is validated against this prompt before fetching rows or rendering.
export const parseSlackVisualizationSelection = (response: string) => {
    const prose = response.replace(FENCED_CODE_BLOCK_REGEX, '');
    return {
        tableQueryUuids: selectedReferences(prose, TABLE_SELECTION_REGEX),
        chartVersionUuids: selectedReferences(prose, CHART_SELECTION_REGEX),
    };
};

export const stripSlackVisualizationSelection = (response: string): string =>
    response
        .replace(SELECTION_TAG_REGEX, '')
        .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
        .trim();
