import { describe, expect, it, beforeEach } from 'vitest';
import { resolveLineageTarget, applyHighlight, clearHighlight } from './lineage';

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('resolveLineageTarget', () => {
    it('returns the queryUuid from the nearest stamped ancestor', () => {
        document.body.innerHTML =
            '<div data-ld-query="q-1"><span id="cell">$1.2M</span></div>';
        const cell = document.getElementById('cell');
        expect(resolveLineageTarget(cell)).toBe('q-1');
    });

    it('returns null when no stamped ancestor exists', () => {
        document.body.innerHTML = '<div><span id="cell">x</span></div>';
        expect(resolveLineageTarget(document.getElementById('cell'))).toBeNull();
    });

    it('returns null for a null element', () => {
        expect(resolveLineageTarget(null)).toBeNull();
    });
});

describe('applyHighlight / clearHighlight', () => {
    it('outlines all elements matching the queryUuid and clears them', () => {
        document.body.innerHTML =
            '<div data-ld-query="q-1" id="a"></div>' +
            '<div data-ld-query="q-1" id="b"></div>' +
            '<div data-ld-query="q-2" id="c"></div>';
        applyHighlight('q-1');
        expect(document.getElementById('a')!.style.outline).not.toBe('');
        expect(document.getElementById('b')!.style.outline).not.toBe('');
        expect(document.getElementById('c')!.style.outline).toBe('');
        clearHighlight();
        expect(document.getElementById('a')!.style.outline).toBe('');
    });

    it('clearing happens automatically when applying a new/null target', () => {
        document.body.innerHTML = '<div data-ld-query="q-1" id="a"></div>';
        applyHighlight('q-1');
        applyHighlight(null);
        expect(document.getElementById('a')!.style.outline).toBe('');
    });
});
