import { act, renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    FilterBarPopoversContext,
    type FilterBarPopoversState,
} from './FilterBarPopoversContext';
import { useFilterPopoverState } from './useFilterPopoverState';

describe('useFilterPopoverState', () => {
    it('falls back to local open state without a provider', () => {
        const { result } = renderHook(() => useFilterPopoverState());

        expect(result.current.openPopoverId).toBeUndefined();

        act(() => {
            result.current.onPopoverOpen('chip-1');
        });
        expect(result.current.openPopoverId).toBe('chip-1');

        act(() => {
            result.current.onPopoverClose();
        });
        expect(result.current.openPopoverId).toBeUndefined();
    });

    it('delegates to the shared filter bar state when a provider is mounted', () => {
        const openFilterPopover = vi.fn();
        const closeFilterPopover = vi.fn();
        const contextValue: FilterBarPopoversState = {
            isRulesPopoverOpen: false,
            openRulesPopover: vi.fn(),
            closeRulesPopover: vi.fn(),
            openFilterPopoverId: 'shared-chip',
            openFilterPopover,
            closeFilterPopover,
        };
        const wrapper: FC<PropsWithChildren> = ({ children }) => (
            <FilterBarPopoversContext.Provider value={contextValue}>
                {children}
            </FilterBarPopoversContext.Provider>
        );

        const { result } = renderHook(() => useFilterPopoverState(), {
            wrapper,
        });

        expect(result.current.openPopoverId).toBe('shared-chip');

        act(() => {
            result.current.onPopoverOpen('chip-1');
        });
        expect(openFilterPopover).toHaveBeenCalledWith('chip-1');

        act(() => {
            result.current.onPopoverClose();
        });
        expect(closeFilterPopover).toHaveBeenCalledTimes(1);
    });
});
