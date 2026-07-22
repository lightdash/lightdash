import { type ApiError } from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useEnsurePlaygroundProject } from '../../../hooks/useEnsurePlaygroundProject';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useUserUpdateMutation } from '../../../hooks/user/useUserUpdateMutation';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import SetupInviteModal from './SetupInviteModal';

vi.mock('../../../hooks/organization/useOrganization');
vi.mock('../../../hooks/useEnsurePlaygroundProject');
vi.mock('../../../hooks/useInviteLink');
vi.mock('../../../hooks/useServerOrClientFeatureFlag');
vi.mock('../../../hooks/user/useUserUpdateMutation');
vi.mock('../../../providers/App/useApp');
vi.mock('../../../providers/Tracking/useTracking');
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useNavigate: () => navigate,
}));

const inviteLink = {
    email: 'expert@company.com',
    inviteUrl: 'https://lightdash.test/invite/abc',
};

const apiError = (name: string, message: string): ApiError => ({
    status: 'error',
    error: { name, statusCode: 404, message, data: {} },
});

let createInvite: ReturnType<typeof vi.fn>;
let ensurePlayground: ReturnType<typeof vi.fn>;

const mockInviteCreated = (created: boolean) => {
    vi.mocked(useCreateInviteLinkMutation).mockReturnValue({
        data: created ? inviteLink : undefined,
        mutateAsync: createInvite,
        reset: vi.fn(),
        isLoading: false,
    } as unknown as ReturnType<typeof useCreateInviteLinkMutation>);
};

const renderModal = () =>
    render(
        <MantineProvider>
            <MemoryRouter>
                <SetupInviteModal opened onClose={vi.fn()} />
            </MemoryRouter>
        </MantineProvider>,
    );

const submitInvite = async () => {
    await userEvent.type(
        screen.getByRole('textbox', { name: /their email address/i }),
        inviteLink.email,
    );
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }));
};

describe('SetupInviteModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createInvite = vi.fn().mockResolvedValue(inviteLink);
        ensurePlayground = vi
            .fn()
            .mockResolvedValue({ projectUuid: 'playground-uuid' });

        vi.mocked(useApp).mockReturnValue({
            health: { data: { hasEmailClient: true } },
            user: { data: { firstName: 'Ada', lastName: 'Lovelace' } },
        } as unknown as ReturnType<typeof useApp>);
        vi.mocked(useTracking).mockReturnValue({
            track: vi.fn(),
        } as unknown as ReturnType<typeof useTracking>);
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: true },
        } as unknown as ReturnType<typeof useServerFeatureFlag>);
        vi.mocked(useOrganization).mockReturnValue({
            data: { needsProject: true },
        } as ReturnType<typeof useOrganization>);
        vi.mocked(useUserUpdateMutation).mockReturnValue({
            mutateAsync: vi.fn(),
            isLoading: false,
        } as unknown as ReturnType<typeof useUserUpdateMutation>);
        vi.mocked(useEnsurePlaygroundProject).mockReturnValue({
            mutateAsync: ensurePlayground,
            isLoading: false,
        } as unknown as ReturnType<typeof useEnsurePlaygroundProject>);
        mockInviteCreated(false);
    });

    it('navigates into the playground when provisioning succeeds', async () => {
        renderModal();
        await submitInvite();

        await waitFor(() => {
            expect(navigate).toHaveBeenCalledWith(
                '/projects/playground-uuid/home',
            );
        });
    });

    it('explains an unavailable instance and keeps the invite as a fallback', async () => {
        ensurePlayground.mockRejectedValue(
            apiError('NotFoundError', 'Playground projects are not available'),
        );
        const { rerender } = renderModal();
        await submitInvite();
        mockInviteCreated(true);
        rerender(
            <MantineProvider>
                <MemoryRouter>
                    <SetupInviteModal opened onClose={vi.fn()} />
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(
            await screen.findByText(/couldn't set up a sample project/i),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/aren't available on this instance/i),
        ).toBeInTheDocument();
        expect(screen.getByText('Invite ready')).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: /try again/i }),
        ).not.toBeInTheDocument();
    });

    it('offers a retry for unrecognised failures', async () => {
        ensurePlayground.mockRejectedValue(
            apiError('UnexpectedServerError', 'boom'),
        );
        const { rerender } = renderModal();
        await submitInvite();
        mockInviteCreated(true);
        rerender(
            <MantineProvider>
                <MemoryRouter>
                    <SetupInviteModal opened onClose={vi.fn()} />
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(
            await screen.findByText(/something went wrong while preparing/i),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /try again/i }),
        ).toBeInTheDocument();
    });

    it('skips provisioning when the organization already has a project', async () => {
        vi.mocked(useOrganization).mockReturnValue({
            data: { needsProject: false },
        } as ReturnType<typeof useOrganization>);
        renderModal();
        await submitInvite();

        await waitFor(() => {
            expect(createInvite).toHaveBeenCalled();
        });
        expect(ensurePlayground).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });
});
