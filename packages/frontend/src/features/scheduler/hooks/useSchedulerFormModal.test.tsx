import {
    FilterOperator,
    type Dashboard,
    type DashboardFilterRule,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type UseSchedulerFormModalProps } from './useSchedulerFormModal';
import { useSchedulerFormModal } from './useSchedulerFormModal';

const mocks = vi.hoisted(() => ({
    sendNow: vi.fn(),
    track: vi.fn(),
    resetCreate: vi.fn(),
}));

const tab1Filter: DashboardFilterRule = {
    id: 'tab1',
    target: { fieldId: 'orders_tab1', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    required: true,
    label: undefined,
    tileTargets: {
        'tile-1': { fieldId: 'orders_tab1', tableName: 'orders' },
        'tile-2': false,
    },
};

const dashboard = {
    projectUuid: 'project-uuid',
    tabs: [{ uuid: 'tab-1' }, { uuid: 'tab-2' }],
    tiles: [
        { uuid: 'tile-1', tabUuid: 'tab-1' },
        { uuid: 'tile-2', tabUuid: 'tab-2' },
    ],
    filters: {
        dimensions: [tab1Filter],
        metrics: [],
        tableCalculations: [],
    },
} as unknown as Dashboard;

vi.mock(
    '../../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility',
    () => ({ useAiAgentButtonVisibility: vi.fn(() => false) }),
);

vi.mock('../../../hooks/dashboard/useDashboard', () => ({
    useDashboardQuery: vi.fn(() => ({ data: dashboard })),
}));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: vi.fn(() => ({ showToastApiError: vi.fn() })),
}));

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: vi.fn(() => 'project-uuid'),
}));

vi.mock('../../../hooks/user/useUser', () => ({
    default: vi.fn(() => ({ data: { userUuid: 'user-uuid' } })),
}));

vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: vi.fn(() => ({ track: mocks.track })),
}));

vi.mock('./useScheduler', () => ({
    useScheduler: vi.fn(() => ({
        data: undefined,
        error: null,
        isInitialLoading: false,
    })),
    useSendNowScheduler: vi.fn(() => ({
        mutate: mocks.sendNow,
        isLoading: false,
    })),
}));

vi.mock('./useSchedulerAiAugmentation', () => ({
    useSchedulerAiAugmentation: vi.fn(() => ({ data: undefined })),
    useSchedulerAiAugmentationDeleteMutation: vi.fn(() => ({
        mutateAsync: vi.fn(),
    })),
    useSchedulerAiAugmentationUpsertMutation: vi.fn(() => ({
        mutateAsync: vi.fn(),
    })),
}));

vi.mock('./useSchedulersUpdateMutation', () => ({
    useSchedulersUpdateMutation: vi.fn(() => ({
        isSuccess: false,
        isLoading: false,
        reset: vi.fn(),
        mutateAsync: vi.fn(),
    })),
}));

describe('useSchedulerFormModal tab-scoped requirements', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses the current tab selection for the submit and Send Now gates', () => {
        const createMutation = {
            isSuccess: false,
            isLoading: false,
            reset: mocks.resetCreate,
            mutateAsync: vi.fn(),
        } as unknown as UseSchedulerFormModalProps['createMutation'];

        const { result } = renderHook(() =>
            useSchedulerFormModal({
                schedulerUuid: undefined,
                resourceUuid: 'dashboard-uuid',
                createMutation,
                onBack: vi.fn(),
                initialFormValues: {
                    name: 'Delivery',
                    emailTargets: ['recipient@example.com'],
                    selectedTabs: ['tab-2'],
                },
                filterableFieldsByTileUuid: {},
            }),
        );

        expect(result.current.requiredFiltersWithoutValues).toEqual([]);

        act(() => result.current.handleSendNow());
        expect(mocks.sendNow).toHaveBeenCalledOnce();

        act(() => {
            result.current.form.setFieldValue('selectedTabs', [
                'tab-1',
                'tab-2',
            ]);
        });

        expect(
            result.current.requiredFiltersWithoutValues.map(
                (filter) => filter.id,
            ),
        ).toEqual(['tab1']);

        act(() => result.current.handleSendNow());
        expect(mocks.sendNow).toHaveBeenCalledOnce();
        expect(result.current.form.errors.dashboardFilters).toBe(
            'Required filters must have values',
        );
    });
});
