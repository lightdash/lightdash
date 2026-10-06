import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SESSION_SETTINGS,
    getFilterSessionSettings,
    isHiddenOnTab,
    isPickDefault,
    patchFilterSessionSettings,
    toggleAllowedOperator,
    toggleHiddenOnTab,
} from './sessionSettings';

describe('sessionSettings', () => {
    it('returns the defaults for an unknown filter', () => {
        expect(getFilterSessionSettings({}, 'a')).toEqual(
            DEFAULT_SESSION_SETTINGS,
        );
    });

    it('patches one filter without touching the others', () => {
        const first = patchFilterSessionSettings({}, 'a', {
            placement: 'more',
        });
        const second = patchFilterSessionSettings(first, 'b', {
            hasBoundaries: true,
        });
        expect(second.a.placement).toBe('more');
        expect(second.a.hasBoundaries).toBe(false);
        expect(second.b.hasBoundaries).toBe(true);
        expect(first.b).toBeUndefined();
    });

    it('toggles hidden per tab', () => {
        const hidden = {
            ...DEFAULT_SESSION_SETTINGS,
            ...toggleHiddenOnTab(DEFAULT_SESSION_SETTINGS, 't1'),
        };
        expect(isHiddenOnTab(hidden, 't1')).toBe(true);
        expect(isHiddenOnTab(hidden, 't2')).toBe(false);
        expect(toggleHiddenOnTab(hidden, 't1').hiddenTabUuids).toEqual([]);
    });

    it('keeps a single operator in "one" mode and toggles in "some" mode', () => {
        const one = {
            ...DEFAULT_SESSION_SETTINGS,
            operators: 'one' as const,
            allowedOperators: ['equals'],
        };
        expect(toggleAllowedOperator(one, 'include').allowedOperators).toEqual([
            'include',
        ]);
        const some = { ...one, operators: 'some' as const };
        expect(toggleAllowedOperator(some, 'include').allowedOperators).toEqual(
            ['equals', 'include'],
        );
        expect(toggleAllowedOperator(some, 'equals').allowedOperators).toEqual(
            [],
        );
    });

    it('reports whether the picker answers are the defaults', () => {
        expect(isPickDefault(DEFAULT_SESSION_SETTINGS)).toBe(true);
        expect(
            isPickDefault({ ...DEFAULT_SESSION_SETTINGS, picker: 'list' }),
        ).toBe(false);
    });
});
