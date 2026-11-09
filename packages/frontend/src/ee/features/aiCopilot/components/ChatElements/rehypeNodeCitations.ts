import { type Element, type ElementContent, type Root } from 'hast';
import { SKIP, visit } from 'unist-util-visit';

const textOf = (node: ElementContent): string => {
    if (node.type === 'text') return node.value;
    return node.type === 'element' ? node.children.map(textOf).join('') : '';
};

/** Numbers citations by first appearance and drops unresolved ones; null shows them inert, unnumbered. */
export const rehypeNodeCitations =
    ({ resolvedNodeIds }: { resolvedNodeIds: readonly string[] | null }) =>
    (tree: Root) => {
        const resolved = resolvedNodeIds && new Set(resolvedNodeIds);
        const numbers = new Map<string, number>();

        visit(tree, 'element', (node: Element, index, parent) => {
            if (
                node.tagName !== 'a' ||
                node.properties?.['data-content-type'] !== 'node-citation'
            ) {
                return undefined;
            }

            const nodeId = node.properties['data-node-id'];
            if (
                typeof nodeId !== 'string' ||
                (resolved && !resolved.has(nodeId))
            ) {
                if (parent && index !== undefined) {
                    const previous = parent.children[index - 1];
                    if (previous?.type === 'text') {
                        previous.value = previous.value.replace(/[ \t]+$/, '');
                    }
                    parent.children.splice(index, 1);
                    return [SKIP, index];
                }
                return undefined;
            }

            node.properties.title = node.children.map(textOf).join('');
            node.children = [];
            // Streaming renders blocks separately, so numbers wait for the whole message.
            if (resolved) {
                const citationNumber = numbers.get(nodeId) ?? numbers.size + 1;
                numbers.set(nodeId, citationNumber);
                node.properties['data-citation-number'] = citationNumber;
            }
            return undefined;
        });
    };
