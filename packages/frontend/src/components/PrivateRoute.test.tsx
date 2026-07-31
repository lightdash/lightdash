import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import PrivateRoute from './PrivateRoute';

const state = vi.hoisted(() => ({
    isAuthenticated: true,
    user: undefined as { organizationUuid?: string } | undefined,
    isUserError: false,
    account: undefined as { registered: boolean } | undefined,
    isAccountError: false,
}));

vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        health: {
            isInitialLoading: false,
            error: null,
            data: { isAuthenticated: state.isAuthenticated },
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
            ? { isRegisteredUser: () => state.account!.registered }
            : undefined,
        isError: state.isAccountError,
    }),
}));

vi.mock('../hooks/useEmailVerification', () => ({
    useEmailStatus: () => ({
        data: { isVerified: true },
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
        <MantineProvider>
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
});
