import { LightdashMode } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nock from 'nock';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_API_URL } from '../../api';
import { type UserWithAbility } from '../../hooks/user/useUser';
import { useUserCompleteMutation } from '../../hooks/user/useUserCompleteMutation';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
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

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

const mockFeatureFlag = (enabled: boolean) => {
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data: { id: 'organization-setup-page', enabled },
        isLoading: false,
    } as ReturnType<typeof useServerFeatureFlag>);
};

const renderModal = (mocks?: Parameters<typeof renderWithProviders>[1]) =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
            <UserCompletionModal />
        </MemoryRouter>,
        mocks,
    );

describe('UserCompletionModal', () => {
    beforeEach(() => {
        mockFeatureFlag(false);
    });

    it("should not render anything if user's setup is complete", async () => {
        renderModal();
        // Wait a bit to ensure component has rendered, then verify no dialog appears
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    it("should render user completion modal if user's setup is not complete", async () => {
        renderModal({
            user: {
                isSetupComplete: false,
            },
        });

        const welcomeModal = await screen.findByRole('dialog');
        expect(welcomeModal).toBeInTheDocument();
        expect(
            within(welcomeModal).getByText('Nearly there...'),
        ).toBeInTheDocument();
    });

    it('should not show organization name input if organization already has organization name', async () => {
        renderModal({
            user: {
                isSetupComplete: false,
                organizationName: 'test organization',
            },
        });

        const welcomeModal = await screen.findByRole('dialog');
        expect(welcomeModal).toBeInTheDocument();
        expect(
            within(welcomeModal).getByText('Nearly there...'),
        ).toBeInTheDocument();

        const nameInput = screen.queryByPlaceholderText('Enter company name');
        expect(nameInput).not.toBeInTheDocument();
    });

    it('should show organization name input if organization does not have organization name', async () => {
        renderModal({
            user: {
                isSetupComplete: false,
                organizationName: '',
            },
        });

        const welcomeModal = await screen.findByRole('dialog');
        expect(welcomeModal).toBeInTheDocument();
        expect(
            within(welcomeModal).getByText('Nearly there...'),
        ).toBeInTheDocument();

        const nameInput =
            await screen.findByPlaceholderText('Enter company name');
        expect(nameInput).toBeInTheDocument();
    });

    it("should not show email domain checkbox if user's email provider is from common email providers", async () => {
        renderModal({
            user: {
                isSetupComplete: false,
                organizationName: '',
                email: 'demo@gmail.com',
            },
        });

        const welcomeModal = await screen.findByRole('dialog');
        expect(welcomeModal).toBeInTheDocument();
        expect(
            within(welcomeModal).getByText('Nearly there...'),
        ).toBeInTheDocument();

        const emailDomainCheckbox = screen.queryByRole('checkbox', {
            name: `Allow users with @gmail.com to join the organization as a viewer`,
        });
        expect(emailDomainCheckbox).not.toBeInTheDocument();
    });

    it('should show email domain checkbox if user is using custom email provider', async () => {
        renderModal({
            user: {
                isSetupComplete: false,
                organizationName: '',
                email: 'demo@lightdash.com',
            },
        });

        const welcomeModal = await screen.findByRole('dialog');
        expect(welcomeModal).toBeInTheDocument();
        expect(
            within(welcomeModal).getByText('Nearly there...'),
        ).toBeInTheDocument();

        const emailDomainCheckbox = await screen.findByRole('checkbox', {
            name: `Allow users with @lightdash.com to join the organization as a viewer`,
        });
        expect(emailDomainCheckbox).toBeInTheDocument();
    });

    it("should not show anonymize tracking checkbox if organization's mode is cloud beta", async () => {
        renderModal({
            user: {
                isSetupComplete: false,
                organizationName: '',
            },
            health: {
                mode: LightdashMode.CLOUD_BETA,
            },
        });

        const welcomeModal = await screen.findByRole('dialog');
        expect(welcomeModal).toBeInTheDocument();
        expect(
            within(welcomeModal).getByText('Nearly there...'),
        ).toBeInTheDocument();

        const anonymizeTrackingCheckbox = screen.queryByRole('checkbox', {
            name: `Anonymize my usage data`,
        });
        expect(anonymizeTrackingCheckbox).not.toBeInTheDocument();
    });

    it('should show anonymize tracking checkbox if organization is not cloud beta', async () => {
        renderModal({
            user: {
                isSetupComplete: false,
                organizationName: '',
            },
            health: {
                mode: LightdashMode.DEFAULT,
            },
        });

        const welcomeModal = await screen.findByRole('dialog');
        expect(welcomeModal).toBeInTheDocument();
        expect(
            within(welcomeModal).getByText('Nearly there...'),
        ).toBeInTheDocument();

        const anonymizeTrackingCheckbox = await screen.findByRole('checkbox', {
            name: `Anonymize my usage data`,
        });
        expect(anonymizeTrackingCheckbox).toBeInTheDocument();
    });

    it("should submit user's completion with correct data", async () => {
        const user = userEvent.setup();

        renderModal({
            user: {
                isSetupComplete: false,
                organizationName: '',
                email: 'demo@lightdash.com',
            },
            health: {
                mode: LightdashMode.DEFAULT,
            },
        });

        // submit button should be disabled until organization name and role are filled
        const submitButton = await screen.findByRole('button', {
            name: 'Next',
        });
        expect(submitButton).toBeDisabled();

        // fill in organization name
        const nameInput =
            await screen.findByPlaceholderText('Enter company name');
        expect(nameInput).toBeInTheDocument();
        await user.type(nameInput, 'test organization');

        // select role
        const roleSelect =
            await screen.findByPlaceholderText('Select your role');
        expect(roleSelect).toBeInTheDocument();
        await user.click(roleSelect);
        const roleOption = await screen.findByText('Software Engineer');
        await user.click(roleOption);

        // uncheck email domain checkbox (checked by default)
        const emailDomainCheckbox = await screen.findByRole('checkbox', {
            name: `Allow users with @lightdash.com to join the organization as a viewer`,
        });
        expect(emailDomainCheckbox).toBeInTheDocument();
        expect(emailDomainCheckbox).toBeChecked();
        await user.click(emailDomainCheckbox);

        // uncheck subscription checkbox (unchecked by default)
        const subscriptionCheckbox = await screen.findByRole('checkbox', {
            name: `Keep me updated on new Lightdash features`,
        });
        expect(subscriptionCheckbox).toBeInTheDocument();
        expect(subscriptionCheckbox).toBeChecked();
        await user.click(subscriptionCheckbox);

        // check tracking checkbox (unchecked by default)
        const trackingCheckbox = await screen.findByRole('checkbox', {
            name: `Anonymize my usage data`,
        });
        expect(trackingCheckbox).toBeInTheDocument();
        expect(trackingCheckbox).not.toBeChecked();
        await user.click(trackingCheckbox);

        // submit button should be enabled now
        expect(submitButton).toBeEnabled();

        // mock api call
        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete', {
                organizationName: 'test organization',
                jobTitle: 'Software Engineer',
                howDidYouHearAboutUs: '',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: false,
                isTrackingAnonymized: true,
            })
            .reply(200);

        // submit form
        await user.click(submitButton);

        // wait for api call to be made
        scope.done();
        await waitFor(() => expect(scope.isDone()).toBe(true));
    });

    it("should not submit organization name and email domain if user's organization already has organization name", async () => {
        const user = userEvent.setup();

        renderModal({
            user: {
                isSetupComplete: false,
                organizationName: 'test organization',
            },
        });

        // submit button should be disabled until role is filled
        const submitButton = await screen.findByRole('button', {
            name: 'Next',
        });
        expect(submitButton).toBeDisabled();

        // organization name input should not be visible
        const nameInput = screen.queryByPlaceholderText('Enter company name');
        expect(nameInput).not.toBeInTheDocument();

        // email domain checkbox should not be visible
        const emailDomainCheckbox = screen.queryByRole('checkbox', {
            name: `Allow users with @lightdash.com to join the organization as a viewer`,
        });
        expect(emailDomainCheckbox).not.toBeInTheDocument();

        // select role
        const roleSelect =
            await screen.findByPlaceholderText('Select your role');
        expect(roleSelect).toBeInTheDocument();
        await user.click(roleSelect);
        const roleOption = await screen.findByText('Software Engineer');
        await user.click(roleOption);

        // submit button should be enabled now
        expect(submitButton).toBeEnabled();

        // mock api call
        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete', {
                jobTitle: 'Software Engineer',
                howDidYouHearAboutUs: '',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            })
            .reply(200);

        // submit form
        await user.click(submitButton);

        // wait for api call to be made
        scope.done();
        await waitFor(() => expect(scope.isDone()).toBe(true));
    });

    it('should render the how did you hear about us input', async () => {
        renderModal({
            user: {
                isSetupComplete: false,
                organizationName: 'test organization',
            },
        });

        const welcomeModal = await screen.findByRole('dialog');
        expect(
            within(welcomeModal).getByLabelText('How did you hear about us?'),
        ).toBeInTheDocument();
    });

    it('should submit the trimmed how did you hear about us answer', async () => {
        const user = userEvent.setup();

        renderModal({
            user: {
                isSetupComplete: false,
                organizationName: 'test organization',
            },
        });

        const submitButton = await screen.findByRole('button', {
            name: 'Next',
        });

        const roleSelect =
            await screen.findByPlaceholderText('Select your role');
        await user.click(roleSelect);
        const roleOption = await screen.findByText('Software Engineer');
        await user.click(roleOption);

        const referralInput = await screen.findByLabelText(
            'How did you hear about us?',
        );
        await user.type(referralInput, '  a podcast  ');

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete', {
                jobTitle: 'Software Engineer',
                howDidYouHearAboutUs: 'a podcast',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            })
            .reply(200);

        await user.click(submitButton);

        scope.done();
        await waitFor(() => expect(scope.isDone()).toBe(true));
    });

    it('should redirect to the organization setup page when the flag is enabled and setup is incomplete', async () => {
        mockFeatureFlag(true);

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
        mockFeatureFlag(true);
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
        mockFeatureFlag(true);
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
        mockFeatureFlag(true);

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
