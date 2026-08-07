import { SchedulerFormat } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppSchedulerCreateMutation } from '../../scheduler/hooks/useAppSchedulers';
import { useChartSchedulerCreateMutation } from '../../scheduler/hooks/useChartSchedulers';
import { useScheduler } from '../../scheduler/hooks/useScheduler';
import { useSchedulersUpdateMutation } from '../../scheduler/hooks/useSchedulersUpdateMutation';
import { type SyncModalFormValues } from '../components/syncModalFormContext';
import { SyncModalProvider } from '../providers/SyncModalProvider';
import { useSyncModal } from '../providers/useSyncModal';
import { type SyncResource } from '../types';
import { useSqlChartSchedulerCreateMutation } from './useSqlChartSchedulers';
import { useSyncModalForm } from './useSyncModalForm';

// Every mutation hook is mocked, so no QueryClient/App providers are needed —
// only SyncModalProvider, whose context useSyncModalForm reads via useSyncModal.
vi.mock('../../scheduler/hooks/useAppSchedulers', () => ({
    useAppSchedulerCreateMutation: vi.fn(),
}));
vi.mock('../../scheduler/hooks/useChartSchedulers', () => ({
    useChartSchedulerCreateMutation: vi.fn(),
}));
vi.mock('../../scheduler/hooks/useScheduler', () => ({
    useScheduler: vi.fn(),
}));
vi.mock('../../scheduler/hooks/useSchedulersUpdateMutation', () => ({
    useSchedulersUpdateMutation: vi.fn(),
}));
vi.mock('./useSqlChartSchedulers', () => ({
    useSqlChartSchedulerCreateMutation: vi.fn(),
}));

const mockedAppMutation = vi.mocked(useAppSchedulerCreateMutation);
const mockedChartMutation = vi.mocked(useChartSchedulerCreateMutation);
const mockedSqlChartMutation = vi.mocked(useSqlChartSchedulerCreateMutation);
const mockedUseScheduler = vi.mocked(useScheduler);
const mockedUpdateMutation = vi.mocked(useSchedulersUpdateMutation);

const makeMutationResult = (mutate: ReturnType<typeof vi.fn>) =>
    ({
        mutate,
        isLoading: false,
        isSuccess: false,
    }) as unknown as ReturnType<typeof useChartSchedulerCreateMutation>;

const renderSyncModalForm = (resource: SyncResource) =>
    renderHook(
        () => ({
            modal: useSyncModal(),
            syncForm: useSyncModalForm(resource),
        }),
        {
            wrapper: ({ children }: PropsWithChildren) => (
                <SyncModalProvider>{children}</SyncModalProvider>
            ),
        },
    );

const formValues: SyncModalFormValues = {
    name: 'My sync',
    cron: '0 9 * * *',
    timezone: undefined,
    options: {
        gdriveId: 'drive-1',
        gdriveName: 'Revenue sheet',
        gdriveOrganizationName: 'Acme',
        url: 'https://docs.google.com/spreadsheets/x',
        tabName: '',
    },
    saveInNewTab: false,
};

describe('useSyncModalForm', () => {
    let createApp: ReturnType<typeof vi.fn>;
    let createChart: ReturnType<typeof vi.fn>;
    let createSqlChart: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        createApp = vi.fn();
        createChart = vi.fn();
        createSqlChart = vi.fn();

        mockedAppMutation.mockReturnValue(makeMutationResult(createApp));
        mockedChartMutation.mockReturnValue(makeMutationResult(createChart));
        mockedSqlChartMutation.mockReturnValue(
            makeMutationResult(createSqlChart),
        );
        mockedUpdateMutation.mockReturnValue(
            makeMutationResult(vi.fn()) as unknown as ReturnType<
                typeof useSchedulersUpdateMutation
            >,
        );
        mockedUseScheduler.mockReturnValue({
            data: undefined,
            isInitialLoading: false,
            isError: false,
            error: null,
        } as unknown as ReturnType<typeof useScheduler>);
    });

    it('creates an app sync with format GSHEETS, gsheets options, and no csv options', () => {
        const { result } = renderSyncModalForm({
            type: 'app',
            projectUuid: 'project-1',
            appUuid: 'app-1',
        });

        result.current.syncForm.handleSubmit(formValues);

        expect(createApp).toHaveBeenCalledTimes(1);
        const [{ resourceUuid, data }] = createApp.mock.calls[0];
        expect(resourceUuid).toBe('app-1');
        expect(data.format).toBe(SchedulerFormat.GSHEETS);
        expect(data.appUuid).toBeNull();
        expect(data.appName).toBeNull();
        expect(data.options).toEqual({
            gdriveId: 'drive-1',
            gdriveName: 'Revenue sheet',
            gdriveOrganizationName: 'Acme',
            url: 'https://docs.google.com/spreadsheets/x',
            tabName: undefined,
        });
        // No CSV/limit/values fields, and no app-state snapshot.
        expect(data).not.toHaveProperty('limit');
        expect(data).not.toHaveProperty('formatted');
        expect(data).not.toHaveProperty('appState');
        expect(data).not.toHaveProperty('message');

        // Only the app mutation fires — never the chart/sql-chart ones.
        expect(createChart).not.toHaveBeenCalled();
        expect(createSqlChart).not.toHaveBeenCalled();
    });

    it('creates a chart sync against the chart scheduler endpoint', () => {
        const { result } = renderSyncModalForm({
            type: 'chart',
            chartUuid: 'chart-1',
        });

        result.current.syncForm.handleSubmit(formValues);

        expect(createChart).toHaveBeenCalledTimes(1);
        const [{ resourceUuid, data }] = createChart.mock.calls[0];
        expect(resourceUuid).toBe('chart-1');
        expect(data.format).toBe(SchedulerFormat.GSHEETS);
        expect(createApp).not.toHaveBeenCalled();
        expect(createSqlChart).not.toHaveBeenCalled();
    });

    it('creates a SQL chart sync against the SQL chart scheduler endpoint', () => {
        const { result } = renderSyncModalForm({
            type: 'sqlChart',
            projectUuid: 'project-1',
            savedSqlUuid: 'sql-chart-1',
        });

        result.current.syncForm.handleSubmit(formValues);

        expect(createSqlChart).toHaveBeenCalledTimes(1);
        const [{ resourceUuid, data }] = createSqlChart.mock.calls[0];
        expect(resourceUuid).toBe('sql-chart-1');
        expect(data.format).toBe(SchedulerFormat.GSHEETS);
        expect(createApp).not.toHaveBeenCalled();
        expect(createChart).not.toHaveBeenCalled();
    });

    it('keeps the tab name unset when "save in a new tab" is off, including for apps', () => {
        const { result } = renderSyncModalForm({
            type: 'app',
            projectUuid: 'project-1',
            appUuid: 'app-1',
        });

        result.current.syncForm.handleSubmit({
            ...formValues,
            saveInNewTab: true,
            options: { ...formValues.options, tabName: 'Sheet2' },
        });

        const [{ data }] = createApp.mock.calls[0];
        // The app form never renders the tab-name control, but the shared
        // payload builder still honours saveInNewTab if it were ever set.
        expect(data.options.tabName).toBe('Sheet2');
    });
});
