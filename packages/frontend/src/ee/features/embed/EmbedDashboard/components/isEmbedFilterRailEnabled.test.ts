import { describe, expect, it } from 'vitest';
import { isEmbedFilterRailEnabled } from './isEmbedFilterRailEnabled';

describe('isEmbedFilterRailEnabled', () => {
    it('gives a viewer the rail under the flag', () => {
        expect(
            isEmbedFilterRailEnabled({
                isFlagEnabled: true,
                isEditorInEditMode: false,
            }),
        ).toBe(true);
    });

    it('keeps the shipped filters for an embed editor in edit mode', () => {
        expect(
            isEmbedFilterRailEnabled({
                isFlagEnabled: true,
                isEditorInEditMode: true,
            }),
        ).toBe(false);
    });

    it('never opens the rail with the flag off', () => {
        expect(
            isEmbedFilterRailEnabled({
                isFlagEnabled: false,
                isEditorInEditMode: false,
            }),
        ).toBe(false);
    });
});
