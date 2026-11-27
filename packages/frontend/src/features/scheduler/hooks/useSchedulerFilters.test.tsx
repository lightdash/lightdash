import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router';
import { expect, it } from 'vitest';
import { useSchedulerFilters } from './useSchedulerFilters';

it('combines needs attention with other filters and clears it from the URL and request', () => {
    const { result } = renderHook(
        () => ({
            filters: useSchedulerFilters(),
            params: useSearchParams()[0],
        }),
        {
            wrapper: ({ children }) => (
                <MemoryRouter
                    initialEntries={[
                        '/?needsAttention=true&nameSearch=weekly&tab=all',
                    ]}
                >
                    {children}
                </MemoryRouter>
            ),
        },
    );

    expect(result.current.filters.apiFilters).toEqual({
        search: 'weekly',
        needsAttention: true,
    });

    act(() => result.current.filters.setNeedsAttention(false));
    expect(result.current.params.has('needsAttention')).toBe(false);
    expect(result.current.filters.apiFilters).toEqual({ search: 'weekly' });

    act(() => result.current.filters.resetFilters());
    act(() => result.current.filters.setNeedsAttention(true));
    expect(result.current.params.get('needsAttention')).toBe('true');
    expect(result.current.filters.hasActiveFilters).toBe(true);

    act(() => result.current.filters.resetFilters());
    expect(result.current.params.toString()).toBe('tab=all');
    expect(result.current.filters.apiFilters).toEqual({});
    expect(result.current.filters.hasActiveFilters).toBe(false);
});
