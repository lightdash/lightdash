import { type Element, type Root } from 'hast';
import { visit } from 'unist-util-visit';

const CITATION_TAG_NAMES = ['ld-mem-cite', 'ld-ctx-cite'];

/**
 * Number every citation marker in one answer, memories and project-context
 * entries sharing a single sequence so the reader sees 1, 2, 3 in reading order
 * whatever each marker points at. Repeats of the same source reuse its number.
 */
export const rehypeCitationIndices = () => (tree: Root) => {
    const indices = new Map<string, number>();

    visit(tree, 'element', (node: Element) => {
        if (!CITATION_TAG_NAMES.includes(node.tagName)) return;

        const id = node.properties?.id;
        if (typeof id !== 'string') return;

        // rehype-sanitize namespaces the ids it lets through
        const key = `${node.tagName}:${id.replace(/^user-content-/, '')}`;
        const index =
            indices.get(key) ??
            (() => {
                const nextIndex = indices.size + 1;
                indices.set(key, nextIndex);
                return nextIndex;
            })();
        node.properties['data-citation-index'] = index;
    });
};
