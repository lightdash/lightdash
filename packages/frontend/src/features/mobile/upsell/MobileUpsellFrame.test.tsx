import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { MobileUpsellFrame } from './MobileUpsellFrame';
import { MOBILE_PITCH_DISMISS_STRINGS } from './pitchDismiss';

const idle: ComponentProps<typeof MobileUpsellFrame> = {
    variation: 6,
    isIdle: true,
    isWaitingForScan: true,
    isSignedIn: false,
    title: 'Sign in on your phone',
    qr: <div>QR</div>,
    details: null,
    status: null,
};

const confirming = (
    onDismiss: ComponentProps<typeof MobileUpsellFrame>['onDismiss'],
): ComponentProps<typeof MobileUpsellFrame> => ({
    ...idle,
    isIdle: false,
    isWaitingForScan: false,
    details: (
        <div role="group" aria-label="A phone wants to sign in as you">
            <button type="button">Approve</button>
            <button type="button">Decline</button>
        </div>
    ),
    onDismiss,
});

describe('MobileUpsellFrame reasons step', () => {
    it('hands the card back to Approve and Decline when a phone claims the code while the reasons are open', async () => {
        const onDismiss = vi.fn();
        const { rerender } = renderWithProviders(
            <MobileUpsellFrame {...idle} onDismiss={onDismiss} />,
        );
        await userEvent.click(
            screen.getByRole('button', {
                name: MOBILE_PITCH_DISMISS_STRINGS.action,
            }),
        );
        expect(
            screen.getByRole('group', { name: 'Help us improve the app' }),
        ).toBeInTheDocument();

        rerender(<MobileUpsellFrame {...confirming(onDismiss)} />);

        expect(
            screen.getByRole('button', { name: 'Approve' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Decline' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('group', { name: 'Help us improve the app' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: MOBILE_PITCH_DISMISS_STRINGS.reasons.not_now,
            }),
        ).not.toBeInTheDocument();
        expect(onDismiss).not.toHaveBeenCalled();
    });
});
