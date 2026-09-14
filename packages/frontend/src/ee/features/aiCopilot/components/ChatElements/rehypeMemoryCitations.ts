import { type Element, type Root } from 'hast';
import { visit } from 'unist-util-visit';

export const rehypeMemoryCitationIndices = () => (tree: Root) => {
    const indices = new Map<string, number>();

    visit(tree, 'element', (node: Element) => {
        if (node.tagName !== 'ld-mem-cite') return;

        const id = node.properties?.id;
        if (typeof id !== 'string') return;

        const normalizedId = id.replace(/^user-content-/, '');
        const index =
            indices.get(normalizedId) ??
            (() => {
                const nextIndex = indices.size + 1;
                indices.set(normalizedId, nextIndex);
                return nextIndex;
            })();
        node.properties['data-memory-index'] = index;
    });
};
