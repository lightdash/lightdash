import {
    LightdashMode,
    MobileSignInCodeStatus,
    MobileSignInRefusal,
    type MobileSignInCodeState,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import MobileSignInLandingPage from './MobileSignInLandingPage';
import { MobileSignInStep } from './MobileSignInStep';
import { MOBILE_SIGN_IN_LANDING_STRINGS } from './mobileStrings';
import { stripMobileSignInFragment } from './stripMobileSignInFragment';
import { type useMobileSignInCode } from './useMobileSignInCode';

const health = vi.hoisted(() => ({ mode: 'default' }));
vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: { mode: health.mode } }),
}));

let current: ReturnType<typeof useMobileSignInCode>;

const code = {
    codeUuid: 'code-1',
    signInUrl: 'https://app.example.com/m/sign-in#c=code-1',
    approvalNonce: 'nonce-1',
    expiresAt: '2026-11-09T12:02:00.000Z',
    expiresInSeconds: 120,
};

const claimedState: MobileSignInCodeState = {
    codeUuid: 'code-1',
    status: MobileSignInCodeStatus.CLAIMED,
    expiresAt: '2026-11-09T12:05:00.000Z',
    matchNumber: null,
    declinedBy: null,
    device: { platform: 'ios', clientName: 'Lightdash iOS' },
};

const approvedState: MobileSignInCodeState = {
    ...claimedState,
    status: MobileSignInCodeStatus.APPROVED,
    matchNumber: '47',
};

const mockSignIn = (
    overrides: Partial<ReturnType<typeof useMobileSignInCode>>,
) => {
    const value: ReturnType<typeof useMobileSignInCode> = {
        phase: 'hidden',
        code: null,
        state: null,
        refusal: null,
        mintError: null,
        isRefreshed: false,
        isMinting: false,
        isDeciding: false,
        show: vi.fn(),
        hide: vi.fn(),
        approve: vi.fn(),
        decline: vi.fn(),
        ...overrides,
    };
    current = value;
    return value;
};

const renderStep = () =>
    renderWithProviders(<MobileSignInStep signIn={current} />);

describe('MobileSignInStep', () => {
    it('offers Show sign-in code when the code is hidden', async () => {
        const signIn = mockSignIn({});
        renderStep();
        expect(
            screen.queryByRole('img', {
                name: 'Sign-in QR code',
            }),
        ).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Show sign-in code' }),
        );
        expect(signIn.show).toHaveBeenCalledOnce();
    });

    it('shows a loader instead of the button while the code is created', () => {
        mockSignIn({ isMinting: true });
        renderStep();
        expect(screen.getByLabelText('Creating the code')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Show sign-in code' }),
        ).not.toBeInTheDocument();
    });

    it('shows the QR code without a timer or a control to hide it', async () => {
        mockSignIn({
            phase: 'showing',
            code,
        });
        renderStep();
        expect(
            await screen.findByRole('img', {
                name: 'Sign-in QR code',
            }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/sign-in#c=/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('marks an auto-refreshed code as new', () => {
        mockSignIn({
            phase: 'showing',
            code,
            isRefreshed: true,
        });
        renderStep();
        expect(screen.getByText('New code')).toBeInTheDocument();
    });

    it('asks the user to confirm with the device and no account email', async () => {
        const signIn = mockSignIn({
            phase: 'claimed',
            code,
            state: claimedState,
        });
        renderStep();
        const dialog = await screen.findByRole('group', {
            name: 'A phone wants to sign in as you',
        });
        expect(within(dialog).getByText('Device')).toBeVisible();
        expect(within(dialog).getByText('iOS')).toBeVisible();
        expect(within(dialog).queryByText('Account')).not.toBeInTheDocument();
        expect(within(dialog).queryByText(/@/)).not.toBeInTheDocument();
        expect(within(dialog).getByText('iOS')).toBeVisible();
        expect(within(dialog).queryByText('4 7')).not.toBeInTheDocument();
        expect(
            within(dialog).queryByText('Type this number on your phone'),
        ).not.toBeInTheDocument();
        expect(
            within(dialog).queryByText(/Expires in/),
        ).not.toBeInTheDocument();

        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Confirm' }),
        );
        expect(signIn.approve).toHaveBeenCalledOnce();
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Decline' }),
        );
        expect(signIn.decline).toHaveBeenCalledOnce();
    });

    it('shows the number to type after the confirm', () => {
        mockSignIn({
            phase: 'approved',
            code,
            state: approvedState,
        });
        renderStep();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            screen.getByText('Type this number on your phone'),
        ).toBeVisible();
        expect(screen.getByText('4 7')).toBeInTheDocument();
    });

    it('cancels the confirmed sign-in from the number view', async () => {
        const signIn = mockSignIn({
            phase: 'approved',
            code,
            state: approvedState,
        });
        renderStep();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(signIn.decline).toHaveBeenCalledOnce();
        expect(signIn.approve).not.toHaveBeenCalled();
    });

    it.each([
        ['phone', 'Sign-in cancelled on the phone'],
        ['failed_redeems', 'Too many wrong numbers'],
        ['web', 'Sign-in declined'],
        [null, 'Sign-in declined'],
    ] as const)(
        'explains a decline by %s and offers a new code',
        async (declinedBy, title) => {
            const signIn = mockSignIn({
                phase: 'declined',
                code,
                state: {
                    ...claimedState,
                    status: MobileSignInCodeStatus.DECLINED,
                    declinedBy,
                },
            });
            renderStep();
            expect(screen.getByText(title)).toBeVisible();
            expect(screen.queryByText('4 7')).not.toBeInTheDocument();
            await userEvent.click(
                screen.getByRole('button', { name: 'Show a new code' }),
            );
            expect(signIn.show).toHaveBeenCalledOnce();
        },
    );

    it('offers a new code after expiry or a decline', async () => {
        const signIn = mockSignIn({ phase: 'expired', code });
        const { unmount } = renderStep();
        expect(screen.getByText('Code expired')).toBeVisible();
        await userEvent.click(
            screen.getByRole('button', { name: 'Show a new code' }),
        );
        expect(signIn.show).toHaveBeenCalledOnce();
        unmount();

        mockSignIn({ phase: 'declined', code });
        renderStep();
        expect(screen.getByText('Sign-in declined')).toBeVisible();
    });

    it('confirms the sign-in and offers another phone', async () => {
        const signIn = mockSignIn({
            phase: 'redeemed',
            code,
            state: { ...claimedState, status: MobileSignInCodeStatus.REDEEMED },
        });
        renderStep();
        expect(screen.getByText('Signed in on a phone')).toBeVisible();
        expect(screen.getByText('iOS')).toBeVisible();
        expect(screen.queryByText(/@/)).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Sign in another phone' }),
        );
        expect(signIn.show).toHaveBeenCalledOnce();
    });

    it('points managed users to Microsoft sign-in instead of a code', () => {
        mockSignIn({
            phase: 'refused',
            refusal: MobileSignInRefusal.MANAGED_SIGN_IN_REQUIRED,
        });
        renderStep();
        expect(
            screen.getByText('Use Microsoft sign-in in the app'),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Show sign-in code' }),
        ).not.toBeInTheDocument();
    });

    it.each([
        [
            MobileSignInRefusal.EMAIL_UNVERIFIED,
            'Verify your email to sign in on a phone.',
        ],
        [
            MobileSignInRefusal.ORGANIZATION_REQUIRED,
            'Join an organization to sign in on a phone.',
        ],
        [MobileSignInRefusal.RATE_LIMITED, 'Too many codes. Try again later.'],
    ])('explains the %s refusal', (refusal, message) => {
        mockSignIn({ phase: 'refused', refusal });
        renderStep();
        expect(screen.getByText(message)).toBeVisible();
    });

    it('keeps the waiting status for screen readers only', () => {
        mockSignIn({ phase: 'showing', code });
        renderStep();
        expect(screen.getByText('Waiting for scan')).toHaveAttribute(
            'aria-live',
            'polite',
        );
    });

    it('confirms inline with no dialog and focuses Decline first', async () => {
        mockSignIn({ phase: 'claimed', code, state: claimedState });
        renderStep();
        const group = await screen.findByRole('group', {
            name: 'A phone wants to sign in as you',
        });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            within(group).getByRole('button', { name: 'Decline' }),
        ).toHaveFocus();
        expect(
            screen.getByText('A phone wants to sign in as you', {
                selector: '[aria-live]',
            }),
        ).toBeInTheDocument();
    });

    it('announces the number after confirming, with no control to hide it', () => {
        mockSignIn({
            phase: 'approved',
            code,
            state: approvedState,
        });
        renderStep();
        expect(
            screen.getByText('Type this number on your phone: 4 7'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Hide code' }),
        ).not.toBeInTheDocument();
    });

    it('hides the device row when the phone reported no platform', async () => {
        mockSignIn({
            phase: 'claimed',
            code,
            state: { ...claimedState, device: null },
        });
        renderStep();
        const dialog = await screen.findByRole('group', {
            name: 'A phone wants to sign in as you',
        });
        expect(within(dialog).queryByText('Device')).not.toBeInTheDocument();
        expect(
            within(dialog).queryByRole('button', { name: /close/i }),
        ).not.toBeInTheDocument();
    });

    it('shows a short title and never the server message when the code cannot be created', async () => {
        const signIn = mockSignIn({
            phase: 'failed',
            mintError: {
                status: 'error',
                error: {
                    name: 'UnexpectedServerError',
                    statusCode: 500,
                    message: 'database timeout at node-0000-test',
                    data: {},
                },
            },
        });
        renderStep();
        expect(screen.getByText("Couldn't create the code")).toBeVisible();
        expect(screen.queryByText(/database timeout/)).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try again' }),
        );
        expect(signIn.show).toHaveBeenCalledOnce();
    });
});

describe('MobileSignInLandingPage', () => {
    beforeEach(() => {
        health.mode = LightdashMode.DEFAULT;
    });

    it('keeps the original copy and store links outside Cloud', () => {
        renderWithProviders(<MobileSignInLandingPage />);
        expect(
            screen.getByText(MOBILE_SIGN_IN_LANDING_STRINGS.body),
        ).toBeVisible();
        expect(
            screen.getByRole('heading', {
                name: 'Get the Lightdash app',
            }),
        ).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Download on the App Store' }),
        ).toBeVisible();
    });

    it.each(Object.values(LightdashMode))(
        'uses the correct copy in %s mode',
        (mode) => {
            health.mode = mode;
            renderWithProviders(<MobileSignInLandingPage />);

            const expected =
                mode === LightdashMode.CLOUD_BETA
                    ? MOBILE_SIGN_IN_LANDING_STRINGS.cloudBody
                    : MOBILE_SIGN_IN_LANDING_STRINGS.body;
            expect(screen.getByText(expected)).toBeVisible();
        },
    );
});

describe('stripMobileSignInFragment', () => {
    const fakeWindow = (pathname: string) => {
        const replaceState = vi.fn();
        return {
            replaceState,
            target: {
                location: { pathname, search: '?x=1' },
                history: { state: { key: 'k' }, replaceState },
            } as unknown as Pick<Window, 'location' | 'history'>,
        };
    };

    it('drops the fragment from /m/sign-in before anything reads the URL', () => {
        const { target, replaceState } = fakeWindow('/m/sign-in');
        stripMobileSignInFragment(target);
        expect(replaceState).toHaveBeenCalledWith(
            { key: 'k' },
            '',
            '/m/sign-in?x=1',
        );
    });

    it('leaves other pages alone', () => {
        const { target, replaceState } = fakeWindow('/projects');
        stripMobileSignInFragment(target);
        expect(replaceState).not.toHaveBeenCalled();
    });
});
