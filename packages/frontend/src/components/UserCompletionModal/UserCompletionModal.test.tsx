import { useQueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nock from 'nock';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BASE_API_URL } from '../../api';
import { type UserWithAbility } from '../../hooks/user/useUser';
import { useUserCompleteMutation } from '../../hooks/user/useUserCompleteMutation';
import useApp from '../../providers/App/useApp';
import { renderWithProviders } from '../../testing/testUtils';
import UserCompletionModal from './UserCompletionModal';

const CompleteSetupHarness = () => {
    const navigate = useNavigate();
    const { mutate } = useUserCompleteMutation();
    return (
        <button
            type="button"
            onClick={() => {
                mutate({
                    organizationName: 'test organization',
                    jobTitle: 'Software Engineer',
                    howDidYouHearAboutUs: '',
                    enableEmailDomainAccess: false,
                    isMarketingOptedIn: true,
                    isTrackingAnonymized: false,
                });
                void navigate('/');
            }}
        >
            Complete setup
        </button>
    );
};

const SetupStateProbe = () => {
    const { user } = useApp();
    return (
        <div>
            {user.data?.isSetupComplete ? 'setup complete' : 'setup incomplete'}
        </div>
    );
};

const StaleUserRefetchHarness = () => {
    const queryClient = useQueryClient();

    return (
        <button
            type="button"
            onClick={() => {
                queryClient.setQueryData<UserWithAbility>(
                    ['user'],
                    (currentUser) =>
                        currentUser
                            ? { ...currentUser, isSetupComplete: false }
                            : currentUser,
                );
            }}
        >
            Deliver stale user
        </button>
    );
};

describe('UserCompletionModal', () => {
    it('should redirect to the organization setup page when setup is incomplete', async () => {
        renderWithProviders(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="/" element={<UserCompletionModal />} />
                    <Route
                        path="/organization-setup"
                        element={<div>Organization setup page</div>}
                    />
                </Routes>
            </MemoryRouter>,
            {
                user: {
                    isSetupComplete: false,
                    organizationName: '',
                },
            },
        );

        expect(
            await screen.findByText('Organization setup page'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Nearly there...')).not.toBeInTheDocument();
    });

    it('does not redirect after a stale refetch follows setup completion', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <>
                                <UserCompletionModal />
                                <StaleUserRefetchHarness />
                                <div>Home page</div>
                            </>
                        }
                    />
                    <Route
                        path="/organization-setup"
                        element={<div>Organization setup page</div>}
                    />
                </Routes>
            </MemoryRouter>,
            {
                user: {
                    isSetupComplete: true,
                },
            },
        );

        await user.click(
            await screen.findByRole('button', { name: 'Deliver stale user' }),
        );

        expect(screen.getByText('Home page')).toBeInTheDocument();
        expect(
            screen.queryByText('Organization setup page'),
        ).not.toBeInTheDocument();
    });

    it('does not bounce back to organization setup while user setup is completing', async () => {
        const user = userEvent.setup();

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete')
            .delay(100)
            .reply(200, {
                status: 'ok',
                results: {
                    isSetupComplete: true,
                    organizationName: 'test organization',
                },
            });

        renderWithProviders(
            <MemoryRouter initialEntries={['/organization-setup']}>
                <Routes>
                    <Route
                        path="/organization-setup"
                        element={
                            <>
                                <CompleteSetupHarness />
                                <div>Organization setup page</div>
                            </>
                        }
                    />
                    <Route
                        path="/"
                        element={
                            <>
                                <UserCompletionModal />
                                <SetupStateProbe />
                                <div>Home page</div>
                            </>
                        }
                    />
                </Routes>
            </MemoryRouter>,
            {
                user: {
                    isSetupComplete: false,
                    organizationName: '',
                },
            },
        );

        await user.click(
            await screen.findByRole('button', { name: 'Complete setup' }),
        );

        expect(await screen.findByText('Home page')).toBeInTheDocument();
        expect(await screen.findByText('setup incomplete')).toBeInTheDocument();
        expect(
            screen.queryByText('Organization setup page'),
        ).not.toBeInTheDocument();

        expect(await screen.findByText('setup complete')).toBeInTheDocument();
        await waitFor(() => expect(scope.isDone()).toBe(true));
        expect(screen.getByText('Home page')).toBeInTheDocument();
        expect(
            screen.queryByText('Organization setup page'),
        ).not.toBeInTheDocument();
    });

    it('still redirects to organization setup when telemetry is disabled', async () => {
        renderWithProviders(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="/" element={<UserCompletionModal />} />
                    <Route
                        path="/organization-setup"
                        element={<div>Organization setup page</div>}
                    />
                </Routes>
            </MemoryRouter>,
            {
                user: {
                    isSetupComplete: false,
                    organizationName: '',
                },
                health: {
                    rudder: {
                        writeKey: undefined,
                        dataPlaneUrl: undefined,
                    },
                },
            },
        );

        expect(
            await screen.findByText('Organization setup page'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Nearly there...')).not.toBeInTheDocument();
    });
});
