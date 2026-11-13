import { MobileSignInCodeStatus, type ApiError } from '@lightdash/common';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import { MobileSignInMenu } from './MobileSignInMenu';

vi.mock('../../api');
vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: { siteUrl: 'https://app.example.com' } }),
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

const openButton = () =>
    screen.getByRole('button', { name: 'Sign in on your phone' });

beforeEach(() => {
    api.mockReset();
    qrSignIn.enabled = true;
});

describe('MobileSignInMenu', () => {
    it('renders nothing and mints nothing with mobile-qr-sign-in off', () => {
        qrSignIn.enabled = false;
        const server = mockServer();
        const { container } = renderWithProviders(
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
        renderWithProviders(<MobileSignInMenu />);

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
        expect(within(popover).getByText('Waiting for scan')).toBeVisible();
        expect(server.mints()).toHaveLength(1);
    });

    it('closes on Escape and cancels the unused code', async () => {
        const user = userEvent.setup();
        const server = mockServer();
        renderWithProviders(<MobileSignInMenu />);

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
        renderWithProviders(<MobileSignInMenu />);

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
        renderWithProviders(<MobileSignInMenu />);

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
        renderWithProviders(<MobileSignInMenu />);

        await user.click(openButton());
        await screen.findByText("Couldn't create the code");
        await user.keyboard('{Escape}');

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(server.mints()).toHaveLength(1);
        expect(server.deletes()).toEqual([]);
    });

    it('stays open while the user confirms a phone in the dialog', async () => {
        const user = userEvent.setup();
        const server = mockServer({ isClaimed: true });
        renderWithProviders(<MobileSignInMenu />);

        await user.click(openButton());
        const confirm = await screen.findByRole('dialog', {
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
    });

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
            renderWithProviders(<MobileSignInMenu />);

            await user.click(openButton());
            const confirm = await screen.findByRole('dialog', {
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
                    screen.queryByRole('dialog', {
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
        const confirm = await screen.findByRole('dialog', {
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
        renderWithProviders(<MobileSignInMenu />);

        await user.click(openButton());
        const confirm = await screen.findByRole('dialog', {
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
        renderWithProviders(<MobileSignInMenu />);

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
