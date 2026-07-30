import {
    SchedulerFormat,
    type AppScheduler,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC, type MutableRefObject, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { Limit, Values } from '../../types';
import {
    DEFAULT_VALUES,
    getFormValuesFromScheduler,
    SchedulerFormProvider,
    useSchedulerForm,
    type SchedulerFormValues,
} from '../schedulerFormContext';
import { SchedulerDataFormatSection } from './SchedulerDataFormatSection';

type SchedulerForm = ReturnType<typeof useSchedulerForm>;

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
    formRef?: MutableRefObject<SchedulerForm | null>;
    children: ReactNode;
}> = ({ initialValues, formRef, children }) => {
    const form = useSchedulerForm({ initialValues });
    if (formRef) formRef.current = form;
    return (
        <SchedulerFormProvider form={form}>{children}</SchedulerFormProvider>
    );
};

const renderSection = (
    props: Partial<
        React.ComponentProps<typeof SchedulerDataFormatSection>
    > = {},
    initialValues: SchedulerFormValues = DEFAULT_VALUES,
    formRef?: MutableRefObject<SchedulerForm | null>,
) =>
    renderWithProviders(
        <FormWrapper initialValues={initialValues} formRef={formRef}>
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

    describe('format-switch side effect', () => {
        const createFormRef = (): MutableRefObject<SchedulerForm | null> => ({
            current: null,
        });

        // Deliberately NOT the app-legal csv shape (formatted/limit differ
        // from DEFAULT_VALUES.options) — otherwise a no-op switch handler
        // would pass these assertions by coincidence.
        const nonLegalCsvOptions: SchedulerFormValues['options'] = {
            ...DEFAULT_VALUES.options,
            formatted: Values.RAW,
            limit: Limit.ALL,
        };

        it('sets options to the only backend-legal csv shape when switched to csv', async () => {
            const formRef = createFormRef();
            const user = userEvent.setup();
            renderSection(
                { capturedQueryCount: 3 },
                {
                    ...DEFAULT_VALUES,
                    format: SchedulerFormat.IMAGE,
                    options: nonLegalCsvOptions,
                },
                formRef,
            );

            await user.click(screen.getByRole('radio', { name: '.csv' }));

            expect(formRef.current?.values.format).toBe(SchedulerFormat.CSV);
            expect(formRef.current?.values.options).toMatchObject({
                formatted: Values.FORMATTED,
                limit: Limit.TABLE,
            });
        });

        it('sets options to the only backend-legal xlsx shape when switched to xlsx', async () => {
            const formRef = createFormRef();
            const user = userEvent.setup();
            renderSection(
                { capturedQueryCount: 3 },
                {
                    ...DEFAULT_VALUES,
                    format: SchedulerFormat.IMAGE,
                    options: nonLegalCsvOptions,
                },
                formRef,
            );

            await user.click(screen.getByRole('radio', { name: '.xlsx' }));

            expect(formRef.current?.values.format).toBe(SchedulerFormat.XLSX);
            expect(formRef.current?.values.options).toMatchObject({
                formatted: Values.FORMATTED,
                limit: Limit.TABLE,
            });
        });

        it('restores the image-appropriate options when switched back to image', async () => {
            const formRef = createFormRef();
            const user = userEvent.setup();
            renderSection(
                { capturedQueryCount: 3 },
                {
                    ...DEFAULT_VALUES,
                    format: SchedulerFormat.IMAGE,
                    options: nonLegalCsvOptions,
                },
                formRef,
            );

            await user.click(screen.getByRole('radio', { name: '.csv' }));
            await user.click(screen.getByRole('radio', { name: 'Image' }));

            expect(formRef.current?.values.format).toBe(SchedulerFormat.IMAGE);
            // Switching to csv/xlsx only ever touches `formatted`/`limit` —
            // the image-specific fields must still hold the form's defaults.
            expect(formRef.current?.values.options).toMatchObject({
                withPdf: DEFAULT_VALUES.options.withPdf,
                pagePerTab: DEFAULT_VALUES.options.pagePerTab,
            });
        });
    });
});
