import type MarkdownPreview from '@uiw/react-markdown-preview';

/**
 * Removes header auto-linking when rendering markdown via ReactMarkdownPreview.
 */
export const rehypeRemoveHeaderLinks: React.ComponentProps<
    typeof MarkdownPreview
>['rehypeRewrite'] = (node, _, parent) => {
    if (
        node.tagName === 'a' &&
        parent &&
        /^h(1|2|3|4|5|6)/.test(parent.tagName as string)
    ) {
        parent.children = parent.children.slice(1);
    }
};
