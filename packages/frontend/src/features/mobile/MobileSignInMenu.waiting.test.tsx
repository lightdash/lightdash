import { LightdashMode, type MobileSignInCode } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { MobileSignInMenu } from './MobileSignInMenu';
import { MOBILE_SIGN_IN_STRINGS } from './mobileStrings';
import { type useMobileSignInCode } from './useMobileSignInCode';

type SignIn = ReturnType<typeof useMobileSignInCode>;

const CODE: MobileSignInCode = {
    codeUuid: 'code-1',
    signInUrl: 'https://app.example.com/m/sign-in#c=code-1',
    approvalNonce: 'nonce-1',
    expiresAt: new Date(0).toISOString(),
    expiresInSeconds: 120,
};

const mintingSignIn = (code: MobileSignInCode | null): SignIn => ({
    phase: 'hidden',
    code,
    state: null,
    refusal: null,
    mintError: null,
    isRefreshed: false,
    isMinting: true,
    isDeciding: false,
    show: vi.fn(),
    hide: vi.fn(),
    approve: vi.fn(),
    decline: vi.fn(),
});

const signIn = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('./useMobileSignInCode', () => ({
    useMobileSignInCode: () => signIn.current,
}));
vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({
        data: {
            siteUrl: 'https://app.example.com',
            mode: LightdashMode.DEFAULT,
        },
    }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { id: 'mobile-qr-sign-in', enabled: true },
    }),
}));

const stepsList = () =>
    screen.queryByRole('list', {
        name: MOBILE_SIGN_IN_STRINGS.rescanSteps.title,
    });

const renderOpenMenu = async () => {
    renderWithProviders(
        <MemoryRouter initialEntries={['/projects/p1/saved/c1']}>
            <MobileSignInMenu />
        </MemoryRouter>,
    );
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in on your phone' }),
    );
    await screen.findByLabelText('Creating the code');
};

beforeEach(() => {
    signIn.current = null;
});

describe('MobileSignInMenu steps while a code is minted', () => {
    it('shows the steps while the first code is created', async () => {
        signIn.current = mintingSignIn(null);
        await renderOpenMenu();
        expect(stepsList()).toBeInTheDocument();
    });

    it('hides the steps when the idle stop leaves a refresh mint pending', async () => {
        signIn.current = mintingSignIn(CODE);
        await renderOpenMenu();
        expect(document.querySelector('[data-idle]')).toHaveAttribute(
            'data-idle',
            'true',
        );
        expect(stepsList()).not.toBeInTheDocument();
    });
});
