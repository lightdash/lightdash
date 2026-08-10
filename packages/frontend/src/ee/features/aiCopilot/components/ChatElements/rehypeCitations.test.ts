import { type Element, type Root } from 'hast';
import { describe, expect, it } from 'vitest';
import { parseCitations, type MessageCitation } from './parseCitations';
import { rehypeCitationIndices } from './rehypeCitations';

type Marker = {
    tagName: 'ld-cite' | 'ld-mem-cite';
    id: string;
    source?: string;
};

const marker = ({ tagName, id, source }: Marker): Element => ({
    type: 'element',
    tagName,
    properties: source ? { id, source } : { id },
    children: [],
});

// Markers nest inside a paragraph, as they do in a rendered answer.
const tree = (markers: Marker[]): Root => ({
    type: 'root',
    children: [
        {
            type: 'element',
            tagName: 'p',
            properties: {},
            children: markers.map(marker),
        },
    ],
});

const number = (markers: Marker[]): Array<number | undefined> => {
    const root = tree(markers);
    rehypeCitationIndices()(root);
    const paragraph = root.children[0] as Element;
    return (paragraph.children as Element[]).map(
        (node) =>
            node.properties?.['data-citation-index'] as number | undefined,
    );
};

const legacy = (id: string): Marker => ({ tagName: 'ld-mem-cite', id });
const cite = (source: string, id: string): Marker => ({
    tagName: 'ld-cite',
    id,
    source,
});

describe('rehypeCitationIndices', () => {
    it('numbers both marker kinds in one sequence in reading order', () => {
        expect(
            number([
                legacy('alpha'),
                cite('context', 'beta-3fa9c2d1'),
                cite('memory', 'gamma'),
            ]),
        ).toEqual([1, 2, 3]);
    });

    it('reuses a number for repeats of the same entry', () => {
        expect(
            number([
                legacy('alpha'),
                cite('context', 'beta-3fa9c2d1'),
                legacy('alpha'),
            ]),
        ).toEqual([1, 2, 1]);
    });

    it('normalizes the sanitize prefix before keying', () => {
        expect(number([legacy('user-content-alpha'), legacy('alpha')])).toEqual(
            [1, 1],
        );
    });

    it('numbers the two tiers separately when slugs collide', () => {
        expect(
            number([cite('memory', 'same'), cite('context', 'same')]),
        ).toEqual([1, 2]);
    });

    it('leaves a marker with an unusable source unnumbered', () => {
        expect(
            number([cite('catalog', 'slug'), { tagName: 'ld-cite', id: 'x' }]),
        ).toEqual([undefined, undefined]);
    });

    it('agrees with the sources-grid parser on order', () => {
        const markdown = [
            'a<ld-mem-cite id="alpha"></ld-mem-cite>',
            'b<ld-cite source="context" id="beta-3fa9c2d1"></ld-cite>',
            'c<ld-cite source="memory" id="gamma"></ld-cite>',
        ].join(' ');
        const parsed: MessageCitation[] = parseCitations(markdown);

        expect(parsed).toEqual([
            { source: 'memory', slug: 'alpha' },
            { source: 'context', slug: 'beta-3fa9c2d1' },
            { source: 'memory', slug: 'gamma' },
        ]);
        expect(
            number([
                legacy('alpha'),
                cite('context', 'beta-3fa9c2d1'),
                cite('memory', 'gamma'),
            ]),
        ).toEqual(parsed.map((_, index) => index + 1));
    });
});
