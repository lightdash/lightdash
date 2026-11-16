import { act, cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import {
    dashboardParametersActions,
    selectAppliedParameterValues,
    selectDashboardParameters,
    selectMissingRequiredParameters,
    selectParameterValues,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../features/dashboard/store';
import DashboardProvider from './DashboardProvider';
import useDashboardContext from './useDashboardContext';

const mocks = vi.hoisted(() => ({
    embedMode: undefined as string | undefined,
    dispatchEmbedEvent: vi.fn(),
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({
        mode: mocks.embedMode,
        dispatchEmbedEvent: mocks.dispatchEmbedEvent,
    }),
}));
vi.mock('../../hooks/dashboard/useDashboardTileParameterReferences', () => ({
    useDashboardTileParameterReferences: () => undefined,
}));
vi.mock('../../hooks/dashboard/useSyncParameterControls', () => ({
    useSyncParameterControls: () => undefined,
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
    isEditModeExternal = false,
) =>
    renderHook(
        () => ({
            ...useDashboardContext((context) => context),
            dispatch: useDashboardDispatch(),
            dashboardParameters: useDashboardSelector(
                selectDashboardParameters,
            ),
            parameterValues: useDashboardSelector(selectParameterValues),
            appliedParameterValues: useDashboardSelector(
                selectAppliedParameterValues,
            ),
            missingRequiredParameters: useDashboardSelector(
                selectMissingRequiredParameters,
            ),
            search: useLocation().search,
        }),
        {
            wrapper: ({ children }: { children: ReactNode }) => (
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route
                            path="/dashboard/:dashboardUuid/:mode?"
                            element={
                                <DashboardProvider
                                    isEditModeExternal={isEditModeExternal}
                                >
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
    mocks.dispatchEmbedEvent.mockClear();
});

describe('ParameterChanged embed event', () => {
    const parameterChangedCalls = () =>
        mocks.dispatchEmbedEvent.mock.calls.filter(
            ([type]) => type === LightdashEventType.ParameterChanged,
        );

    it('sends the values when the viewer changes a parameter, not on load', () => {
        const { result } = renderParameters();
        act(() => result.current.setSavedParameters(savedParameters));
        expect(parameterChangedCalls()).toEqual([]);

        act(() => result.current.setParameter('status', 'Cancelled'));
        expect(parameterChangedCalls()).toEqual([
            [
                LightdashEventType.ParameterChanged,
                { parameters: { status: 'Cancelled' } },
            ],
        ]);
    });

    it('sends the first change on a dashboard with no saved parameters', () => {
        const { result } = renderParameters();
        act(() => result.current.setSavedParameters({}));
        act(() => result.current.setParameter('status', 'Cancelled'));
        expect(parameterChangedCalls()).toEqual([
            [
                LightdashEventType.ParameterChanged,
                { parameters: { status: 'Cancelled' } },
            ],
        ]);
    });

    it('stays quiet in edit mode', () => {
        const { result } = renderParameters('/dashboard/dashboard-uuid/edit');
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', 'Cancelled'));
        expect(parameterChangedCalls()).toEqual([]);
    });

    it('stays quiet when an embed editor enters edit mode', () => {
        const { result } = renderParameters(undefined, true);
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', 'Cancelled'));
        mocks.dispatchEmbedEvent.mockClear();

        act(() => {
            result.current.dispatch(
                dashboardParametersActions.setIsEditMode(true),
            );
        });
        expect(parameterChangedCalls()).toEqual([]);
    });
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
