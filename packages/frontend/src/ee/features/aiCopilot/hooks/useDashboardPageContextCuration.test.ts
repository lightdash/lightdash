import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LauncherCurrentDashboard } from '../store/aiAgentLauncherSlice';
import { useAiAgentStoreSelector } from '../store/hooks';
import { useDashboardPageContextCuration } from './useDashboardPageContextCuration';

vi.mock('../store/hooks', () => ({
    useAiAgentStoreSelector: vi.fn(),
}));

const runtimeOverrides = {
    activeTab: { uuid: 'tab-1', name: 'Overview' },
    dashboardFilters: {
        dimensions: [],
        metrics: [],
        tableCalculations: [],
    },
    dashboardParameters: { region: 'EU' },
    dateZoom: { granularity: 'Week' },
};

const currentDashboard: LauncherCurrentDashboard = {
    projectUuid: 'project-1',
    uuid: 'dashboard-a',
    name: 'Orders',
    activeTabUuid: 'tab-1',
    runtimeOverrides,
};

describe('useDashboardPageContextCuration', () => {
    beforeEach(() => {
        vi.mocked(useAiAgentStoreSelector).mockReturnValue(currentDashboard);
    });

    it('enriches an explicit mention of the open dashboard', () => {
        const explicitContext = [
            { type: 'dashboard' as const, dashboardUuid: 'dashboard-a' },
        ];
        const { result } = renderHook(() =>
            useDashboardPageContextCuration({
                previousContext: [],
                projectUuid: 'project-1',
            }),
        );

        expect(
            result.current.curateContext({ context: explicitContext }),
        ).toMatchObject({
            context: [
                {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-a',
                    runtimeOverrides,
                },
            ],
        });
    });

    it('does not reattach unchanged context after submission', () => {
        const { result } = renderHook(() =>
            useDashboardPageContextCuration({
                previousContext: [],
                projectUuid: 'project-1',
                threadId: 'thread-1',
            }),
        );
        const curated = result.current.curateContext({});

        act(() => result.current.recordSubmittedContext(curated.context));

        expect(result.current.curateContext({})).toEqual({
            context: undefined,
            optimisticContext: undefined,
        });
    });

    it('reattaches the open dashboard after submitting another dashboard', () => {
        const { result } = renderHook(() =>
            useDashboardPageContextCuration({
                previousContext: [
                    {
                        type: 'dashboard',
                        dashboardUuid: 'dashboard-a',
                        runtimeOverrides,
                    },
                ],
                projectUuid: 'project-1',
                threadId: 'thread-1',
            }),
        );
        const otherDashboard = result.current.curateContext({
            context: [{ type: 'dashboard', dashboardUuid: 'dashboard-b' }],
        });

        act(() =>
            result.current.recordSubmittedContext(otherDashboard.context),
        );

        expect(result.current.curateContext({})).toMatchObject({
            context: [
                {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-a',
                    runtimeOverrides,
                },
            ],
        });
    });
});
