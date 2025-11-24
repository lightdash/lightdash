import {
    Divider,
    type MantineStyleProp,
    rem,
    Title,
    useMantineTheme,
} from '@mantine-8/core';
import type MarkdownPreview from '@uiw/react-markdown-preview';
import type MDEditor from '@uiw/react-md-editor';

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

const HEADER_STYLES = {
    border: 0,
} satisfies MantineStyleProp;
/**
 * Component overrides for MDEditor.Markdown to match Lightdash design system.
 * Provides consistent styling for markdown headers and dividers.
 */
export const mdEditorComponents: React.ComponentProps<
    typeof MDEditor.Markdown
>['components'] = {
    hr: () => <Divider color="ldGray.4" my="sm" />,
    h1: ({ children }) => (
        <Title order={1} style={HEADER_STYLES}>
            {children}
        </Title>
    ),
    h2: ({ children }) => (
        <Title order={2} style={HEADER_STYLES}>
            {children}
        </Title>
    ),
    h3: ({ children }) => (
        <Title order={3} style={HEADER_STYLES}>
            {children}
        </Title>
    ),
    h4: ({ children }) => (
        <Title order={4} style={HEADER_STYLES}>
            {children}
        </Title>
    ),
    h5: ({ children }) => (
        <Title order={5} style={HEADER_STYLES}>
            {children}
        </Title>
    ),
    h6: ({ children }) => (
        <Title order={6} style={HEADER_STYLES}>
            {children}
        </Title>
    ),
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
        padding: 0,
    };
};
