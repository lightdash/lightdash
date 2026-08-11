import { type Element, type Root } from 'hast';
import { visit } from 'unist-util-visit';

// One counter across both tiers (memory + project context) so inline markers
// and the sources list share a single numbering. Unknown sources are
// malformed and get no number.
export const rehypeCitationIndices = () => (tree: Root) => {
    const indices = new Map<string, number>();

    visit(tree, 'element', (node: Element) => {
        if (node.tagName !== 'ld-mem-cite') return;

        const source = node.properties?.source ?? 'memory';
        if (source !== 'memory' && source !== 'context') return;

        const id = node.properties?.id;
        if (typeof id !== 'string') return;

        const normalizedId = id.replace(/^user-content-/, '');
        const key = `${source}:${normalizedId}`;
        const index = indices.get(key) ?? indices.size + 1;
        indices.set(key, index);
        node.properties['data-citation-index'] = index;
    });
};
