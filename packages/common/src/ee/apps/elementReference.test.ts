import { describe, expect, it } from 'vitest';
import {
    dataAppElementContextKey,
    elementReferenceToWireString,
} from './elementReference';

describe('elementReferenceToWireString', () => {
    it('serializes full, text-only, loc-only, and tag-only forms', () => {
        expect(
            elementReferenceToWireString({
                tag: 'h1',
                text: 'FORMULA 1',
                loc: 'src/App.jsx:14',
            }),
        ).toBe('[h1 "FORMULA 1" @src/App.jsx:14]');
        expect(
            elementReferenceToWireString({
                tag: 'button',
                text: 'Send',
                loc: '',
            }),
        ).toBe('[button "Send"]');
        expect(
            elementReferenceToWireString({
                tag: 'path',
                text: '',
                loc: 'src/App.jsx:14',
            }),
        ).toBe('[path @src/App.jsx:14]');
        expect(
            elementReferenceToWireString({ tag: 'div', text: '', loc: '' }),
        ).toBe('[div]');
    });
});

describe('dataAppElementContextKey', () => {
    it('scopes the wire string to app and version', () => {
        expect(
            dataAppElementContextKey({
                appUuid: 'app-1',
                version: 3,
                tag: 'h1',
                text: 'FORMULA 1',
                loc: 'src/App.jsx:14',
            }),
        ).toBe('data_app_element:app-1:3:[h1 "FORMULA 1" @src/App.jsx:14]');
    });
});
