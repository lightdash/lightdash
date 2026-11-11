import { describe, expect, it } from 'vitest';
import { isEditSwitchCollapse } from './filtersCollapse';

describe('isEditSwitchCollapse', () => {
    it.each([
        // View mode: local state, whatever the flags
        [false, true, true, false],
        [false, false, false, false],
        // Editing with the controls off: the edit switch, as main
        [true, false, false, true],
        // Controls on with the floating edit bar: its switch
        [true, true, true, true],
        // Controls on, no edit bar: the strip's toggle (local state)
        [true, false, true, false],
    ])(
        'edit %s, ergonomics %s, controls %s: switch %s',
        (
            isEditMode,
            isEditErgonomicsEnabled,
            isDashboardControlsEnabled,
            expected,
        ) => {
            expect(
                isEditSwitchCollapse({
                    isEditMode,
                    isEditErgonomicsEnabled,
                    isDashboardControlsEnabled,
                }),
            ).toBe(expected);
        },
    );
});
