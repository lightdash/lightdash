import { screen } from '@testing-library/react';
import { type FC, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import {
    DEFAULT_VALUES,
    SchedulerFormProvider,
    useSchedulerForm,
    type SchedulerFormValues,
} from '../schedulerFormContext';
import { SchedulerNextRuns } from './SchedulerNextRuns';

const project = vi.hoisted(() => ({
    data: undefined as { schedulerTimezone: string } | undefined,
}));

vi.mock('../../../../../hooks/useProjectUuid', () => ({
    useProjectUuid: vi.fn(() => 'project-uuid'),
}));

vi.mock('../../../../../hooks/useProject', () => ({
    useProject: vi.fn(() => ({ data: project.data })),
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

const renderNextRuns = (values: Partial<SchedulerFormValues>) =>
    renderWithProviders(
        <FormWrapper initialValues={{ ...DEFAULT_VALUES, ...values }}>
            <SchedulerNextRuns />
        </FormWrapper>,
    );

describe('SchedulerNextRuns', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-09T09:20:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        project.data = undefined;
    });

    it('shows runs in the project timezone when the delivery has no timezone', () => {
        project.data = { schedulerTimezone: 'UTC' };
        renderNextRuns({ cron: '0 9 * * *', timezone: undefined });

        expect(screen.getByText('Thu, Sep 10 · 9:00 AM UTC')).toBeTruthy();
        expect(
            screen.getByText('Times shown in project timezone'),
        ).toBeTruthy();
    });

    it('prefers the delivery timezone over the project timezone', () => {
        project.data = { schedulerTimezone: 'UTC' };
        renderNextRuns({ cron: '0 9 * * *', timezone: 'Asia/Tokyo' });

        expect(screen.getByText(/^Thu, Sep 10 · 9:00 AM /)).toBeTruthy();
        expect(screen.queryByText(/9:00 AM UTC$/)).toBeNull();
        expect(screen.getByText('Times shown in Asia/Tokyo')).toBeTruthy();
    });

    it('shows no runs until the project timezone is known', () => {
        project.data = undefined;
        renderNextRuns({ cron: '0 9 * * *', timezone: undefined });

        expect(screen.queryByText('Next runs')).toBeNull();
    });
});
