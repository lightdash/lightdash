import {
    SchedulerFormat,
    type AppScheduler,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type FC, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import {
    DEFAULT_VALUES,
    getFormValuesFromScheduler,
    SchedulerFormProvider,
    useSchedulerForm,
    type SchedulerFormValues,
} from '../schedulerFormContext';
import { SchedulerDataFormatSection } from './SchedulerDataFormatSection';

vi.mock('../../../../../hooks/health/useHealth', () => ({
    default: vi.fn(() => ({
        data: {
            hasHeadlessBrowser: true,
            query: { csvCellsLimit: 100000 },
        },
    })),
}));

vi.mock('../../../../../hooks/useProjectUuid', () => ({
    useProjectUuid: vi.fn(() => 'project-uuid'),
}));

const FormWrapper: FC<{
    initialValues: SchedulerFormValues;
    children: ReactNode;
}> = ({ initialValues, children }) => {
    const form = useSchedulerForm({ initialValues });
    return (
        <SchedulerFormProvider form={form}>{children}</SchedulerFormProvider>
    );
};

const renderSection = (
    props: Partial<
        React.ComponentProps<typeof SchedulerDataFormatSection>
    > = {},
    initialValues: SchedulerFormValues = DEFAULT_VALUES,
) =>
    renderWithProviders(
        <FormWrapper initialValues={initialValues}>
            <SchedulerDataFormatSection
                dashboard={undefined}
                savedSchedulerData={undefined}
                isApp
                appUuid="app-uuid"
                currentAppState={null}
                isDashboardTabsAvailable={false}
                loading={false}
                {...props}
            />
        </FormWrapper>,
    );

const savedCsvAppScheduler: SchedulerAndTargets = {
    schedulerUuid: 'scheduler-uuid',
    slug: 'app-delivery',
    name: 'App delivery',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-uuid',
    createdByName: 'User',
    format: SchedulerFormat.CSV,
    cron: '0 9 * * 1',
    savedChartUuid: null,
    savedChartName: null,
    dashboardUuid: null,
    dashboardName: null,
    savedSqlUuid: null,
    savedSqlName: null,
    appUuid: 'app-uuid',
    appName: 'App',
    options: { formatted: true, limit: 'table' },
    enabled: true,
    includeLinks: true,
    targets: [],
} as AppScheduler & { targets: [] };

describe('SchedulerDataFormatSection - app formats', () => {
    it('shows csv/xlsx/image (no PDF) and the query-count caption when the app has captured queries', () => {
        renderSection({ capturedQueryCount: 3 });

        expect(screen.getByRole('radio', { name: '.csv' })).toBeEnabled();
        expect(screen.getByRole('radio', { name: '.xlsx' })).toBeEnabled();
        expect(screen.getByRole('radio', { name: 'Image' })).toBeVisible();
        expect(
            screen.queryByRole('radio', { name: 'PDF' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText('3 data queries detected — each becomes a file'),
        ).toBeInTheDocument();
    });

    it('uses singular copy for exactly one captured query', () => {
        renderSection({ capturedQueryCount: 1 });

        expect(
            screen.getByText('1 data query detected — it becomes a file'),
        ).toBeInTheDocument();
    });

    it('disables csv/xlsx and shows the zero-state copy when the app ran no data queries', () => {
        renderSection({ capturedQueryCount: 0 });

        expect(screen.getByRole('radio', { name: '.csv' })).toBeDisabled();
        expect(screen.getByRole('radio', { name: '.xlsx' })).toBeDisabled();
        expect(
            screen.getByText('This app ran no data queries'),
        ).toBeInTheDocument();
    });

    it('preserves and enables a saved csv format when editing without a live query count', () => {
        renderSection(
            {
                savedSchedulerData: savedCsvAppScheduler,
                capturedQueryCount: undefined,
            },
            getFormValuesFromScheduler(savedCsvAppScheduler),
        );

        const csvRadio = screen.getByRole('radio', { name: '.csv' });
        expect(csvRadio).toBeEnabled();
        expect(csvRadio).toBeChecked();
    });

    it('hides the row-limit control for apps', () => {
        renderSection(
            { capturedQueryCount: 3 },
            { ...DEFAULT_VALUES, format: SchedulerFormat.CSV },
        );

        expect(screen.queryByText('Limit')).not.toBeInTheDocument();
    });

    it('shows the row-limit control for non-app deliveries', () => {
        renderSection(
            { isApp: false, appUuid: undefined, capturedQueryCount: 3 },
            { ...DEFAULT_VALUES, format: SchedulerFormat.CSV },
        );

        expect(screen.getByText('Limit')).toBeInTheDocument();
    });
});
