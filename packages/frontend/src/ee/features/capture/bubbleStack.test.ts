import { describe, expect, it } from 'vitest';
import { bringToFront, stackOrder } from './bubbleStack';

describe('stackOrder', () => {
    it('a newly opened bubble starts on top', () => {
        expect(stackOrder(['b', 'a'], ['a', 'b', 'c'])).toEqual([
            'b',
            'a',
            'c',
        ]);
    });

    it('forgets bubbles that are gone', () => {
        expect(stackOrder(['b', 'a', 'c'], ['a', 'c'])).toEqual(['a', 'c']);
    });
});

describe('bringToFront', () => {
    it('the bubble last used is on top, the rest keep their order', () => {
        expect(bringToFront(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a']);
    });

    it('raising a bubble opened before one never touched puts it above that one', () => {
        const order = stackOrder([], ['a', 'b']);
        expect(bringToFront(order, 'a')).toEqual(['b', 'a']);
    });

    it('changes nothing when the bubble is already on top', () => {
        const order = ['a', 'b'];
        expect(bringToFront(order, 'b')).toBe(order);
    });
});
