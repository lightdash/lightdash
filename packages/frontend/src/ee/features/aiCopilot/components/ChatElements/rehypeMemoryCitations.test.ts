import { type Element, type Root } from 'hast';
import { describe, expect, it } from 'vitest';
import { rehypeCitationIndices } from './rehypeMemoryCitations';

const cite = (id: string, source?: string): Element => ({
    type: 'element',
    tagName: 'ld-mem-cite',
    properties: { id, ...(source !== undefined ? { source } : {}) },
    children: [],
});

const root = (...children: Element[]): Root => ({ type: 'root', children });

const indexOf = (node: Element) => node.properties['data-citation-index'];

describe('rehypeCitationIndices', () => {
    it('numbers memory markers sequentially and dedupes by slug', () => {
        const a = cite('first-memory');
        const b = cite('second-memory', 'memory');
        const aAgain = cite('first-memory');
        rehypeCitationIndices()(root(a, b, aAgain));

        expect(indexOf(a)).toBe(1);
        expect(indexOf(b)).toBe(2);
        expect(indexOf(aAgain)).toBe(1);
    });

    it('numbers memory and context markers in one unified sequence', () => {
        const memory = cite('a-memory');
        const context = cite('an-entry-abcd1234', 'context');
        const memory2 = cite('b-memory', 'memory');
        rehypeCitationIndices()(root(memory, context, memory2));

        expect(indexOf(memory)).toBe(1);
        expect(indexOf(context)).toBe(2);
        expect(indexOf(memory2)).toBe(3);
    });

    it('keys by (source, slug) so the same slug in each tier gets its own number', () => {
        const memory = cite('shared-slug', 'memory');
        const context = cite('shared-slug', 'context');
        rehypeCitationIndices()(root(memory, context));

        expect(indexOf(memory)).toBe(1);
        expect(indexOf(context)).toBe(2);
    });

    it('skips unknown-source markers without consuming a number', () => {
        const malformed = cite('a-slug', 'unknown');
        const context = cite('b-slug', 'context');
        rehypeCitationIndices()(root(malformed, context));

        expect(indexOf(malformed)).toBeUndefined();
        expect(indexOf(context)).toBe(1);
    });

    it('normalizes the sanitizer id prefix when deduping', () => {
        const raw = cite('some-slug');
        const prefixed = cite('user-content-some-slug');
        rehypeCitationIndices()(root(raw, prefixed));

        expect(indexOf(raw)).toBe(1);
        expect(indexOf(prefixed)).toBe(1);
    });

    it('skips nodes without an id', () => {
        const node: Element = {
            type: 'element',
            tagName: 'ld-mem-cite',
            properties: {},
            children: [],
        };
        rehypeCitationIndices()(root(node));

        expect(indexOf(node)).toBeUndefined();
    });

    it('ignores unrelated elements', () => {
        const node: Element = {
            type: 'element',
            tagName: 'span',
            properties: { id: 'some-slug' },
            children: [],
        };
        rehypeCitationIndices()(root(node));

        expect(indexOf(node)).toBeUndefined();
    });
});
