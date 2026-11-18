import { act, cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import {
    dashboardParametersActions,
    useDashboardDispatch,
} from '../../features/dashboard/store';
import DashboardProvider from './DashboardProvider';
import useDashboardContext from './useDashboardContext';

const mocks = vi.hoisted(() => ({
    dispatchEmbedEvent: vi.fn(),
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({
        mode: undefined,
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
