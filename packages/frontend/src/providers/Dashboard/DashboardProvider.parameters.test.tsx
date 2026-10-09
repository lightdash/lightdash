import { act, cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardProvider from './DashboardProvider';
import useDashboardContext from './useDashboardContext';

const mocks = vi.hoisted(() => ({
    embedMode: undefined as string | undefined,
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ mode: mocks.embedMode, dispatchEmbedEvent: vi.fn() }),
}));
vi.mock('../../hooks/dashboard/useDashboard', () => ({
    useDashboardQuery: () => ({ data: undefined }),
    useDashboardVersionRefresh: () => ({ mutateAsync: vi.fn() }),
    useDashboardsAvailableFilters: () => ({ data: undefined }),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastWarning: vi.fn(), showToastInfo: vi.fn() }),
}));
vi.mock('../../features/comments', () => ({
    useGetComments: () => ({ data: undefined }),
}));
vi.mock('../../features/parameters', () => ({
    useParameters: () => ({ data: undefined }),
}));
vi.mock('./DashboardTileStatusProvider', () => ({
    default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./useDashboardTileStatusContext', () => ({
    default: (selector: (context: Record<string, unknown>) => unknown) =>
        selector({
            areAllChartsLoaded: false,
            availableCustomGranularities: {},
        }),
}));

const savedParameters = {
    status: { parameterName: 'status', value: 'Shipped' },
};

const renderParameters = (path = '/dashboard/dashboard-uuid') =>
    renderHook(
        () => ({
            ...useDashboardContext((context) => context),
            search: useLocation().search,
        }),
        {
            wrapper: ({ children }: { children: ReactNode }) => (
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route
                            path="/dashboard/:dashboardUuid/:mode?"
                            element={
                                <DashboardProvider>
                                    {children}
                                </DashboardProvider>
                            }
                        />
                    </Routes>
                </MemoryRouter>
            ),
        },
    );

afterEach(() => {
    cleanup();
    mocks.embedMode = undefined;
});

describe('dashboard effective parameter values', () => {
    it.each([undefined, 'direct'])(
        'resets viewer overrides to saved values in %s mode',
        (embedMode) => {
            mocks.embedMode = embedMode;
            const { result } = renderParameters();
            act(() => result.current.setSavedParameters(savedParameters));
            act(() => {
                result.current.setParameter('status', 'Cancelled');
                result.current.setParameter('region', 'EU');
            });
            act(() => result.current.clearAllParameters());
            expect(result.current.dashboardParameters).toEqual(savedParameters);
            expect(result.current.parameterValues).toEqual({
                status: 'Shipped',
            });
            expect(result.current.appliedParameterValues).toEqual({
                status: 'Shipped',
            });
            expect(
                new URLSearchParams(result.current.search).has('parameters'),
            ).toBe(false);
        },
    );

    it('clears staged values in edit mode while queries still use saved values', () => {
        const { result } = renderParameters('/dashboard/dashboard-uuid/edit');
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', 'Cancelled'));
        act(() => result.current.clearAllParameters());
        expect(result.current.dashboardParameters).toEqual({});
        expect(result.current.parameterValues).toEqual({});
        expect(result.current.appliedParameterValues).toEqual({
            status: 'Shipped',
        });
    });

    it('clears all runtime values when the dashboard has no saved parameters', () => {
        const { result } = renderParameters();
        act(() => result.current.setParameter('status', 'Cancelled'));
        act(() => result.current.clearAllParameters());
        expect(result.current.dashboardParameters).toEqual({});
        expect(result.current.appliedParameterValues).toEqual({});
    });

    it('does not count an empty URL value as supplying a required parameter', () => {
        const { result } = renderParameters(
            '/dashboard/dashboard-uuid?parameters=%7B%22status%22%3A%22%22%7D',
        );
        act(() => {
            result.current.addParameterDefinitions({
                status: { label: 'Status' },
            });
            result.current.addParameterReferences('tile', ['status']);
        });
        expect(result.current.parameterValues).toEqual({});
        expect(result.current.missingRequiredParameters).toEqual(['status']);
    });

    it('resolves an empty URL override using the saved dashboard value', () => {
        const { result } = renderParameters(
            '/dashboard/dashboard-uuid?parameters=%7B%22status%22%3A%22%22%7D',
        );
        act(() => {
            result.current.setSavedParameters(savedParameters);
            result.current.addParameterDefinitions({
                status: { label: 'Status' },
            });
            result.current.addParameterReferences('tile', ['status']);
        });
        expect(result.current.appliedParameterValues).toEqual({
            status: 'Shipped',
        });
        expect(result.current.missingRequiredParameters).toEqual([]);
    });
});
