import { Box } from '@mantine-8/core';
import { act, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { FilterBarPopoversProvider } from './FilterBarPopoversProvider';
import { useFilterBarPopovers } from './useFilterBarPopovers';

describe('FilterBarPopoversProvider', () => {
    it('renders its children', () => {
        renderWithProviders(
            <FilterBarPopoversProvider>
                <Box data-testid="child" />
            </FilterBarPopoversProvider>,
        );

        expect(screen.getByTestId('child')).not.toBeNull();
    });

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
