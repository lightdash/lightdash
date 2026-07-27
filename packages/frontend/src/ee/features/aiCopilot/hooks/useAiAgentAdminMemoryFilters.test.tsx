import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useAiAgentAdminMemoryFilters } from './useAiAgentAdminMemoryFilters';

const USER_UUID = '55de7cc5-4d4b-4d09-a441-85eca10ba60a';
const PROJECT_UUID = '3675b69e-8324-4110-bdca-059031aa8da3';

const createWrapper = (search = '') =>
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <MemoryRouter
                initialEntries={[`/generalSettings/ai/memories${search}`]}
            >
                {children}
            </MemoryRouter>
        );
    };

describe('useAiAgentAdminMemoryFilters', () => {
    it('loads project and user filters from the URL', () => {
        const { result } = renderHook(() => useAiAgentAdminMemoryFilters(), {
            wrapper: createWrapper(
                `?projects=${PROJECT_UUID}&users=${USER_UUID}`,
            ),
        });

        expect(result.current.selectedProjectUuids).toEqual([PROJECT_UUID]);
        expect(result.current.selectedUserUuids).toEqual([USER_UUID]);
        expect(result.current.apiFilters).toEqual({
            projectUuids: [PROJECT_UUID],
            userUuids: [USER_UUID],
            statuses: ['active'],
        });
        expect(result.current.hasActiveFilters).toBe(true);
    });

    it('defaults to newest-first, active memories only', () => {
        const { result } = renderHook(() => useAiAgentAdminMemoryFilters(), {
            wrapper: createWrapper(),
        });

        expect(result.current.sortField).toBe('generatedAt');
        expect(result.current.sortDirection).toBe('desc');
        expect(result.current.selectedStatuses).toEqual(['active']);
        expect(result.current.apiFilters).toEqual({ statuses: ['active'] });
        expect(result.current.hasActiveFilters).toBe(false);
    });

    it('treats the "all" status token as no status filter', () => {
        const { result } = renderHook(() => useAiAgentAdminMemoryFilters(), {
            wrapper: createWrapper('?statuses=all'),
        });

        expect(result.current.selectedStatuses).toEqual([]);
        expect(result.current.apiFilters.statuses).toBeUndefined();
        expect(result.current.hasActiveFilters).toBe(true);
    });

    it('round-trips a cleared status filter through the URL', async () => {
        const { result } = renderHook(() => useAiAgentAdminMemoryFilters(), {
            wrapper: createWrapper(),
        });

        act(() => result.current.setSelectedStatuses([]));

        await waitFor(() => {
            expect(result.current.selectedStatuses).toEqual([]);
            expect(result.current.apiFilters.statuses).toBeUndefined();
        });
    });

    it('drops unknown statuses from the URL', () => {
        const { result } = renderHook(() => useAiAgentAdminMemoryFilters(), {
            wrapper: createWrapper('?statuses=active,bogus'),
        });

        expect(result.current.selectedStatuses).toEqual(['active']);
        expect(result.current.apiFilters.statuses).toEqual(['active']);
    });

    it('persists sorting and resets every filter', async () => {
        const { result } = renderHook(() => useAiAgentAdminMemoryFilters(), {
            wrapper: createWrapper(`?projects=${PROJECT_UUID}`),
        });

        act(() => result.current.setSorting('citedCount', 'asc'));

        await waitFor(() => {
            expect(result.current.sortField).toBe('citedCount');
            expect(result.current.sortDirection).toBe('asc');
            expect(result.current.selectedProjectUuids).toEqual([PROJECT_UUID]);
        });

        act(() => result.current.resetFilters());

        await waitFor(() => {
            expect(result.current.hasActiveFilters).toBe(false);
            expect(result.current.selectedProjectUuids).toEqual([]);
            expect(result.current.selectedStatuses).toEqual(['active']);
            expect(result.current.sortField).toBe('generatedAt');
        });
    });
});
