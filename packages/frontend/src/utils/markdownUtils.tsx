import { Divider, Title } from '@mantine/core';
import type MarkdownPreview from '@uiw/react-markdown-preview';
import type MDEditor from '@uiw/react-md-editor';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { PluggableList } from 'unified';
import classes from './markdownUtils.module.css';

export const markdownSanitizeRehypePlugins = [
    [rehypeSanitize, defaultSchema],
] satisfies PluggableList;

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
 * Component overrides for MDEditor.Markdown to match Lightdash design system.
 * Provides consistent styling for markdown headers and dividers.
 */
export const mdEditorComponents: React.ComponentProps<
    typeof MDEditor.Markdown
>['components'] = {
    hr: () => <Divider color="ldGray.4" my="sm" />,
    h1: ({ children }) => (
        <Title order={1} className={classes.header}>
            {children}
        </Title>
    ),
    h2: ({ children }) => (
        <Title order={2} className={classes.header}>
            {children}
        </Title>
    ),
    h3: ({ children }) => (
        <Title order={3} className={classes.header}>
            {children}
        </Title>
    ),
    h4: ({ children }) => (
        <Title order={4} className={classes.header}>
            {children}
        </Title>
    ),
    h5: ({ children }) => (
        <Title order={5} className={classes.header}>
            {children}
        </Title>
    ),
    h6: ({ children }) => (
        <Title order={6} className={classes.header}>
            {children}
        </Title>
    ),
};
