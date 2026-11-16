import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import { MOBILE_PITCH_DISMISSED_KEY } from './mobilePitchDismissed';
import { MobileSignInMenu } from './MobileSignInMenu';
import {
    MOBILE_PITCH_DISMISS_REASONS,
    MOBILE_PITCH_DISMISS_STRINGS,
} from './upsell/pitchDismiss';
import { UPSELL_STRINGS } from './upsell/upsellStrings';

vi.mock('../../api');
vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: { siteUrl: 'https://app.example.com' } }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { id: 'mobile-qr-sign-in', enabled: true },
    }),
}));
const track = vi.hoisted(() => vi.fn());
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

const api = mockedLightdashApi;

const renderMenu = () =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/projects/p1/saved/c1']}>
            <MobileSignInMenu />
        </MemoryRouter>,
    );

const openButton = () =>
    screen.getByRole('button', { name: 'Sign in on your phone' });

const notInterested = () =>
    screen.queryByRole('button', {
        name: MOBILE_PITCH_DISMISS_STRINGS.action,
    });

const openMenu = async () => {
    await userEvent.click(openButton());
    return screen.findByRole('dialog', { name: 'Sign in on your phone' });
};

beforeEach(() => {
    window.localStorage.clear();
    track.mockReset();
    api.mockReset();
    api.mockImplementation(async ({ method }: { method: string }) =>
        method === 'POST'
            ? {
                  codeUuid: 'code-1',
                  signInUrl: 'https://app.example.com/m/sign-in#c=code-1',
                  approvalNonce: 'nonce-1',
                  expiresAt: new Date(Date.now() + 120_000).toISOString(),
                  expiresInSeconds: 120,
              }
            : undefined,
    );
});

describe('MobileSignInMenu pitch dismiss', () => {
    it('shows a discreet Not interested control on the pitch', async () => {
        renderMenu();
        await openMenu();

        expect(
            await screen.findByRole('button', {
                name: MOBILE_PITCH_DISMISS_STRINGS.action,
            }),
        ).toBeInTheDocument();
        expect(track).not.toHaveBeenCalled();
    });

    it('swaps the card for the Why not? prompt without tracking yet', async () => {
        renderMenu();
        await openMenu();

        await userEvent.click(
            await screen.findByRole('button', {
                name: MOBILE_PITCH_DISMISS_STRINGS.action,
            }),
        );

        expect(
            screen.getByRole('group', { name: 'Why not?' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(UPSELL_STRINGS[6].headline),
        ).not.toBeInTheDocument();
        expect(track).not.toHaveBeenCalled();
    });

    it.each(MOBILE_PITCH_DISMISS_REASONS)(
        'sends one event with only the %s reason and the variation',
        async (reason) => {
            renderMenu();
            await openMenu();
            await userEvent.click(
                await screen.findByRole('button', {
                    name: MOBILE_PITCH_DISMISS_STRINGS.action,
                }),
            );

            await userEvent.click(
                screen.getByRole('button', {
                    name: MOBILE_PITCH_DISMISS_STRINGS.reasons[reason],
                }),
            );

            expect(track).toHaveBeenCalledTimes(1);
            expect(track).toHaveBeenCalledWith({
                name: 'mobile_pitch.dismissed',
                properties: { reason, variation: 6 },
            });
        },
    );

    it('closes the card, persists the dismissal and drops the pitch on the next open', async () => {
        renderMenu();
        await openMenu();
        await userEvent.click(
            await screen.findByRole('button', {
                name: MOBILE_PITCH_DISMISS_STRINGS.action,
            }),
        );

        await userEvent.click(
            screen.getByRole('button', {
                name: MOBILE_PITCH_DISMISS_STRINGS.reasons.not_needed,
            }),
        );

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(window.localStorage.getItem(MOBILE_PITCH_DISMISSED_KEY)).toBe(
            'true',
        );

        await openMenu();
        expect(
            screen.queryByText(UPSELL_STRINGS[6].headline),
        ).not.toBeInTheDocument();
        expect(notInterested()).not.toBeInTheDocument();
        expect(track).toHaveBeenCalledTimes(1);
    });

    it('keeps the phone icon and sign-in reachable after a reload', async () => {
        window.localStorage.setItem(MOBILE_PITCH_DISMISSED_KEY, 'true');
        renderMenu();

        expect(openButton()).toBeInTheDocument();
        expect(
            openButton().querySelector('.mantine-Indicator-indicator'),
        ).not.toBeInTheDocument();
        await openMenu();
        expect(
            screen.queryByText(UPSELL_STRINGS[6].headline),
        ).not.toBeInTheDocument();
        expect(notInterested()).not.toBeInTheDocument();
    });
});
