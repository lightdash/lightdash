import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    MOBILE_PITCH_DISMISS_REASONS,
    MOBILE_PITCH_DISMISS_STRINGS,
} from './pitchDismiss';
import { PitchDismissReasons } from './PitchDismissReasons';

const renderReasons = (onPick = vi.fn()) => {
    renderWithProviders(<PitchDismissReasons onPick={onPick} />);
    return onPick;
};

describe('PitchDismissReasons', () => {
    it('asks why and offers four to five pill options', () => {
        renderReasons();

        expect(
            screen.getByRole('group', { name: 'Why not?' }),
        ).toBeInTheDocument();
        const pills = screen.getAllByRole('button');
        expect(pills.length).toBeGreaterThanOrEqual(4);
        expect(pills.length).toBeLessThanOrEqual(5);
        expect(pills.map((pill) => pill.textContent)).toEqual(
            MOBILE_PITCH_DISMISS_REASONS.map(
                (reason) => MOBILE_PITCH_DISMISS_STRINGS.reasons[reason],
            ),
        );
    });

    it('has no free text field and no confirmation step', () => {
        renderReasons();

        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /confirm|submit|send/i }),
        ).not.toBeInTheDocument();
    });

    it.each(MOBILE_PITCH_DISMISS_REASONS)(
        'reports the %s reason once when its pill is picked',
        async (reason) => {
            const onPick = renderReasons();

            await userEvent.click(
                screen.getByRole('button', {
                    name: MOBILE_PITCH_DISMISS_STRINGS.reasons[reason],
                }),
            );

            expect(onPick).toHaveBeenCalledTimes(1);
            expect(onPick).toHaveBeenCalledWith(reason);
        },
    );

    it('focuses the first pill so the keyboard can pick straight away', () => {
        renderReasons();

        expect(screen.getAllByRole('button')[0]).toHaveFocus();
    });
});
