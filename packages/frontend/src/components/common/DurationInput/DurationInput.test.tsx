import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DurationInput } from '.';
import { renderWithProviders } from '../../../testing/testUtils';
import { formatDuration } from './duration';

describe('formatDuration', () => {
    it.each([
        [45, '45 seconds'],
        [60, '1 minute'],
        [90, '1.5 minutes'],
        [3600, '1 hour'],
        [5400, '1.5 hours'],
        [86400, '1 day'],
        [30 * 86400, '30 days'],
    ])('formats %i seconds as %s', (seconds, expected) => {
        expect(formatDuration(seconds)).toBe(expected);
    });
});

const unitSelect = () => screen.getByRole('textbox', { name: 'Duration unit' });

describe('DurationInput', () => {
    it('picks the largest unit that divides the value evenly', () => {
        renderWithProviders(
            <DurationInput label="Duration" value={7200} onChange={vi.fn()} />,
        );
        expect(screen.getByLabelText('Duration')).toHaveValue('2');
        expect(unitSelect()).toHaveValue('hours');
    });

    it('falls back to the default unit for an empty value', () => {
        renderWithProviders(
            <DurationInput
                label="Duration"
                value={null}
                defaultUnit="minutes"
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByLabelText('Duration')).toHaveValue('');
        expect(unitSelect()).toHaveValue('minutes');
    });

    it('only offers the configured units', () => {
        renderWithProviders(
            <DurationInput
                label="Duration"
                value={90}
                units={['minutes', 'hours']}
                onChange={vi.fn()}
            />,
        );
        // 90s is not a whole number of minutes, so the smallest unit is used
        expect(screen.getByLabelText('Duration')).toHaveValue('1.5');
        expect(unitSelect()).toHaveValue('minutes');
    });

    it('emits seconds for the selected unit', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <DurationInput label="Duration" value={null} onChange={onChange} />,
        );
        await userEvent.type(screen.getByLabelText('Duration'), '5');
        expect(onChange).toHaveBeenLastCalledWith(5);
    });

    it('keeps the typed amount and re-emits seconds on unit change', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <DurationInput label="Duration" value={5} onChange={onChange} />,
        );
        await userEvent.click(unitSelect());
        await userEvent.click(await screen.findByText('minutes'));
        expect(unitSelect()).toHaveValue('minutes');
        expect(onChange).toHaveBeenLastCalledWith(300);
    });

    it('emits null when cleared', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <DurationInput label="Duration" value={120} onChange={onChange} />,
        );
        await userEvent.clear(screen.getByLabelText('Duration'));
        expect(onChange).toHaveBeenLastCalledWith(null);
    });
});
