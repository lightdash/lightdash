import { type AiAgentThreadComposerNode } from '@lightdash/common';
import { type Element, type ElementContent, type Root } from 'hast';
import { SKIP, visit } from 'unist-util-visit';

const textOf = (node: ElementContent): string => {
    if (node.type === 'text') return node.value;
    return node.type === 'element' ? node.children.map(textOf).join('') : '';
};

/** Marks citations of the given nodes; every other citation becomes its plain text. */
export const rehypeNodeCitations =
    ({
        resolvedNodes,
    }: {
        resolvedNodes: readonly AiAgentThreadComposerNode[];
    }) =>
    (tree: Root) => {
        const titles = new Map(
            resolvedNodes.map(({ nodeId, title }) => [nodeId, title]),
        );

        visit(tree, 'element', (node: Element, index, parent) => {
            if (
                node.tagName !== 'a' ||
                node.properties?.['data-content-type'] !== 'node-citation'
            ) {
                return undefined;
            }

            const nodeId = node.properties['data-node-id'];
            if (typeof nodeId === 'string' && titles.has(nodeId)) {
                node.properties.title = titles.get(nodeId) ?? undefined;
                node.properties['data-citation-figure'] = node.children
                    .map(textOf)
                    .join('');
                return undefined;
            }

            if (parent && index !== undefined) {
                parent.children.splice(index, 1, ...node.children);
                return [SKIP, index + node.children.length];
            }
            return undefined;
        });
    };
