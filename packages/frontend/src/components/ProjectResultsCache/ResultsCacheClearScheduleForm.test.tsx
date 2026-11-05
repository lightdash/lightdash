import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ResultsCacheClearScheduleForm } from './ResultsCacheClearScheduleForm';

const updateSchedule = vi.fn();

vi.mock('../../hooks/useProjectResultsCacheSettings', () => ({
    useUpdateResultsCacheClearSchedule: () => ({
        mutate: updateSchedule,
        isLoading: false,
    }),
}));

const renderForm = (
    clearSchedule: Parameters<
        typeof ResultsCacheClearScheduleForm
    >[0]['clearSchedule'],
) =>
    renderWithProviders(
        <ResultsCacheClearScheduleForm
            projectUuid="project-uuid"
            clearSchedule={clearSchedule}
            schedulerTimezone="UTC"
        />,
    );

describe('ResultsCacheClearScheduleForm', () => {
    beforeEach(() => {
        updateSchedule.mockClear();
    });

    test('starts disabled at daily 06:00 with no schedule', () => {
        renderForm(null);

        expect(screen.getByRole('switch')).not.toBeChecked();
        expect(screen.getByText('No clear scheduled')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    test('saves the default schedule as a daily cron when enabled', async () => {
        const user = userEvent.setup();
        renderForm(null);

        await user.click(screen.getByRole('switch'));
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(updateSchedule).toHaveBeenCalledWith(
            { enabled: true, cron: '0 6 * * *' },
            expect.anything(),
        );
    });

    test('restores a saved weekly schedule and keeps the cron when disabled', async () => {
        const user = userEvent.setup();
        renderForm({
            cron: '0 14 * * 5',
            enabled: true,
            nextRunAt: new Date('2026-11-06T14:00:00Z'),
        });

        expect(screen.getByDisplayValue('Every week')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Friday')).toBeInTheDocument();
        expect(screen.getByText(/^Next clear:/)).toBeInTheDocument();

        await user.click(screen.getByRole('switch'));
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(updateSchedule).toHaveBeenCalledWith(
            { enabled: false, cron: '0 14 * * 5' },
            expect.anything(),
        );
    });

    test('offers only daily and weekly frequencies', async () => {
        const user = userEvent.setup();
        renderForm(null);

        await user.click(screen.getByRole('switch'));
        await user.click(
            screen.getByLabelText('Frequency', { selector: 'input' }),
        );

        expect(screen.queryByText('Every hour')).not.toBeInTheDocument();
        expect(
            screen.getByRole('option', { name: 'Every day', hidden: true }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('option', { name: 'Every week', hidden: true }),
        ).toBeInTheDocument();
    });

    test('restores and saves several times in a day', async () => {
        const user = userEvent.setup();
        renderForm({
            cron: '0 6,14 * * *',
            enabled: true,
            nextRunAt: new Date('2026-10-30T14:00:00Z'),
        });

        await user.click(screen.getByRole('switch'));
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(updateSchedule).toHaveBeenCalledWith(
            { enabled: false, cron: '0 6,14 * * *' },
            expect.anything(),
        );
    });

    test('blocks saving with no times selected', async () => {
        const user = userEvent.setup();
        renderForm({
            cron: '0 6 * * *',
            enabled: true,
            nextRunAt: new Date('2026-10-31T06:00:00Z'),
        });

        await user.click(
            screen.getByRole('button', { name: /remove|^$/i, hidden: true }),
        );

        expect(
            screen.getByText('Select at least one time'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
});
