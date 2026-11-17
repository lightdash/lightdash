import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import PrivateRoute from './PrivateRoute';

const state = vi.hoisted(() => ({
    isAuthenticated: true,
    user: undefined as { organizationUuid?: string } | undefined,
    isUserError: false,
    account: undefined as
        | { registered: boolean; serviceAccount?: boolean }
        | undefined,
    isAccountError: false,
    isAccountLoading: false,
    hasEmailClient: false,
    isEmailVerified: true as boolean | undefined,
}));

vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        health: {
            isInitialLoading: false,
            error: null,
            data: {
                isAuthenticated: state.isAuthenticated,
                hasEmailClient: state.hasEmailClient,
            },
        },
        user: {
            data: state.user ? { ...state.user, abilityRules: [] } : undefined,
            isInitialLoading: false,
            isError: state.isUserError,
        },
    }),
}));

vi.mock('../hooks/user/useAccount', () => ({
    useAccount: () => ({
        data: state.account
            ? {
                  isRegisteredUser: () => state.account!.registered,
                  isServiceAccount: () => !!state.account!.serviceAccount,
              }
            : undefined,
        isError: state.isAccountError,
        isInitialLoading: state.isAccountLoading,
    }),
}));

vi.mock('../hooks/useEmailVerification', () => ({
    useEmailStatus: () => ({
        data:
            state.isEmailVerified === undefined
                ? undefined
                : { isVerified: state.isEmailVerified },
        isInitialLoading: false,
    }),
}));

vi.mock('../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({ rules: [], update: vi.fn() }),
}));

vi.mock('./PageSpinner', () => ({
    default: () => <div data-testid="page-spinner" />,
}));

const renderPrivateRoute = () =>
    render(
        <MantineProvider env="test">
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <PrivateRoute>
                                <div>app</div>
                            </PrivateRoute>
                        }
                    />
                    <Route
                        path="/join-organization"
                        element={<div>join organization</div>}
                    />
                    <Route path="/login" element={<div>login</div>} />
                    <Route
                        path="/verify-email"
                        element={<div>verify email</div>}
                    />
                </Routes>
            </MemoryRouter>
        </MantineProvider>,
    );

describe('PrivateRoute', () => {
    beforeEach(() => {
        state.isAuthenticated = true;
        state.user = { organizationUuid: 'org-uuid' };
        state.isUserError = false;
        state.account = { registered: true };
        state.isAccountError = false;
        state.isAccountLoading = false;
        state.hasEmailClient = false;
        state.isEmailVerified = true;
    });

    it('renders its children for a user in an organization', () => {
        renderPrivateRoute();

        expect(screen.getByText('app')).toBeInTheDocument();
    });

    it('holds while the account is still on its way to enabling the user query', () => {
        state.user = undefined;
        state.account = undefined;

        renderPrivateRoute();

        expect(screen.getByTestId('page-spinner')).toBeInTheDocument();
        expect(screen.queryByText('join organization')).toBeNull();
    });

    // Both queries are retry:false, so a failed /user/account never enables the
    // user query — holding on it would be a spinner with no way out
    it('stops holding when the account query has failed', () => {
        state.user = undefined;
        state.account = undefined;
        state.isAccountError = true;

        renderPrivateRoute();

        expect(screen.getByText('join organization')).toBeInTheDocument();
        expect(screen.queryByTestId('page-spinner')).toBeNull();
    });

    it('stops holding when the account is not a registered user', () => {
        state.user = undefined;
        state.account = { registered: false };

        renderPrivateRoute();

        expect(screen.getByText('join organization')).toBeInTheDocument();
        expect(screen.queryByTestId('page-spinner')).toBeNull();
    });

    it('sends a user with no organization to join one', () => {
        state.user = {};

        renderPrivateRoute();

        expect(screen.getByText('join organization')).toBeInTheDocument();
    });

    it('sends an unauthenticated visitor to log in', () => {
        state.isAuthenticated = false;

        renderPrivateRoute();

        expect(screen.getByText('login')).toBeInTheDocument();
    });

    it('sends an unverified user to verify their email when an email client is set', () => {
        state.hasEmailClient = true;
        state.isEmailVerified = false;

        renderPrivateRoute();

        expect(screen.getByText('verify email')).toBeInTheDocument();
    });

    it('lets a service-account session past email verification when its email status is missing', () => {
        state.hasEmailClient = true;
        state.isEmailVerified = undefined;
        state.account = { registered: true, serviceAccount: true };

        renderPrivateRoute();

        expect(screen.getByText('app')).toBeInTheDocument();
        expect(screen.queryByText('verify email')).toBeNull();
    });

    it('holds before the email check while the account is still loading', () => {
        state.hasEmailClient = true;
        state.isEmailVerified = undefined;
        state.account = undefined;
        state.isAccountLoading = true;

        renderPrivateRoute();

        expect(screen.getByTestId('page-spinner')).toBeInTheDocument();
        expect(screen.queryByText('verify email')).toBeNull();
    });
});
