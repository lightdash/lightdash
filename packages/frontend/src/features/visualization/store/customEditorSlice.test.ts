import { describe, expect, it } from 'vitest';
import {
    buildCustomEditorState,
    customEditorActions,
    customEditorReducer,
} from './customEditorSlice';

describe('customEditorSlice specChanged', () => {
    const seeded = buildCustomEditorState({ spec: { mark: 'bar' } });

    it('never saves empty text', () => {
        expect(
            customEditorReducer(seeded, customEditorActions.specChanged('')),
        ).toBe(seeded);
    });

    it('keeps the last spec that parsed while the text is invalid', () => {
        const next = customEditorReducer(
            seeded,
            customEditorActions.specChanged('{"mark":'),
        );
        expect(next?.visSpec).toBe('{"mark":');
        expect(next?.visSpecObject).toEqual({ mark: 'bar' });
    });
});
