import { type Element, type Root } from 'hast';
import { visit } from 'unist-util-visit';

// Node ids follow the composer `query` tool's nodeId schema
const QUERY_NODE_HREF = /^#query-node-([a-zA-Z_][a-zA-Z0-9_]{0,62})$/;

/** Marks `[label](#query-node-<nodeId>)` links, numbered per message by first appearance. */
export const rehypeQueryNodeReferences = () => (tree: Root) => {
    const indices = new Map<string, number>();

    visit(tree, 'element', (node: Element) => {
        if (node.tagName !== 'a') return;
        const href = node.properties?.href;
        const nodeId =
            typeof href === 'string' ? QUERY_NODE_HREF.exec(href)?.[1] : null;
        if (!nodeId) return;

        const index = indices.get(nodeId) ?? indices.size + 1;
        indices.set(nodeId, index);
        node.properties = {
            ...node.properties,
            'data-content-type': 'query-node-link',
            'data-node-id': nodeId,
            'data-reference-index': index,
        };
    });
};
