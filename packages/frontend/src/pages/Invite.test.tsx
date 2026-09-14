import {
    FeatureFlags,
    type InviteLinkPurpose,
    type InviteLinkWithAuthenticationOptions,
    type OpenIdIdentityIssuerType,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import MantineProvider from '../providers/MantineProvider';
import Invite from './Invite';

const mocks = vi.hoisted(() => ({
    activateInvite: vi.fn(),
    inviteLink: {
        expiresAt: new Date('2099-01-01'),
        inviteCode: 'invite-code',
        inviteUrl: 'http://localhost:3000/invite/invite-code',
        organizationUuid: 'organization-uuid',
        userUuid: 'user-uuid',
        email: 'invitee@lightdash.com',
        purpose: 'member' as InviteLinkPurpose,
        authentication: {
            allowOneClickActivation: false,
            allowPasswordSignup: false,
            ssoProviders: ['azuread' as OpenIdIdentityIssuerType],
        } as InviteLinkWithAuthenticationOptions['authentication'],
    } satisfies InviteLinkWithAuthenticationOptions,
}));

vi.mock('../hooks/useInviteLink', () => ({
    useInviteLink: () => ({
        data: mocks.inviteLink,
        error: null,
        isInitialLoading: false,
    }),
    useActivateInviteLinkMutation: () => ({
        mutate: mocks.activateInvite,
        isLoading: false,
        isSuccess: false,
    }),
}));

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { id: FeatureFlags.NewOnboarding, enabled: true },
        isInitialLoading: false,
    }),
}));

vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        health: {
            data: {
                isAuthenticated: false,
                auth: {
                    google: {
                        enabled: true,
                        loginPath: '/login/google',
                    },
                    azuread: {
                        enabled: false,
                    },
                },
            },
            isInitialLoading: false,
            status: 'success',
        },
    }),
}));

vi.mock('../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: { name: 'Lightdash' } }),
}));

vi.mock('../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastError: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));

vi.mock('../hooks/useFlashMessages', () => ({
    useFlashMessages: () => ({ data: undefined }),
}));

vi.mock('../providers/Tracking/useTracking', () => ({
    default: () => ({ identify: vi.fn() }),
}));

vi.mock('../components/common/AuthLayout', () => ({
    default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../components/RegisterForms/CreateUserForm', () => ({
    default: () => <div data-testid="password-signup" />,
}));

const renderInvite = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MantineProvider env="test">
                <MemoryRouter
                    initialEntries={['/invite/invite-code?from=email']}
                >
                    <Routes>
                        <Route
                            path="/invite/:inviteCode"
                            element={<Invite />}
                        />
                    </Routes>
                </MemoryRouter>
            </MantineProvider>
        </QueryClientProvider>,
    );
};

describe('Invite', () => {
    beforeEach(() => {
        mocks.inviteLink.authentication = {
            allowOneClickActivation: false,
            allowPasswordSignup: false,
            ssoProviders: ['azuread' as OpenIdIdentityIssuerType],
        };
    });

    test('requires the configured SSO provider when the invite disallows local authentication', async () => {
        renderInvite();

        const microsoftSignUp = await screen.findByRole('link', {
            name: /Sign up with Microsoft/,
        });
        expect(microsoftSignUp).toHaveAttribute(
            'href',
            '/api/v1/login/azuread?redirect=%2F&inviteCode=invite-code&login_hint=invitee%40lightdash.com',
        );
        expect(
            screen.queryByRole('button', {
                name: 'Continue as invitee@lightdash.com',
            }),
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId('password-signup')).not.toBeInTheDocument();
    });

    test('offers SSO alongside one-click activation when both are allowed', async () => {
        mocks.inviteLink.authentication.allowOneClickActivation = true;
        mocks.inviteLink.authentication.allowPasswordSignup = true;
        mocks.inviteLink.authentication.ssoProviders = [
            'google' as OpenIdIdentityIssuerType,
        ];
        renderInvite();

        expect(
            await screen.findByRole('button', {
                name: 'Continue as invitee@lightdash.com',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Sign up with Google/ }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('password-signup')).not.toBeInTheDocument();
    });
});
