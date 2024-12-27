import {
    HTML_SANITIZE_MARKDOWN_TILE_RULES,
    sanitizeHtml,
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
