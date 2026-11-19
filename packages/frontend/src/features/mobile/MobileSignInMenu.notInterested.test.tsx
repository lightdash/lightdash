import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import { MOBILE_PITCH_DISMISSED_KEY } from './mobilePitchDismissed';
import { MobileSignInMenu } from './MobileSignInMenu';
import { MOBILE_STRINGS } from './mobileStrings';
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

const renderMenu = (withLabel = false) =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/projects/p1/saved/c1']}>
            <MobileSignInMenu withLabel={withLabel} />
        </MemoryRouter>,
    );

const openButton = () =>
    screen.getByRole('button', { name: 'Sign in on your phone' });

const phoneEntry = () =>
    screen.queryByRole('button', { name: MOBILE_STRINGS.signInTitle });

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

    it('shows Not interested as an X icon at the top of the pitch, named without hover', async () => {
        renderMenu();
        await openMenu();
        const control = await screen.findByRole('button', {
            name: MOBILE_PITCH_DISMISS_STRINGS.action,
        });
        const headline = screen.getByRole('heading', {
            name: UPSELL_STRINGS[6].headline,
        });

        expect(control).toHaveAccessibleName('Not interested');
        expect(control).toHaveTextContent('Not interested');
        expect(control.querySelector('svg')).toBeInTheDocument();
        expect(
            control.compareDocumentPosition(headline) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it('does not put the first focus on Not interested when the popover opens', async () => {
        renderMenu();
        const dialog = await openMenu();
        const control = await screen.findByRole('button', {
            name: MOBILE_PITCH_DISMISS_STRINGS.action,
        });

        await waitFor(() =>
            expect(dialog).toContainElement(
                document.activeElement as HTMLElement,
            ),
        );
        expect(control).not.toHaveFocus();

        await userEvent.keyboard('{Enter}');

        expect(
            screen.queryByRole('group', { name: 'Help us improve the app' }),
        ).not.toBeInTheDocument();
        expect(track).not.toHaveBeenCalled();
        expect(window.localStorage.getItem(MOBILE_PITCH_DISMISSED_KEY)).toBe(
            null,
        );
    });

    it('swaps the card for the Help us improve the app prompt without tracking yet', async () => {
        renderMenu();
        await openMenu();

        await userEvent.click(
            await screen.findByRole('button', {
                name: MOBILE_PITCH_DISMISS_STRINGS.action,
            }),
        );

        expect(
            screen.getByRole('group', { name: 'Help us improve the app' }),
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

    it('removes the phone entry once a reason is picked and keeps it gone after a reload', async () => {
        const first = renderMenu();
        await openMenu();
        await userEvent.click(
            await screen.findByRole('button', {
                name: MOBILE_PITCH_DISMISS_STRINGS.action,
            }),
        );

        await userEvent.click(
            screen.getByRole('button', {
                name: MOBILE_PITCH_DISMISS_STRINGS.reasons.already_use,
            }),
        );

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(phoneEntry()).not.toBeInTheDocument();
        expect(window.localStorage.getItem(MOBILE_PITCH_DISMISSED_KEY)).toBe(
            'true',
        );
        expect(track).toHaveBeenCalledTimes(1);
        first.unmount();

        renderMenu();
        expect(phoneEntry()).not.toBeInTheDocument();
        expect(
            screen.queryByText(MOBILE_STRINGS.signInTitle),
        ).not.toBeInTheDocument();
    });

    const renderInNav = (after: boolean) =>
        renderWithProviders(
            <MemoryRouter initialEntries={['/projects/p1/saved/c1']}>
                <header>
                    <button type="button">Notifications</button>
                    <MobileSignInMenu />
                    {after && <button type="button">Help</button>}
                </header>
            </MemoryRouter>,
        );

    const dismissByKeyboard = async () => {
        const user = userEvent.setup();
        openButton().focus();
        await user.keyboard('{Enter}');
        await screen.findByRole('dialog', { name: 'Sign in on your phone' });
        const control = await screen.findByRole('button', {
            name: MOBILE_PITCH_DISMISS_STRINGS.action,
        });
        control.focus();
        await user.keyboard('{Enter}');
        screen
            .getByRole('button', {
                name: MOBILE_PITCH_DISMISS_STRINGS.reasons.already_use,
            })
            .focus();
        await user.keyboard('{Enter}');
        await waitFor(() => expect(phoneEntry()).not.toBeInTheDocument());
    };

    it('moves focus to the next nav control after a keyboard dismissal', async () => {
        renderInNav(true);

        await dismissByKeyboard();

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Help' })).toHaveFocus(),
        );
        expect(document.body).not.toHaveFocus();
    });

    it('moves focus to the previous nav control when nothing follows the phone entry', async () => {
        renderInNav(false);

        await dismissByKeyboard();

        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Notifications' }),
            ).toHaveFocus(),
        );
    });

    it.each([false, true])(
        'renders no phone entry when the dismissal is already stored (withLabel %s)',
        (withLabel) => {
            window.localStorage.setItem(MOBILE_PITCH_DISMISSED_KEY, 'true');
            renderMenu(withLabel);

            expect(phoneEntry()).not.toBeInTheDocument();
            expect(
                screen.queryByText(MOBILE_STRINGS.signInTitle),
            ).not.toBeInTheDocument();
            expect(notInterested()).not.toBeInTheDocument();
        },
    );

    it('removes the phone entry when another tab dismisses the pitch', async () => {
        renderMenu();
        expect(phoneEntry()).toBeInTheDocument();

        window.localStorage.setItem(MOBILE_PITCH_DISMISSED_KEY, 'true');
        act(() => {
            window.dispatchEvent(
                new StorageEvent('storage', {
                    key: MOBILE_PITCH_DISMISSED_KEY,
                    newValue: 'true',
                }),
            );
        });

        expect(phoneEntry()).not.toBeInTheDocument();
    });
});
