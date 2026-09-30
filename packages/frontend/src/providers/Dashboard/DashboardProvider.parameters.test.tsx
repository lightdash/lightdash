import { act, cleanup, renderHook } from '@testing-library/react';
import { type ComponentProps, type ReactNode } from 'react';
import {
    MemoryRouter,
    Route,
    Routes,
    useLocation,
    useNavigate,
} from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardProvider from './DashboardProvider';
import useDashboardContext from './useDashboardContext';

const mocks = vi.hoisted(() => ({
    embedMode: undefined as string | undefined,
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ mode: mocks.embedMode }),
}));
vi.mock('../../ee/features/embed/hooks/useEmbedEventEmitter', () => ({
    useEmbedEventEmitter: () => ({ dispatchEmbedEvent: vi.fn() }),
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

const renderParameters = (
    path = '/dashboard/dashboard-uuid',
    props: ComponentProps<typeof DashboardProvider> = {},
) =>
    renderHook(
        () => ({
            ...useDashboardContext((context) => context),
            search: useLocation().search,
            navigate: useNavigate(),
        }),
        {
            wrapper: ({ children }: { children: ReactNode }) => (
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route
                            path="/dashboard/:dashboardUuid/:mode?"
                            element={
                                <DashboardProvider {...props}>
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
    it('hydrates scheduler export clears without reintroducing saved selections', () => {
        const { result } = renderParameters('/dashboard/dashboard-uuid', {
            schedulerParameters: { status: 'Shipped' },
            schedulerClearedParameters: ['status'],
        });
        expect(result.current.parameterValues).toEqual({});
        expect(result.current.appliedParameterValues).toEqual({});
        expect(result.current.clearedParameters).toEqual(['status']);
    });
    it('ignores viewer URL clears when loading the author edit configuration', () => {
        const { result } = renderParameters(
            '/dashboard/dashboard-uuid/edit?clearedParameters=%5B%22status%22%5D',
        );
        act(() => result.current.setSavedParameters(savedParameters));
        expect(result.current.parameterValues).toEqual({ status: 'Shipped' });
        expect(result.current.clearedParameters).toEqual([]);
    });
    it('seeds edit mode from saved author values after a viewer clear', () => {
        const { result } = renderParameters();
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', null));
        act(
            () =>
                void result.current.navigate('/dashboard/dashboard-uuid/edit'),
        );
        expect(result.current.parameterValues).toEqual({ status: 'Shipped' });
        expect(result.current.clearedParameters).toEqual([]);
    });
    it('restores saved values when an editor cancels a live clear', () => {
        const { result } = renderParameters('/dashboard/dashboard-uuid/edit');
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', null));
        act(() => void result.current.navigate('/dashboard/dashboard-uuid'));
        expect(result.current.parameterValues).toEqual({ status: 'Shipped' });
        expect(result.current.clearedParameters).toEqual([]);
    });
    it('keeps a saved removal after leaving edit without stale clear markers', () => {
        const { result } = renderParameters('/dashboard/dashboard-uuid/edit');
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', null));
        act(() => result.current.setSavedParameters({}));
        act(() => void result.current.navigate('/dashboard/dashboard-uuid'));
        expect(result.current.parameterValues).toEqual({});
        expect(result.current.clearedParameters).toEqual([]);
    });
    it.each([undefined, 'direct', 'sdk'])(
        'clears viewer values including saved overrides in %s mode',
        (embedMode) => {
            mocks.embedMode = embedMode;
            const { result } = renderParameters();
            act(() => result.current.setSavedParameters(savedParameters));
            act(() => {
                result.current.setParameter('status', 'Cancelled');
                result.current.setParameter('region', 'EU');
            });
            act(() => result.current.clearAllParameters());
            expect(result.current.dashboardParameters).toEqual({});
            expect(result.current.parameterValues).toEqual({});
            expect(result.current.appliedParameterValues).toEqual({});
            expect(result.current.clearedParameters).toContain('status');
            const urlClears = new URLSearchParams(result.current.search).get(
                'clearedParameters',
            );
            if (embedMode === 'sdk') {
                expect(urlClears).toBeNull();
            } else {
                expect(JSON.parse(urlClears!)).toEqual(
                    expect.arrayContaining(['status', 'region']),
                );
            }
            expect(
                new URLSearchParams(result.current.search).has('parameters'),
            ).toBe(false);
        },
    );

    it('clears staged values and previews fallback immediately in edit mode', () => {
        const { result } = renderParameters('/dashboard/dashboard-uuid/edit');
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', 'Cancelled'));
        act(() => result.current.clearAllParameters());
        expect(result.current.dashboardParameters).toEqual({});
        expect(result.current.parameterValues).toEqual({});
        expect(result.current.appliedParameterValues).toEqual({});
        expect(result.current.clearedParameters).toContain('status');
    });

    it('clears a saved value with X and removes suppression when a value is selected', () => {
        const { result } = renderParameters();
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', null));
        expect(result.current.parameterValues).toEqual({});
        expect(result.current.appliedParameterValues).toEqual({});
        expect(result.current.clearedParameters).toEqual(['status']);
        act(() => result.current.setParameter('status', 'Cancelled'));
        expect(result.current.appliedParameterValues).toEqual({
            status: 'Cancelled',
        });
        expect(result.current.clearedParameters).toEqual([]);
    });

    it('hydrates shared clears and preserves unrelated URL values', () => {
        const { result } = renderParameters(
            '/dashboard/dashboard-uuid?clearedParameters=%5B%22status%22%5D&foo=bar',
        );
        act(() => result.current.setSavedParameters(savedParameters));
        expect(result.current.parameterValues).toEqual({});
        expect(result.current.appliedParameterValues).toEqual({});
        expect(result.current.clearedParameters).toEqual(['status']);
        expect(new URLSearchParams(result.current.search).get('foo')).toBe(
            'bar',
        );
    });

    it('clears all runtime values when the dashboard has no saved parameters', () => {
        const { result } = renderParameters();
        act(() => result.current.setParameter('status', 'Cancelled'));
        act(() => result.current.clearAllParameters());
        expect(result.current.dashboardParameters).toEqual({});
        expect(result.current.appliedParameterValues).toEqual({});
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
