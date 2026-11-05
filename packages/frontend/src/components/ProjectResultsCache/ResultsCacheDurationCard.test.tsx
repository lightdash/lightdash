import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ResultsCacheDurationCard } from './ResultsCacheDurationCard';

const updateSchedule = vi.fn();
const updateSettings = vi.fn();

vi.mock('../../hooks/useProjectResultsCacheSettings', () => ({
    useUpdateResultsCacheClearSchedule: () => ({
        mutate: updateSchedule,
        isLoading: false,
    }),
    useUpdateResultsCacheSettings: () => ({
        mutate: updateSettings,
        isLoading: false,
    }),
    useResultsCacheTtlProjections: () => ({ data: undefined, isError: false }),
}));

type CardProps = ComponentProps<typeof ResultsCacheDurationCard>;

const renderCard = (overrides: Partial<CardProps>) =>
    renderWithProviders(
        <ResultsCacheDurationCard
            projectUuid="project-uuid"
            days={7}
            initialTtlSeconds={null}
            instanceDefaultSeconds={3600}
            clearSchedule={null}
            schedulerTimezone="UTC"
            showDuration={false}
            showProjections={false}
            showSchedule
            {...overrides}
        />,
    );

const renderForm = (clearSchedule: CardProps['clearSchedule']) =>
    renderCard({ clearSchedule });

const saveButton = () => screen.getByRole('button', { name: 'Save changes' });

describe('ResultsCacheDurationCard scheduled clearing', () => {
    beforeEach(() => {
        updateSchedule.mockClear();
        updateSettings.mockClear();
    });

    test('starts disabled at daily 06:00 with no schedule', () => {
        renderForm(null);

        expect(screen.getByRole('switch')).not.toBeChecked();
        expect(screen.getByText('No clear scheduled')).toBeInTheDocument();
        expect(saveButton()).toBeDisabled();
    });

    test('saves the default schedule as a daily cron when enabled', async () => {
        const user = userEvent.setup();
        renderForm(null);

        await user.click(screen.getByRole('switch'));
        await user.click(saveButton());

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
        await user.click(saveButton());

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
        await user.click(saveButton());

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
        expect(saveButton()).toBeDisabled();
    });
});

describe('ResultsCacheDurationCard cache duration', () => {
    beforeEach(() => {
        updateSchedule.mockClear();
        updateSettings.mockClear();
    });

    test('shows the instance default disabled and saves a custom duration', async () => {
        const user = userEvent.setup();
        renderCard({ showDuration: true, showSchedule: false });

        expect(
            screen.getByLabelText('Cache duration (minutes)'),
        ).toBeDisabled();
        expect(saveButton()).toBeDisabled();

        await user.click(screen.getByText('Custom duration'));
        const input = screen.getByLabelText('Cache duration (minutes)');
        await user.clear(input);
        await user.type(input, '120');
        await user.click(saveButton());

        expect(updateSettings).toHaveBeenCalledWith(
            { cacheTtlSeconds: 7200 },
            expect.anything(),
        );
        expect(updateSchedule).not.toHaveBeenCalled();
    });

    test('saves the duration and the schedule together when both changed', async () => {
        const user = userEvent.setup();
        renderCard({
            showDuration: true,
            showSchedule: true,
            initialTtlSeconds: 7200,
        });

        await user.click(screen.getByText('Instance default'));
        await user.click(screen.getByRole('switch'));
        await user.click(saveButton());

        expect(updateSettings).toHaveBeenCalledWith(
            { cacheTtlSeconds: null },
            expect.anything(),
        );
        expect(updateSchedule).toHaveBeenCalledWith(
            { enabled: true, cron: '0 6 * * *' },
            expect.anything(),
        );
    });
});
