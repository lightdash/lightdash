import { Fragment, useMemo, type FC, type ReactNode } from 'react';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

type MarkdownNode = {
    type: string;
    value?: string;
    alt?: string | null;
    url?: string;
    identifier?: string;
    children?: MarkdownNode[];
};

type MarkdownDefinitions = Map<string, string>;

const markdownParser = unified().use(remarkParse).use(remarkGfm);

const getDefinitions = (root: MarkdownNode): MarkdownDefinitions => {
    const definitions: MarkdownDefinitions = new Map();

    const visit = (node: MarkdownNode) => {
        if (node.type === 'definition' && node.identifier && node.url) {
            definitions.set(node.identifier.toLowerCase(), node.url);
        }
        node.children?.forEach(visit);
    };
    visit(root);

    return definitions;
};

const getSafeHref = (href: string | undefined): string | undefined => {
    if (!href) return undefined;

    try {
        const url = new URL(href);
        return ['http:', 'https:', 'mailto:'].includes(url.protocol)
            ? href
            : undefined;
    } catch {
        return undefined;
    }
};

const renderChildren = (
    node: MarkdownNode,
    definitions: MarkdownDefinitions,
    keyPrefix: string,
): ReactNode =>
    node.children?.map((child, index) =>
        renderNode(child, definitions, `${keyPrefix}-${index}`),
    );

const renderLink = (
    node: MarkdownNode,
    definitions: MarkdownDefinitions,
    key: string,
) => {
    const referenceHref = node.identifier
        ? definitions.get(node.identifier.toLowerCase())
        : undefined;
    const href = getSafeHref(node.url ?? referenceHref);
    const children = renderChildren(node, definitions, key);

    return href ? (
        <a key={key} href={href} target="_blank" rel="noreferrer">
            {children}
        </a>
    ) : (
        <Fragment key={key}>{children}</Fragment>
    );
};

const renderNode = (
    node: MarkdownNode,
    definitions: MarkdownDefinitions,
    key: string,
): ReactNode => {
    switch (node.type) {
        case 'text':
            return node.value;
        case 'inlineCode':
            return <code key={key}>{node.value}</code>;
        case 'strong':
            return (
                <strong key={key}>
                    {renderChildren(node, definitions, key)}
                </strong>
            );
        case 'emphasis':
            return <em key={key}>{renderChildren(node, definitions, key)}</em>;
        case 'delete':
            return (
                <del key={key}>{renderChildren(node, definitions, key)}</del>
            );
        case 'link':
        case 'linkReference':
            return renderLink(node, definitions, key);
        case 'image':
        case 'imageReference':
            return node.alt ?? '';
        case 'break':
            return <br key={key} />;
        case 'html':
        case 'definition':
            return null;
        default:
            return (
                <Fragment key={key}>
                    {renderChildren(node, definitions, key)}
                </Fragment>
            );
    }
};

export const DeepResearchInlineMarkdown: FC<{ markdown: string }> = ({
    markdown,
}) => {
    const content = useMemo(() => {
        const root = markdownParser.parse(markdown) as MarkdownNode;
        return renderNode(root, getDefinitions(root), 'inline-markdown');
    }, [markdown]);

    return content;
};
