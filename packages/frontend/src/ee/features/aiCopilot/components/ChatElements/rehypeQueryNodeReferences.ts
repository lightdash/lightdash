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

export type QueryNodeReferenceIndices = ReadonlyMap<string, number>;

/** Numbers nodes by first appearance across the whole message; Streamdown
 *  renders each Markdown block on its own, so a per-tree count would restart. */
export const getQueryNodeReferenceIndices = (
    markdown: string,
): QueryNodeReferenceIndices => {
    const indices = new Map<string, number>();
    for (const match of markdown.matchAll(QUERY_NODE_MARKDOWN_LINK)) {
        const nodeId = match[1];
        if (!indices.has(nodeId)) indices.set(nodeId, indices.size + 1);
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

            const index = indices.get(nodeId);
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
