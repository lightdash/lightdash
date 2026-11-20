import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FilterBarPopoversProvider } from './FilterBarPopoversProvider';
import { useFilterBarPopovers } from './useFilterBarPopovers';

describe('FilterBarPopoversProvider', () => {
    it('exposes rules popover state through the context hook', () => {
        const { result } = renderHook(() => useFilterBarPopovers(), {
            wrapper: FilterBarPopoversProvider,
        });

        expect(result.current?.isRulesPopoverOpen).toBe(false);

        act(() => {
            result.current?.openRulesPopover();
        });
        expect(result.current?.isRulesPopoverOpen).toBe(true);

        act(() => {
            result.current?.closeRulesPopover();
        });
        expect(result.current?.isRulesPopoverOpen).toBe(false);
    });
});
