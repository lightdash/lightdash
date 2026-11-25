import {
    HTML_SANITIZE_MARKDOWN_TILE_RULES,
    sanitizeHtml,
    type DashboardAiSummaryScope,
    type DashboardMarkdownTile,
} from '@lightdash/common';

export const getLoomId = (value: string | undefined): string | undefined => {
    const arr = value?.match(/share\/(.*)/);
    return arr?.[1];
};

/**
 * Helper that can be used as a value transformer with Mantine's `useForm` hook.
 */
export const markdownTileContentTransform = (
    values: DashboardMarkdownTile['properties'],
) => ({
    ...values,
    content: sanitizeHtml(values.content, HTML_SANITIZE_MARKDOWN_TILE_RULES),
});

export const aiSummaryScopeValidator = {
    scope: (value: DashboardAiSummaryScope | undefined) =>
        value?.type === 'tiles' && value.tileUuids.length === 0
            ? 'Pick at least one chart'
            : null,
};
