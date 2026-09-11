import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { mockRoadmapProject, mockRoadmapResults } from './roadmap.mock';
import { roadmapApi } from './roadmapApi';
import { RoadmapProjects } from './RoadmapProjects';

const { showToastError, showToastSuccess } = vi.hoisted(() => ({
    showToastError: vi.fn(),
    showToastSuccess: vi.fn(),
}));
const confirmation = {
    message:
        'The request has been sent to the Lightdash team and will soon be reviewed',
};
let hasDirectNeed = false;
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError, showToastSuccess }),
}));

const renderRoadmap = (organizationUuid = 'org-1', canFollow = true) =>
    renderWithProviders(
        <MemoryRouter>
            <RoadmapProjects
                key={organizationUuid}
                canFollow={canFollow}
                cacheKey={`${organizationUuid}:user-1`}
            />
        </MemoryRouter>,
    );

describe('following roadmap projects', () => {
    beforeEach(() => {
        hasDirectNeed = false;
        showToastSuccess.mockReset();
        vi.spyOn(roadmapApi, 'followProject').mockImplementation(async () => {
            hasDirectNeed = true;
            return confirmation;
        });
        showToastError.mockReset();
        vi.spyOn(roadmapApi, 'getProjects').mockImplementation(
            async (query) => {
                const projects = [
                    { ...mockRoadmapProject('alpha'), hasDirectNeed },
                    { ...mockRoadmapProject('direct'), hasDirectNeed: true },
                    { ...mockRoadmapProject('tickets'), ownRequestCount: 2 },
                ].filter(
                    (group) =>
                        (!query.onlyInterested ||
                            group.hasDirectNeed ||
                            group.ownRequestCount > 0) &&
                        (!query.statuses ||
                            query.statuses
                                .split(',')
                                .includes(group.project.stage)),
                );
                return mockRoadmapResults(projects);
            },
        );
        vi.spyOn(roadmapApi, 'getRequests').mockResolvedValue({
            data: [],
            pagination: {
                page: 1,
                pageSize: 20,
                totalIssues: 0,
                totalPages: 0,
            },
            expiresAt: '2099-01-01T00:00:00Z',
            facets: {
                statusCounts: {
                    Backlog: 0,
                    Building: 0,
                    Shipped: 0,
                    Canceled: 0,
                },
                priorityCounts: {
                    Urgent: 0,
                    High: 0,
                    Medium: 0,
                    Low: 0,
                    'No priority': 0,
                },
            },
        });
    });

    afterEach(() => vi.restoreAllMocks());

    const showAllProjects = async () => {
        await screen.findByRole('button', { name: 'Open Project direct' });
        await userEvent.click(screen.getByRole('radio', { name: 'All' }));
        await screen.findByRole('button', { name: 'Open Project alpha' });
    };

    const note = 'Our team needs this feature.';
    const submitNote = async () => {
        const dialog = await screen.findByRole('dialog', {
            name: 'Follow "Project alpha"',
        });
        await userEvent.type(within(dialog).getByRole('textbox'), note);
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Send request' }),
        );
        return dialog;
    };

    it('offers following only on unfollowed cards and keeps the card action independent', async () => {
        const follow = vi.spyOn(roadmapApi, 'followProject');
        renderRoadmap();
        await showAllProjects();
        expect(screen.getAllByRole('button', { name: 'Follow' })).toHaveLength(
            1,
        );
        const button = screen.getByRole('button', { name: 'Follow' });
        screen.getByRole('button', { name: 'Open Project alpha' }).focus();
        await userEvent.keyboard('{Tab}');
        expect(button).toHaveFocus();
        await userEvent.keyboard('{Enter}');
        expect(follow).not.toHaveBeenCalled();
        await submitNote();
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Follow' }),
            ).not.toBeInTheDocument(),
        );
        expect(follow).toHaveBeenCalledExactlyOnceWith({
            projectId: 'alpha',
            note,
        });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: 'Open project board for Project alpha',
            }),
        ).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('radio', { name: 'Following' }));
        expect(
            await screen.findByRole('button', { name: 'Open Project alpha' }),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole('radio', { name: 'Table' }));
        expect(await screen.findByText('Project alpha')).toBeInTheDocument();
        expect(screen.getByText('2 tickets')).toBeInTheDocument();
    });

    it('shares pending state and prevents duplicate submits across the card and modal', async () => {
        const pending =
            Promise.withResolvers<
                Awaited<ReturnType<typeof roadmapApi.followProject>>
            >();
        const follow = vi
            .spyOn(roadmapApi, 'followProject')
            .mockReturnValueOnce(pending.promise);
        renderRoadmap();
        await showAllProjects();
        const cardButton = screen.getByRole('button', {
            name: 'Follow',
        });
        await userEvent.click(
            screen.getByRole('button', { name: 'Open Project alpha' }),
        );
        const dialog = await screen.findByRole('dialog');
        const modalButton = within(dialog).getByRole('button', {
            name: 'Follow',
        });
        await userEvent.click(modalButton);
        const noteDialog = await screen.findByRole('dialog', {
            name: 'Follow "Project alpha"',
        });
        await userEvent.type(within(noteDialog).getByRole('textbox'), note);
        const submitButton = within(noteDialog).getByRole('button', {
            name: 'Send request',
        });
        act(() => {
            fireEvent.click(submitButton);
            fireEvent.click(submitButton);
        });
        await waitFor(() => {
            expect(modalButton).toBeDisabled();
            expect(cardButton).toBeDisabled();
            expect(submitButton).toBeDisabled();
        });
        expect(follow).toHaveBeenCalledOnce();
        await act(async () => {
            hasDirectNeed = true;
            pending.resolve(confirmation);
        });
        await waitFor(() =>
            expect(
                within(dialog).queryByRole('button', {
                    name: 'Follow',
                }),
            ).not.toBeInTheDocument(),
        );
        expect(within(dialog).getByText('Following')).toBeInTheDocument();
        expect(cardButton).not.toBeInTheDocument();
        expect(
            within(dialog).queryByRole('button', {
                name: 'Open project board',
            }),
        ).not.toBeInTheDocument();
    });

    it('shows an error without changing interest, then allows retry', async () => {
        const follow = vi
            .spyOn(roadmapApi, 'followProject')
            .mockRejectedValueOnce(new Error('Service unavailable'));
        renderRoadmap();
        await showAllProjects();
        await userEvent.click(screen.getByRole('button', { name: 'Follow' }));
        const noteDialog = await submitNote();
        await waitFor(() =>
            expect(showToastError).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Could not send request' }),
            ),
        );
        expect(hasDirectNeed).toBe(false);
        expect(within(noteDialog).getByRole('textbox')).toHaveValue(note);
        const retry = within(noteDialog).getByRole('button', {
            name: 'Send request',
        });
        expect(retry).toBeEnabled();
        await userEvent.click(retry);
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Follow' }),
            ).not.toBeInTheDocument(),
        );
        expect(follow).toHaveBeenCalledTimes(2);
    });

    it('confirms receipt without inventing interest when manual follow-up is needed', async () => {
        vi.mocked(roadmapApi.followProject).mockResolvedValue(confirmation);
        renderRoadmap();
        await showAllProjects();
        await userEvent.click(screen.getByRole('button', { name: 'Follow' }));
        await submitNote();
        expect(
            await screen.findByRole('button', { name: 'Request sent' }),
        ).toBeDisabled();
        expect(showToastSuccess).toHaveBeenCalledWith({
            title: 'Request sent',
            subtitle: confirmation.message,
        });
        await userEvent.click(
            screen.getByRole('button', { name: 'Open Project alpha' }),
        );
        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByRole('button', { name: 'Request sent' }),
        ).toBeDisabled();
        expect(within(dialog).queryByText('Following')).not.toBeInTheDocument();
        expect(hasDirectNeed).toBe(false);
    });

    it('loads interest from the server after remount and isolates organizations', async () => {
        const first = renderRoadmap();
        await showAllProjects();
        await userEvent.click(screen.getByRole('button', { name: 'Follow' }));
        await submitNote();
        await waitFor(() => expect(hasDirectNeed).toBe(true));
        first.unmount();
        const second = renderRoadmap();
        expect(
            await screen.findByRole('button', { name: 'Open Project alpha' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Follow' }),
        ).not.toBeInTheDocument();
        second.unmount();
        hasDirectNeed = false;
        renderRoadmap('org-2');
        await showAllProjects();
        expect(screen.getByRole('button', { name: 'Follow' })).toBeEnabled();
    });

    it('does not offer follow requests without permission', async () => {
        renderRoadmap('org-1', false);
        await showAllProjects();
        expect(
            screen.queryByRole('button', { name: 'Follow' }),
        ).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Open Project alpha' }),
        );
        expect(
            within(await screen.findByRole('dialog')).queryByRole('button', {
                name: 'Follow',
            }),
        ).not.toBeInTheDocument();
    });

    it('renders the shared catalog when private requests return 403', async () => {
        vi.spyOn(roadmapApi, 'getRequests').mockRejectedValue({
            status: 'error',
            error: { statusCode: 403, name: 'ForbiddenError' },
        });
        renderRoadmap();
        expect(
            await screen.findByRole('button', { name: 'Open Project direct' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Your organization has no feature requests yet.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Your roadmap isn't set up yet"),
        ).not.toBeInTheDocument();
    });

    it('does not offer following inside an already followed project modal', async () => {
        renderRoadmap();
        await userEvent.click(
            await screen.findByRole('button', { name: 'Open Project direct' }),
        );
        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).queryByRole('button', { name: 'Follow' }),
        ).not.toBeInTheDocument();
        expect(within(dialog).getByText('Following')).toBeInTheDocument();
    });

    it('requires a nonblank note and cancels without following or keeping the draft', async () => {
        const follow = vi.spyOn(roadmapApi, 'followProject');
        renderRoadmap();
        await showAllProjects();
        await userEvent.click(screen.getByRole('button', { name: 'Follow' }));
        const dialog = await screen.findByRole('dialog', {
            name: 'Follow "Project alpha"',
        });
        const submit = within(dialog).getByRole('button', {
            name: 'Send request',
        });
        expect(submit).toBeDisabled();
        await userEvent.type(within(dialog).getByRole('textbox'), '   ');
        expect(submit).toBeDisabled();
        await userEvent.type(within(dialog).getByRole('textbox'), note);
        expect(submit).toBeEnabled();
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(follow).not.toHaveBeenCalled();
        expect(hasDirectNeed).toBe(false);
        await userEvent.click(screen.getByRole('button', { name: 'Follow' }));
        const reopened = await screen.findByRole('dialog', {
            name: 'Follow "Project alpha"',
        });
        expect(within(reopened).getByRole('textbox')).toHaveValue('');
    });
});
