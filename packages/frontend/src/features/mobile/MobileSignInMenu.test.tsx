import {
    LightdashMode,
    MobileSignInCodeStatus,
    type ApiError,
} from '@lightdash/common';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import { MobileSignInMenu } from './MobileSignInMenu';
import { MOBILE_SIGN_IN_STRINGS } from './mobileStrings';
import { UPSELL_STRINGS } from './upsell/upsellStrings';

vi.mock('../../api');
const health = vi.hoisted(() => ({ mode: 'default' }));
vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({
        data: { siteUrl: 'https://app.example.com', mode: health.mode },
    }),
}));
const qrSignIn = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { id: 'mobile-qr-sign-in', enabled: qrSignIn.enabled },
    }),
}));

const api = mockedLightdashApi;

type Call = { url: string; method: string };

const mockServer = ({
    mintError,
    isClaimed = false,
    appliesDecisions = false,
}: {
    mintError?: ApiError;
    isClaimed?: boolean;
    appliesDecisions?: boolean;
} = {}) => {
    const calls: Call[] = [];
    let mints = 0;
    let decision: 'approve' | 'decline' | null = null;
    api.mockImplementation(
        async ({ url, method }: { url: string; method: string }) => {
            calls.push({ url, method });
            if (method === 'POST' && url === '/user/mobile/sign-in-codes') {
                if (mintError) throw mintError;
                mints += 1;
                return {
                    codeUuid: `code-${mints}`,
                    signInUrl: `https://app.example.com/m/sign-in#c=code-${mints}`,
                    approvalNonce: 'nonce-1',
                    expiresAt: new Date(Date.now() + 120_000).toISOString(),
                    expiresInSeconds: 120,
                };
            }
            if (method === 'POST' && url.endsWith('/approve')) {
                if (appliesDecisions) decision = 'approve';
                return {
                    status: MobileSignInCodeStatus.APPROVED,
                    matchNumber: '47',
                };
            }
            if (method === 'POST' && url.endsWith('/decline')) {
                if (appliesDecisions) decision = 'decline';
                return {
                    status: MobileSignInCodeStatus.DECLINED,
                    matchNumber: null,
                };
            }
            if (method === 'DELETE') return undefined;
            const codeUuid = url.split('/').pop();
            if (codeUuid !== 'code-1') {
                return {
                    codeUuid,
                    status: MobileSignInCodeStatus.PENDING,
                    expiresAt: new Date(Date.now() + 120_000).toISOString(),
                    matchNumber: null,
                    declinedBy: null,
                    device: null,
                };
            }
            const claimedStatus =
                decision === 'approve'
                    ? MobileSignInCodeStatus.APPROVED
                    : MobileSignInCodeStatus.CLAIMED;
            return {
                codeUuid: 'code-1',
                status:
                    decision === 'decline'
                        ? MobileSignInCodeStatus.DECLINED
                        : isClaimed
                          ? claimedStatus
                          : MobileSignInCodeStatus.PENDING,
                expiresAt: new Date(Date.now() + 120_000).toISOString(),
                matchNumber: decision === 'approve' ? '47' : null,
                declinedBy: decision === 'decline' ? 'web' : null,
                device: isClaimed
                    ? { platform: 'ios', clientName: 'Lightdash iOS' }
                    : null,
            };
        },
    );
    const of = (method: string, match: (url: string) => boolean) =>
        calls.filter((call) => call.method === method && match(call.url));
    return {
        mints: () => of('POST', (url) => url === '/user/mobile/sign-in-codes'),
        deletes: () => of('DELETE', () => true).map((call) => call.url),
        approvals: () => of('POST', (url) => url.endsWith('/approve')),
    };
};

const renderMenu = (ui: ReactElement) =>
    renderWithProviders(
        <MemoryRouter
            initialEntries={[`/projects/p1/saved/c1${window.location.search}`]}
        >
            {ui}
        </MemoryRouter>,
    );

const openButton = () =>
    screen.getByRole('button', { name: 'Sign in on your phone' });

beforeEach(() => {
    window.history.replaceState({}, '', '/');
    api.mockReset();
    qrSignIn.enabled = true;
    health.mode = LightdashMode.DEFAULT;
});

describe('MobileSignInMenu', () => {
    it.each([
        '',
        '?mobileUpsell=invalid',
        '?mobileUpsell=0',
        '?mobileUpsell=7',
        '?mobileUpsell=01',
        '?mobileUpsell=1.0',
    ])('keeps the default DOM for %s', async (search) => {
        window.history.replaceState({}, '', `/${search}`);
        mockServer();
        renderMenu(<MobileSignInMenu />);
        await userEvent.click(openButton());
        await screen.findByRole('img', { name: 'Sign-in QR code' });
        expect(document.querySelector('[data-mobile-upsell]')).toBeNull();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByText('Waiting for scan')).toHaveAttribute(
            'aria-live',
            'polite',
        );
    });

    it.each([1, 2, 3, 4, 5, 6] as const)(
        'shows pitch %s with the existing QR and status',
        async (variation) => {
            window.history.replaceState({}, '', `/?mobileUpsell=${variation}`);
            mockServer();
            renderMenu(<MobileSignInMenu />);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            await userEvent.click(openButton());
            expect(
                screen.getByRole('heading', {
                    name: UPSELL_STRINGS[variation].headline,
                }),
            ).toBeVisible();
            await screen.findByRole('img', { name: 'Sign-in QR code' });
            expect(screen.getByText('Waiting for scan')).toHaveAttribute(
                'aria-live',
                'polite',
            );
            const frame = document.querySelector('[data-mobile-upsell]');
            expect(frame).toHaveAttribute(
                'data-mobile-upsell',
                String(variation),
            );
            expect(
                frame?.querySelector('[aria-hidden="true"] svg'),
            ).toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        },
    );

    it('keeps the sign-in QR as the only action and closes on Escape', async () => {
        window.history.replaceState({}, '', '/?mobileUpsell=1');
        const user = userEvent.setup();
        const server = mockServer();
        renderMenu(<MobileSignInMenu />);

        await user.click(openButton());
        const popover = await screen.findByRole('dialog', {
            name: 'Sign in on your phone',
        });
        await within(popover).findByRole('img', { name: 'Sign-in QR code' });
        expect(within(popover).queryByRole('link')).not.toBeInTheDocument();
        expect(within(popover).queryByRole('button')).not.toBeInTheDocument();

        await user.keyboard('{Escape}');

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(openButton()).toHaveFocus();
        await waitFor(() =>
            expect(server.deletes()).toEqual([
                '/user/mobile/sign-in-codes/code-1',
            ]),
        );
    });

    it('shows the QR beside the pitch animation while waiting', async () => {
        window.history.replaceState({}, '', '/?mobileUpsell=2');
        mockServer();
        renderMenu(<MobileSignInMenu />);
        await userEvent.click(openButton());
        const qr = await screen.findByRole('img', { name: 'Sign-in QR code' });
        const side = document.querySelector('[data-idle]');
        expect(side).toHaveAttribute('data-idle', 'true');
        expect(side?.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
        expect(side).not.toContainElement(qr);
        expect(screen.getByText('Waiting for scan')).toHaveAttribute(
            'aria-live',
            'polite',
        );
    });

    it('swaps the pitch for an inline confirm on scan, with no dialog', async () => {
        window.history.replaceState({}, '', '/?mobileUpsell=2');
        const user = userEvent.setup();
        mockServer({ isClaimed: true });
        renderMenu(<MobileSignInMenu />);
        await user.click(openButton());
        const confirm = await screen.findByRole('group', {
            name: 'A phone wants to sign in as you',
        });
        const side = document.querySelector('[data-idle]');
        expect(side).toHaveAttribute('data-idle', 'false');
        expect(side).toContainElement(confirm);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(
            screen.getByRole('img', { name: 'Sign-in QR code' }),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(
                within(confirm).getByRole('button', { name: 'Decline' }),
            ).toHaveFocus(),
        );
    });

    it.each([1, 2, 3, 4, 5, 6] as const)(
        'shows the Cloud install hint under the QR in pitch %s',
        async (variation) => {
            health.mode = LightdashMode.CLOUD_BETA;
            window.history.replaceState({}, '', `/?mobileUpsell=${variation}`);
            mockServer();
            renderMenu(<MobileSignInMenu />);
            await userEvent.click(openButton());
            await screen.findByRole('img', { name: 'Sign-in QR code' });
            const hint = screen.getByText(MOBILE_SIGN_IN_STRINGS.installHint);
            expect(hint).toBeVisible();
            expect(document.querySelector('[data-idle]')).not.toContainElement(
                hint,
            );
        },
    );

    it('leaves the install hint out of the pitch outside Cloud', async () => {
        window.history.replaceState({}, '', '/?mobileUpsell=2');
        mockServer();
        renderMenu(<MobileSignInMenu />);
        await userEvent.click(openButton());
        await screen.findByRole('img', { name: 'Sign-in QR code' });
        expect(
            screen.queryByText(MOBILE_SIGN_IN_STRINGS.installHint),
        ).not.toBeInTheDocument();
    });

    it('pauses the pitch when the tab is hidden', async () => {
        window.history.replaceState({}, '', '/?mobileUpsell=1');
        mockServer();
        renderMenu(<MobileSignInMenu />);
        await userEvent.click(openButton());
        await screen.findByRole('img', { name: 'Sign-in QR code' });
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        });
        fireEvent(document, new Event('visibilitychange'));
        expect(document.querySelector('[data-mobile-upsell]')).toHaveAttribute(
            'data-paused',
            'true',
        );
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
        fireEvent(document, new Event('visibilitychange'));
        expect(document.querySelector('[data-mobile-upsell]')).toHaveAttribute(
            'data-paused',
            'false',
        );
    });

    it('renders nothing and mints nothing with mobile-qr-sign-in off', () => {
        qrSignIn.enabled = false;
        const server = mockServer();
        const { container } = renderMenu(
            <div data-testid="header-group">
                <MobileSignInMenu />
            </div>,
        );

        expect(screen.getByTestId('header-group')).toBeEmptyDOMElement();
        expect(container.querySelector('button')).toBeNull();
        expect(screen.getByTestId('header-group').outerHTML).toBe(
            '<div data-testid="header-group"></div>',
        );
        expect(
            screen.queryByRole('button', { name: 'Sign in on your phone' }),
        ).not.toBeInTheDocument();
        expect(server.mints()).toEqual([]);
    });

    it('mints no code until the popover opens, then shows the sign-in step', async () => {
        const user = userEvent.setup();
        const server = mockServer();
        renderMenu(<MobileSignInMenu />);

        expect(openButton()).toBeVisible();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(server.mints()).toEqual([]);

        await user.click(openButton());

        const popover = await screen.findByRole('dialog', {
            name: 'Sign in on your phone',
        });
        expect(
            within(popover).getByRole('heading', {
                name: 'Sign in on your phone',
            }),
        ).toBeVisible();
        expect(
            await within(popover).findByRole('img', {
                name: 'Sign-in QR code',
            }),
        ).toBeInTheDocument();
        expect(within(popover).getByText('Waiting for scan')).toHaveAttribute(
            'aria-live',
            'polite',
        );
        expect(server.mints()).toHaveLength(1);
    });

    it.each([
        '',
        '?mobileUpsell=1',
        '?mobileUpsell=2',
        '?mobileUpsell=3',
        '?mobileUpsell=4',
        '?mobileUpsell=5',
        '?mobileUpsell=6',
    ])('closes on Escape and cancels the unused code %s', async (search) => {
        window.history.replaceState({}, '', `/${search}`);
        const user = userEvent.setup();
        const server = mockServer();
        renderMenu(<MobileSignInMenu />);

        await user.click(openButton());
        await screen.findByRole('img', { name: 'Sign-in QR code' });
        expect(server.deletes()).toEqual([]);

        await user.keyboard('{Escape}');

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        await waitFor(() =>
            expect(server.deletes()).toEqual([
                '/user/mobile/sign-in-codes/code-1',
            ]),
        );
        expect(openButton()).toHaveFocus();
    });

    it('cancels the code when the icon is clicked again', async () => {
        const user = userEvent.setup();
        const server = mockServer();
        renderMenu(<MobileSignInMenu />);

        await user.click(openButton());
        await screen.findByRole('img', { name: 'Sign-in QR code' });
        await user.click(openButton());

        await waitFor(() =>
            expect(server.deletes()).toEqual([
                '/user/mobile/sign-in-codes/code-1',
            ]),
        );
    });

    it('closes on a click outside and cancels the unused code', async () => {
        const user = userEvent.setup();
        const server = mockServer();
        renderMenu(<MobileSignInMenu />);

        await user.click(openButton());
        await screen.findByRole('img', { name: 'Sign-in QR code' });
        fireEvent.mouseDown(document.body);

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        await waitFor(() =>
            expect(server.deletes()).toEqual([
                '/user/mobile/sign-in-codes/code-1',
            ]),
        );
    });

    it('cancels nothing when no code was created', async () => {
        const user = userEvent.setup();
        const server = mockServer({
            mintError: {
                status: 'error',
                error: { name: 'Error', statusCode: 500, message: 'boom' },
            } as ApiError,
        });
        renderMenu(<MobileSignInMenu />);

        await user.click(openButton());
        await screen.findByText("Couldn't create the code");
        await user.keyboard('{Escape}');

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(server.mints()).toHaveLength(1);
        expect(server.deletes()).toEqual([]);
    });

    it.each([
        '',
        '?mobileUpsell=1',
        '?mobileUpsell=2',
        '?mobileUpsell=3',
        '?mobileUpsell=4',
        '?mobileUpsell=5',
        '?mobileUpsell=6',
    ])(
        'stays open while the user confirms a phone inline %s',
        async (search) => {
            window.history.replaceState({}, '', `/${search}`);
            const user = userEvent.setup();
            const server = mockServer({ isClaimed: true });
            renderMenu(<MobileSignInMenu />);

            await user.click(openButton());
            const confirm = await screen.findByRole('group', {
                name: 'A phone wants to sign in as you',
            });
            await user.click(
                within(confirm).getByRole('button', { name: 'Confirm' }),
            );

            await waitFor(() => expect(server.approvals()).toHaveLength(1));
            fireEvent.mouseDown(document.body);
            fireEvent.keyDown(confirm, { key: 'Escape' });
            expect(
                screen.getByRole('dialog', { name: 'Sign in on your phone' }),
            ).toBeInTheDocument();
            expect(server.deletes()).toEqual([]);
        },
    );

    it.each([
        ['Confirm', 'Type this number on your phone'],
        ['Decline', 'Sign-in declined'],
    ])(
        'moves focus back into the popover after %s, so Escape closes it',
        async (action, nextText) => {
            const user = userEvent.setup();
            const server = mockServer({
                isClaimed: true,
                appliesDecisions: true,
            });
            renderMenu(<MobileSignInMenu />);

            await user.click(openButton());
            const confirm = await screen.findByRole('group', {
                name: 'A phone wants to sign in as you',
            });
            await user.click(
                within(confirm).getByRole('button', { name: action }),
            );

            const popover = screen.getByRole('dialog', {
                name: 'Sign in on your phone',
            });
            await within(popover).findByText(nextText);
            await waitFor(() =>
                expect(
                    screen.queryByRole('group', {
                        name: 'A phone wants to sign in as you',
                    }),
                ).not.toBeInTheDocument(),
            );
            await waitFor(() =>
                expect(popover.contains(document.activeElement)).toBe(true),
            );

            await user.keyboard('{Escape}');

            await waitFor(() =>
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
            );
            expect(openButton()).toHaveFocus();
            if (action === 'Confirm') {
                await waitFor(() =>
                    expect(server.deletes()).toEqual([
                        '/user/mobile/sign-in-codes/code-1',
                    ]),
                );
            }
        },
    );

    const openDeclinedCode = async (
        user: ReturnType<typeof userEvent.setup>,
    ) => {
        await user.click(openButton());
        const confirm = await screen.findByRole('group', {
            name: 'A phone wants to sign in as you',
        });
        await user.click(
            within(confirm).getByRole('button', { name: 'Decline' }),
        );
        const popover = screen.getByRole('dialog', {
            name: 'Sign in on your phone',
        });
        await within(popover).findByText('Sign-in declined');
        await waitFor(() =>
            expect(popover.contains(document.activeElement)).toBe(true),
        );
        return popover;
    };

    it('moves focus back into the popover after the web Cancel, so Escape closes it', async () => {
        const user = userEvent.setup();
        mockServer({ isClaimed: true, appliesDecisions: true });
        renderMenu(<MobileSignInMenu />);

        await user.click(openButton());
        const confirm = await screen.findByRole('group', {
            name: 'A phone wants to sign in as you',
        });
        await user.click(
            within(confirm).getByRole('button', { name: 'Confirm' }),
        );
        const popover = screen.getByRole('dialog', {
            name: 'Sign in on your phone',
        });
        await within(popover).findByText('Type this number on your phone');
        const cancel = within(popover).getByRole('button', { name: 'Cancel' });
        cancel.focus();
        await user.keyboard('{Enter}');

        await within(popover).findByText('Sign-in declined');
        await waitFor(() =>
            expect(popover.contains(document.activeElement)).toBe(true),
        );
        await user.keyboard('{Escape}');

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(openButton()).toHaveFocus();
    });

    it('moves focus back into the popover after Show a new code by keyboard, so Escape closes it', async () => {
        const user = userEvent.setup();
        const server = mockServer({ isClaimed: true, appliesDecisions: true });
        renderMenu(<MobileSignInMenu />);

        const popover = await openDeclinedCode(user);
        await user.tab();
        expect(
            within(popover).getByRole('button', { name: 'Show a new code' }),
        ).toHaveFocus();
        await user.keyboard('{Enter}');

        await within(popover).findByRole('img', { name: 'Sign-in QR code' });
        await waitFor(() => expect(server.mints()).toHaveLength(2));
        await waitFor(() =>
            expect(popover.contains(document.activeElement)).toBe(true),
        );
        await user.keyboard('{Escape}');

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(openButton()).toHaveFocus();
        await waitFor(() =>
            expect(server.deletes()).toContain(
                '/user/mobile/sign-in-codes/code-2',
            ),
        );
    });
});
