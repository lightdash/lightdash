import { describe, expect, it } from 'vitest';
import { isEmbedControlsEnabled } from './isEmbedControlsEnabled';

describe('isEmbedControlsEnabled', () => {
    it('gives a viewer the controls bar under the flag', () => {
        expect(
            isEmbedControlsEnabled({
                isFlagEnabled: true,
                isEditorInEditMode: false,
            }),
        ).toBe(true);
    });

    it('keeps the shipped filters for an embed editor in edit mode', () => {
        expect(
            isEmbedControlsEnabled({
                isFlagEnabled: true,
                isEditorInEditMode: true,
            }),
        ).toBe(false);
    });

    it('never opens the controls bar with the flag off', () => {
        expect(
            isEmbedControlsEnabled({
                isFlagEnabled: false,
                isEditorInEditMode: false,
            }),
        ).toBe(false);
    });
});
