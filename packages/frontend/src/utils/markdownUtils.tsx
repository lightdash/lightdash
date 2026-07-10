import { rem, useMantineTheme } from '@mantine-8/core';
import type MarkdownPreview from '@uiw/react-markdown-preview';

/**
 * Removes header auto-linking when rendering markdown via ReactMarkdownPreview.
 */
export const rehypeRemoveHeaderLinks: React.ComponentProps<
    typeof MarkdownPreview
>['rehypeRewrite'] = (node, _, parent) => {
    if (
        node.type === 'element' &&
        node.tagName === 'a' &&
        parent &&
        parent.type === 'element' &&
        /^h(1|2|3|4|5|6)/.test(parent.tagName as string)
    ) {
        parent.children = parent.children.slice(1);
    }
};

/**
 * Hook to get MDEditor.Markdown style with Mantine's theme font size.
 * @returns Style object with fontSize set to theme.fontSizes.sm
 */
export const useMdEditorStyle = (): React.CSSProperties => {
    const theme = useMantineTheme();
    return {
        fontSize: rem(theme.fontSizes.sm),
        backgroundColor: 'transparent',
    };
};
