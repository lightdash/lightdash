import { SchedulerFormat, type AppScheduler } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useAppSchedulers } from '../../scheduler/hooks/useAppSchedulers';
import { AppSyncModal } from './AppSyncModal';

vi.mock('../../scheduler/hooks/useAppSchedulers', () => ({
    useAppSchedulers: vi.fn(),
    useAppSchedulerCreateMutation: vi.fn(() => ({
        mutate: vi.fn(),
        isLoading: false,
        isSuccess: false,
    })),
}));
vi.mock('../../../hooks/useActiveProject', () => ({
    useActiveProjectUuid: () => ({
        activeProjectUuid: 'project-1',
        isLoading: false,
    }),
}));
vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({
        data: { schedulerTimezone: 'UTC' },
    }),
}));

const mockedUseAppSchedulers = vi.mocked(useAppSchedulers);

const baseScheduler = {
    schedulerUuid: 'sched-1',
    slug: 'app-sync',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-uuid',
    createdByName: 'User',
    cron: '0 9 * * *',
    savedChartUuid: null,
    savedChartName: null,
    dashboardUuid: null,
    dashboardName: null,
    savedSqlUuid: null,
    savedSqlName: null,
    appUuid: 'app-1',
    appName: 'App',
    enabled: true,
    includeLinks: true,
    targets: [],
} as unknown as AppScheduler & { targets: [] };

const gsheetsScheduler = {
    ...baseScheduler,
    schedulerUuid: 'sched-gsheets',
    name: 'GSheets sync',
    format: SchedulerFormat.GSHEETS,
    options: {
        gdriveId: 'drive-1',
        gdriveName: 'Sheet',
        gdriveOrganizationName: 'Acme',
        url: 'https://docs.google.com/x',
    },
};

const csvScheduler = {
    ...baseScheduler,
    schedulerUuid: 'sched-csv',
    name: 'CSV delivery',
    format: SchedulerFormat.CSV,
    options: { formatted: true, limit: 'table' as const },
};

const mockAppSchedulersData = (results: (typeof baseScheduler)[]) =>
    ({
        data: {
            pages: [
                {
                    data: results,
                    pagination: {
                        page: 1,
                        pageSize: results.length || 1,
                        totalPageCount: 1,
                        totalResults: results.length,
                    },
                },
            ],
        },
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        isFetchingNextPage: false,
    }) as unknown as ReturnType<typeof useAppSchedulers>;

describe('AppSyncModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows only gsheets-format app schedulers, not csv/xlsx deliveries', () => {
        mockedUseAppSchedulers.mockReturnValue(
            mockAppSchedulersData([gsheetsScheduler, csvScheduler]),
        );

        renderWithProviders(
            <AppSyncModal
                projectUuid="project-1"
                appUuid="app-1"
                opened
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByText('GSheets sync')).toBeInTheDocument();
        expect(screen.queryByText('CSV delivery')).not.toBeInTheDocument();
    });

    it('shows the app-specific empty state when there are no gsheets syncs', () => {
        mockedUseAppSchedulers.mockReturnValue(
            mockAppSchedulersData([csvScheduler]),
        );

        renderWithProviders(
            <AppSyncModal
                projectUuid="project-1"
                appUuid="app-1"
                opened
                onClose={vi.fn()}
            />,
        );

        expect(
            screen.getByText('This app has no Syncs set up yet'),
        ).toBeInTheDocument();
    });
});
