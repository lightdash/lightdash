import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useAiAgentAdminFilters } from './useAiAgentAdminFilters';

const USER_UUID = '55de7cc5-4d4b-4d09-a441-85eca10ba60a';

const createWrapper = (search = '') =>
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <MemoryRouter
                initialEntries={[`/generalSettings/ai/threads${search}`]}
            >
                {children}
            </MemoryRouter>
        );
    };

describe('useAiAgentAdminFilters', () => {
    it('loads user filters from the URL and includes them in API filters', () => {
        const { result } = renderHook(() => useAiAgentAdminFilters(), {
            wrapper: createWrapper(`?users=${USER_UUID}`),
        });

        expect(result.current.selectedUserUuids).toEqual([USER_UUID]);
        expect(result.current.apiFilters.userUuids).toEqual([USER_UUID]);
        expect(result.current.hasActiveFilters).toBe(true);
    });

    it('updates the selected users and API filters', async () => {
        const { result } = renderHook(() => useAiAgentAdminFilters(), {
            wrapper: createWrapper(),
        });

        act(() => result.current.setSelectedUserUuids([USER_UUID]));

        await waitFor(() => {
            expect(result.current.selectedUserUuids).toEqual([USER_UUID]);
            expect(result.current.apiFilters.userUuids).toEqual([USER_UUID]);
        });
    });
});
