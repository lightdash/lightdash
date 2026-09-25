import { type ProjectNavigation } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import { useProjectNavigation } from './useProjectNavigation';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));

const stored: ProjectNavigation = {
    metrics: true,
    askAi: true,
    autopilot: false,
    learn: false,
};
const fresh: ProjectNavigation = {
    metrics: false,
    askAi: false,
    autopilot: true,
    learn: true,
};

const renderNavigation = (userUuid = 'user-1', projectUuid = 'project-1') => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    return renderHook(() => useProjectNavigation({ projectUuid, userUuid }), {
        wrapper,
    });
};

describe('useProjectNavigation', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset().mockResolvedValue(fresh);
    });
    afterEach(() => localStorage.clear());

    it('renders the stored answer first, then the fresh one', async () => {
        localStorage.setItem(
            'projectNavigation:user-1:project-1',
            JSON.stringify(stored),
        );

        const { result } = renderNavigation();

        expect(result.current.data).toEqual(stored);
        expect(result.current.isInitialLoading).toBe(false);
        await waitFor(() => expect(result.current.data).toEqual(fresh));
    });

    it('stores the fresh answer for the next visit', async () => {
        const { result } = renderNavigation();

        await waitFor(() => expect(result.current.data).toEqual(fresh));
        expect(
            JSON.parse(
                localStorage.getItem('projectNavigation:user-1:project-1')!,
            ),
        ).toEqual(fresh);
    });

    it("ignores another user's stored answer", () => {
        localStorage.setItem(
            'projectNavigation:user-2:project-1',
            JSON.stringify(stored),
        );

        const { result } = renderNavigation();

        expect(result.current.data).toBeUndefined();
        expect(result.current.isInitialLoading).toBe(true);
    });

    it.each([
        ['invalid JSON', '{not json'],
        ['a wrong shape', JSON.stringify({ metrics: 'yes' })],
    ])('ignores a stored answer with %s', (_label, value) => {
        localStorage.setItem('projectNavigation:user-1:project-1', value);

        const { result } = renderNavigation();

        expect(result.current.data).toBeUndefined();
    });
});
