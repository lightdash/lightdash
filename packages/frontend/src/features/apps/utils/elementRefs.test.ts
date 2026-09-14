import { describe, expect, it } from 'vitest';
import {
    elementRefChipLabel,
    parseElementRefLabel,
    refToWireString,
} from './elementRefs';

describe('parseElementRefLabel', () => {
    it('parses a full reference', () => {
        expect(
            parseElementRefLabel('[h1 "FORMULA 1" @src/App.jsx:14]'),
        ).toEqual({ tag: 'h1', text: 'FORMULA 1', loc: 'src/App.jsx:14' });
    });

    it('parses references without text or loc', () => {
        expect(parseElementRefLabel('[path @src/App.jsx:14]')).toEqual({
            tag: 'path',
            text: '',
            loc: 'src/App.jsx:14',
        });
        expect(parseElementRefLabel('[button "Send"]')).toEqual({
            tag: 'button',
            text: 'Send',
            loc: '',
        });
        expect(parseElementRefLabel('[div]')).toEqual({
            tag: 'div',
            text: '',
            loc: '',
        });
    });

    it('allows spaces in loc', () => {
        expect(
            parseElementRefLabel('[h2 "Spend" @My Component/App.tsx:42]'),
        ).toEqual({ tag: 'h2', text: 'Spend', loc: 'My Component/App.tsx:42' });
    });

    it('rejects unrecognized labels', () => {
        expect(parseElementRefLabel('h1 "no brackets"')).toBeNull();
        expect(parseElementRefLabel('[1bad-tag]')).toBeNull();
        expect(parseElementRefLabel('')).toBeNull();
    });
});

describe('refToWireString', () => {
    it('round-trips through parse', () => {
        const labels = [
            '[h1 "FORMULA 1" @src/App.jsx:14]',
            '[path @src/App.jsx:14]',
            '[button "Send"]',
            '[div]',
        ];
        for (const label of labels) {
            const ref = parseElementRefLabel(label);
            expect(ref).not.toBeNull();
            expect(refToWireString(ref!)).toBe(label);
        }
    });
});

describe('elementRefChipLabel', () => {
    it('shows tag and text', () => {
        expect(
            elementRefChipLabel({ tag: 'h1', text: 'FORMULA 1', loc: '' }),
        ).toBe('<h1> FORMULA 1');
        expect(elementRefChipLabel({ tag: 'path', text: '', loc: 'x' })).toBe(
            '<path>',
        );
    });
});
