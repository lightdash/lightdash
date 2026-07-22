import {
    InviteLinkPurpose,
    OrganizationMemberRole,
    type ApiError,
} from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { EventName } from '../types/Events';
import OnboardingInviteExpert from './OnboardingInviteExpert';

type InviteLink = { email: string; inviteUrl: string };

const mocks = vi.hoisted(() => ({
    userName: { firstName: 'Ada', lastName: 'Lovelace' },
    canInvite: true,
    hasUser: true,
    needsProject: true,
    inviteLink: undefined as InviteLink | undefined,
    createInvite: vi.fn(),
    updateUser: vi.fn(),
    ensurePlayground: vi.fn(),
    track: vi.fn(),
}));

vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { hasEmailClient: true } },
        user: {
            data: mocks.hasUser
                ? {
                      ...mocks.userName,
                      organizationUuid: 'org-1',
                      ability: { can: () => mocks.canInvite },
                  }
                : undefined,
            isInitialLoading: false,
        },
    }),
}));

vi.mock('../providers/Tracking/useTracking', () => ({
    default: () => ({ track: mocks.track }),
}));

vi.mock('../hooks/useInviteLink', () => ({
    useCreateInviteLinkMutation: () => ({
        data: mocks.inviteLink,
        mutateAsync: mocks.createInvite,
        reset: vi.fn(),
        isLoading: false,
    }),
}));

vi.mock('../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: { needsProject: mocks.needsProject } }),
}));

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

vi.mock('../hooks/user/useUserUpdateMutation', () => ({
    useUserUpdateMutation: () => ({
        mutateAsync: mocks.updateUser,
        isLoading: false,
    }),
}));

vi.mock('../hooks/useEnsurePlaygroundProject', () => ({
    useEnsurePlaygroundProject: () => ({
        mutateAsync: mocks.ensurePlayground,
        isLoading: false,
    }),
}));

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: true },
        isLoading: false,
    }),
}));

vi.mock('../components/AboutFooter', () => ({ default: () => null }));

let currentPath = '/onboarding/invite-expert';
const PathProbe: FC = () => {
    currentPath = useLocation().pathname;
    return null;
};

type InitialEntry = string | { pathname: string; state: unknown };

const pageTree = (initialEntry: InitialEntry) => (
    <MantineProvider>
        <MemoryRouter
            initialEntries={[
                initialEntry as string & {
                    pathname: string;
                    state: unknown;
                },
            ]}
        >
            <PathProbe />
            <OnboardingInviteExpert />
        </MemoryRouter>
    </MantineProvider>
);

const renderPage = (
    initialEntry: InitialEntry = '/onboarding/invite-expert',
) => {
    const utils = render(pageTree(initialEntry));
    return {
        ...utils,
        rerenderPage: () => utils.rerender(pageTree(initialEntry)),
    };
};

const submitInvite = async (email = 'expert@example.com') => {
    await userEvent.type(screen.getByLabelText(/Their email address/), email);
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));
};

const apiError = (name: string, message: string): ApiError => ({
    status: 'error',
    error: { name, statusCode: 404, message, data: {} },
});

describe('OnboardingInviteExpert', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.userName = { firstName: 'Ada', lastName: 'Lovelace' };
        mocks.canInvite = true;
        mocks.hasUser = true;
        mocks.needsProject = true;
        mocks.inviteLink = undefined;
        mocks.createInvite.mockResolvedValue({});
        mocks.updateUser.mockResolvedValue({});
        mocks.ensurePlayground.mockResolvedValue({ projectUuid: 'p1' });
    });

    it('renders the invite form without name fields when the user has a name', () => {
        renderPage();
        expect(
            screen.getByRole('heading', {
                name: 'Invite someone to set this up',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText(/Their email address/),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText(/Your first name/)).toBeNull();
    });

    it('sends a setup invite, tracks events, and enters the playground', async () => {
        renderPage();
        await userEvent.type(
            screen.getByLabelText(/Their email address/),
            'expert@example.com',
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Send invite' }),
        );

        await waitFor(() => {
            expect(mocks.createInvite).toHaveBeenCalledWith({
                email: 'expert@example.com',
                role: OrganizationMemberRole.ADMIN,
                purpose: InviteLinkPurpose.Setup,
            });
        });
        expect(mocks.updateUser).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledWith({
            name: EventName.SETUP_INVITE_SENT,
        });

        await waitFor(() => {
            expect(currentPath).toBe('/projects/p1/home');
        });
        expect(mocks.track).toHaveBeenCalledWith({
            name: EventName.PLAYGROUND_PROJECT_ENTERED,
        });
    });

    it('backfills the trimmed user name before inviting when it is missing', async () => {
        mocks.userName = { firstName: '  ', lastName: '' };
        renderPage();

        await userEvent.type(screen.getByLabelText(/Your first name/), ' Ada ');
        await userEvent.type(
            screen.getByLabelText(/Your last name/),
            'Lovelace',
        );
        await userEvent.type(
            screen.getByLabelText(/Their email address/),
            'expert@example.com',
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Send invite' }),
        );

        await waitFor(() => {
            expect(mocks.updateUser).toHaveBeenCalledWith({
                firstName: 'Ada',
                lastName: 'Lovelace',
            });
        });
        expect(mocks.createInvite).toHaveBeenCalled();
    });

    it('fails closed with the permission state when the user query has no data', () => {
        mocks.hasUser = false;
        renderPage();
        expect(
            screen.getByText(/don't have permission to invite people/),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText(/Their email address/)).toBeNull();
    });

    it('shows a permission state instead of the form when the user cannot invite', () => {
        mocks.canInvite = false;
        renderPage();

        expect(
            screen.getByText(/don't have permission to invite people/),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText(/Their email address/)).toBeNull();
        expect(mocks.createInvite).not.toHaveBeenCalled();
    });

    it('Escape leaves the page', async () => {
        renderPage();
        await screen.findByRole('heading', {
            name: 'Invite someone to set this up',
        });

        fireEvent.keyDown(window, { key: 'Escape' });

        await waitFor(() => {
            expect(currentPath).toBe('/onboarding/data-source');
        });
    });

    it('explains an unavailable instance and keeps the invite as a fallback', async () => {
        mocks.ensurePlayground.mockRejectedValue(
            apiError('NotFoundError', 'Playground projects are not available'),
        );
        const { rerenderPage } = renderPage();
        await submitInvite();
        mocks.inviteLink = {
            email: 'expert@example.com',
            inviteUrl: 'https://lightdash.test/invite/abc',
        };
        rerenderPage();

        expect(
            await screen.findByText(/couldn't set up a sample project/i),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/aren't available on this instance/i),
        ).toBeInTheDocument();
        expect(screen.getByText('Invite ready')).toBeInTheDocument();
        expect(currentPath).toBe('/onboarding/invite-expert');
        expect(
            screen.queryByRole('button', { name: /try again/i }),
        ).not.toBeInTheDocument();
    });

    it('offers a retry for unrecognised failures', async () => {
        mocks.ensurePlayground.mockRejectedValue(
            apiError('UnexpectedServerError', 'boom'),
        );
        const { rerenderPage } = renderPage();
        await submitInvite();
        mocks.inviteLink = {
            email: 'expert@example.com',
            inviteUrl: 'https://lightdash.test/invite/abc',
        };
        rerenderPage();

        expect(
            await screen.findByText(/something went wrong while preparing/i),
        ).toBeInTheDocument();

        mocks.ensurePlayground.mockResolvedValue({ projectUuid: 'p1' });
        await userEvent.click(
            screen.getByRole('button', { name: /try again/i }),
        );

        await waitFor(() => {
            expect(currentPath).toBe('/projects/p1/home');
        });
    });

    it('skips provisioning when the organization already has a project', async () => {
        mocks.needsProject = false;
        renderPage();
        await submitInvite();

        await waitFor(() => {
            expect(mocks.createInvite).toHaveBeenCalled();
        });
        expect(mocks.ensurePlayground).not.toHaveBeenCalled();
        expect(currentPath).toBe('/onboarding/invite-expert');
    });

    it('Cancel returns to the page the CTA linked from', async () => {
        renderPage({
            pathname: '/onboarding/invite-expert',
            state: { returnTo: '/createProject' },
        });

        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => {
            expect(currentPath).toBe('/createProject');
        });
    });
});
