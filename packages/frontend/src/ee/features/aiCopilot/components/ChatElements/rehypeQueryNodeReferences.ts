import { COMPOSER_NODE_ID_PATTERN } from '@lightdash/common';
import { type Element, type Root } from 'hast';
import { visit } from 'unist-util-visit';

const QUERY_NODE_HREF = new RegExp(
    `^#query-node-(${COMPOSER_NODE_ID_PATTERN})$`,
);
const QUERY_NODE_MARKDOWN_LINK = new RegExp(
    `\\]\\(#query-node-(${COMPOSER_NODE_ID_PATTERN})\\)`,
    'g',
);

/** Plain record: Streamdown keys its plugin cache by JSON.stringify of the options. */
export type QueryNodeReferenceIndices = Readonly<Record<string, number>>;

/** Numbers nodes by first appearance across the whole message; Streamdown
 *  renders each Markdown block on its own, so a per-tree count would restart. */
export const getQueryNodeReferenceIndices = (
    markdown: string,
): QueryNodeReferenceIndices => {
    // Null prototype: a node named `__proto__` must become an own property too
    const indices: Record<string, number> = Object.create(null);
    for (const match of markdown.matchAll(QUERY_NODE_MARKDOWN_LINK)) {
        const nodeId = match[1];
        if (!Object.hasOwn(indices, nodeId))
            indices[nodeId] = Object.keys(indices).length + 1;
    }
    return indices;
};

/** Marks `[label](#query-node-<nodeId>)` links with their message-wide index. */
export const rehypeQueryNodeReferences =
    ({ indices }: { indices: QueryNodeReferenceIndices }) =>
    (tree: Root) => {
        visit(tree, 'element', (node: Element) => {
            if (node.tagName !== 'a') return;
            const href = node.properties?.href;
            const nodeId =
                typeof href === 'string'
                    ? QUERY_NODE_HREF.exec(href)?.[1]
                    : null;
            if (!nodeId) return;

            const index = Object.hasOwn(indices, nodeId)
                ? indices[nodeId]
                : undefined;
            node.properties = {
                ...node.properties,
                'data-content-type': 'query-node-link',
                'data-node-id': nodeId,
                ...(index === undefined
                    ? {}
                    : { 'data-reference-index': index }),
            };
        });
    };
