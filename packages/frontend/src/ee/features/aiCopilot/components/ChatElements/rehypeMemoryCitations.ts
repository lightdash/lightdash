import { type Element, type Root } from 'hast';
import { visit } from 'unist-util-visit';
import { type ParsedMemoryCitation } from './parseMemoryCitationSlugs';

type CitationIndicesOptions = {
    /**
     * Citations from message text that precedes this tree in reading order
     * but renders elsewhere (earlier stream segments). They claim the leading
     * numbers so this tree's markers agree with the sources grid, which
     * parses the whole message.
     */
    priorCitations?: ParsedMemoryCitation[];
};

// One counter across both tiers (memory + project context) so inline markers
// and the sources list share a single numbering. Unknown sources and tags
// with a body are malformed (the sources parser rejects them) and get no
// number.
export const rehypeCitationIndices =
    (options?: CitationIndicesOptions) => (tree: Root) => {
        const indices = new Map<string, number>();

        for (const citation of options?.priorCitations ?? []) {
            const key = `${citation.source}:${citation.slug}`;
            if (!indices.has(key)) indices.set(key, indices.size + 1);
        }

        visit(tree, 'element', (node: Element) => {
            if (node.tagName !== 'ld-mem-cite') return;

            const hasBody = node.children.some(
                (child) =>
                    !(child.type === 'text' && child.value.trim() === ''),
            );
            if (hasBody) return;

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
