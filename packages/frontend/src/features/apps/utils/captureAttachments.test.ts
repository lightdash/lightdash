import { describe, expect, it } from 'vitest';
import { imagesThatFit, summaryToContent } from './captureAttachments';

const f = (name: string) => new File([], name);

describe('imagesThatFit', () => {
    it('takes everything when there is room', () => {
        const r = imagesThatFit([f('a'), f('b')], 3, 10);
        expect(r.fit.map((x) => x.name)).toEqual(['a', 'b']);
        expect(r.dropped).toBe(0);
    });

    it('keeps the earliest images and reports the rest', () => {
        const r = imagesThatFit([f('a'), f('b'), f('c')], 8, 10);
        expect(r.fit.map((x) => x.name)).toEqual(['a', 'b']);
        expect(r.dropped).toBe(1);
    });

    it('takes nothing when full', () => {
        expect(imagesThatFit([f('a')], 10, 10)).toEqual({
            fit: [],
            dropped: 1,
        });
    });

    it('takes nothing when already over the limit', () => {
        expect(imagesThatFit([f('a')], 12, 10)).toEqual({
            fit: [],
            dropped: 1,
        });
    });
});

describe('summaryToContent', () => {
    it('makes one paragraph per line', () => {
        expect(summaryToContent('one\ntwo')).toEqual([
            { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
        ]);
    });

    it('keeps a blank line as an empty paragraph', () => {
        expect(summaryToContent('one\n\ntwo')).toHaveLength(3);
        expect(summaryToContent('one\n\ntwo')[1]).toEqual({
            type: 'paragraph',
        });
    });
});
