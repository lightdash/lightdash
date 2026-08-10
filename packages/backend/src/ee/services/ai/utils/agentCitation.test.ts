import { describe, expect, it } from 'vitest';
import {
    getCitedSlugs,
    parseAgentCitations,
    planCitationTelemetry,
    stripAgentCitations,
} from './agentCitation';

describe('agent citations', () => {
    it('parses well-formed and self-closing unified markers', () => {
        expect(
            parseAgentCitations(
                'One.<ld-cite source="memory" id="first"></ld-cite> Two.<ld-cite source="context" id="second" />',
            ),
        ).toEqual({
            citations: [
                { source: 'memory', slug: 'first', count: 1 },
                { source: 'context', slug: 'second', count: 1 },
            ],
            malformedCount: 0,
        });
    });

    it('normalizes the legacy memory tag to source=memory', () => {
        expect(
            parseAgentCitations(
                '<ld-mem-cite id="legacy"></ld-mem-cite><ld-mem-cite id="other" />',
            ).citations,
        ).toEqual([
            { source: 'memory', slug: 'legacy', count: 1 },
            { source: 'memory', slug: 'other', count: 1 },
        ]);
    });

    it('tolerates attribute order and extra whitespace', () => {
        expect(
            parseAgentCitations(
                '<ld-cite   id="reordered"   source="context"  />',
            ).citations,
        ).toEqual([{ source: 'context', slug: 'reordered', count: 1 }]);
    });

    it('counts repeats per entry and keeps first-appearance order', () => {
        const { citations } = parseAgentCitations(
            '<ld-cite source="context" id="beta" /><ld-cite source="memory" id="alpha" /><ld-cite source="context" id="beta" />',
        );
        expect(citations).toEqual([
            { source: 'context', slug: 'beta', count: 2 },
            { source: 'memory', slug: 'alpha', count: 1 },
        ]);
    });

    it('keeps the two tiers in separate namespaces', () => {
        expect(
            parseAgentCitations(
                '<ld-cite source="memory" id="same-slug" /><ld-cite source="context" id="same-slug" />',
            ).citations,
        ).toEqual([
            { source: 'memory', slug: 'same-slug', count: 1 },
            { source: 'context', slug: 'same-slug', count: 1 },
        ]);
    });

    it('mixes the legacy tag with the unified one', () => {
        const { citations } = parseAgentCitations(
            'A<ld-mem-cite id="old" /> B<ld-cite source="context" id="revenue-3fa9c2d1" />',
        );
        expect(getCitedSlugs(citations, 'memory')).toEqual(['old']);
        expect(getCitedSlugs(citations, 'context')).toEqual([
            'revenue-3fa9c2d1',
        ]);
    });

    it('ignores markers inside code fences', () => {
        expect(
            parseAgentCitations(
                '```html\n<ld-cite source="context" id="example" />\n<ld-mem-cite id="example" />\n```',
            ),
        ).toEqual({ citations: [], malformedCount: 0 });
    });

    it.each([
        ['unknown source', '<ld-cite source="catalog" id="slug" />'],
        ['missing source', '<ld-cite id="slug" />'],
        ['missing id', '<ld-cite source="context" />'],
        ['invalid slug', '<ld-cite source="memory" id="Uppercase" />'],
        ['bare tag', '<ld-cite>'],
        ['bare legacy tag', '<ld-mem-cite>'],
        ['legacy invalid slug', '<ld-mem-cite id="Bad_Slug" />'],
    ])('counts %s as malformed without citing it', (_label, markup) => {
        expect(parseAgentCitations(markup)).toEqual({
            citations: [],
            malformedCount: 1,
        });
    });

    it('strips both tags from prose and code fences', () => {
        expect(
            stripAgentCitations(
                'Before <ld-cite source="memory" id="first"></ld-cite> and <ld-mem-cite id="legacy" /> ```html\n<ld-cite source="context" id="example" />\n``` after',
            ),
        ).toBe('Before  and  ```html\n\n``` after');
    });

    it('strips a stray closing tag', () => {
        expect(stripAgentCitations('text</ld-cite></ld-mem-cite>')).toBe(
            'text',
        );
    });
});

describe('planCitationTelemetry', () => {
    const { citations } = parseAgentCitations(
        '<ld-cite source="memory" id="remembered" /><ld-cite source="context" id="defined-3fa9c2d1" />',
    );

    it('counts both tiers when memory is enabled', () => {
        expect(
            planCitationTelemetry({ citations, memoryEnabled: true }),
        ).toEqual({
            memorySlugs: ['remembered'],
            contextSlugs: ['defined-3fa9c2d1'],
        });
    });

    it('still counts project context when the memory setting is off', () => {
        expect(
            planCitationTelemetry({ citations, memoryEnabled: false }),
        ).toEqual({
            memorySlugs: [],
            contextSlugs: ['defined-3fa9c2d1'],
        });
    });
});
