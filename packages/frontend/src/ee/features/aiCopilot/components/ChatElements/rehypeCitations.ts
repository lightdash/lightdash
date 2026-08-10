import {
    AGENT_CITATION_TAG,
    getAgentCitationKey,
    isAgentCitationSource,
    LEGACY_MEMORY_CITATION_TAG,
} from '@lightdash/common';
import { type Element, type Root } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * One numbering sequence over both marker kinds, in reading order, so a mixed
 * answer reads 1, 2, 3 rather than restarting per tier. Repeats of the same
 * entry reuse its number.
 */
export const rehypeCitationIndices = () => (tree: Root) => {
    const indices = new Map<string, number>();

    visit(tree, 'element', (node: Element) => {
        const isLegacy = node.tagName === LEGACY_MEMORY_CITATION_TAG;
        if (node.tagName !== AGENT_CITATION_TAG && !isLegacy) return;

        const id = node.properties?.id;
        if (typeof id !== 'string') return;
        const source = isLegacy ? 'memory' : node.properties?.source;
        if (!isAgentCitationSource(source)) return;

        // rehype-sanitize prefixes ids; the slug is what identifies the entry.
        const slug = id.replace(/^user-content-/, '');
        const key = getAgentCitationKey({ source, slug });
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
