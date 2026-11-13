import { CiMergeState } from '@lightdash/common';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { usePullRequestCiChecks } from '../../../hooks/usePullRequestCiChecks';
import { AiEditDbtProjectToolCall } from './AiEditDbtProjectToolCall';
import { QuietCardsContext } from './quietCards';

const held = vi.hoisted((): { ciChecks: unknown } => ({ ciChecks: null }));
vi.mock('../../../hooks/usePullRequestCiChecks', () => ({
    usePullRequestCiChecks: vi.fn(() => ({ data: held.ciChecks })),
}));
vi.mock(
    '../../../../../../components/common/GithubIntegration/hooks/useGithubIntegration',
    () => ({ useGithubUserCredential: () => ({ data: null }) }),
);
vi.mock('../../../hooks/useClosePullRequest', () => ({
    useClosePullRequest: () => ({ mutate: vi.fn(), isLoading: false }),
}));
vi.mock('../../../hooks/useMergePullRequest', () => ({
    useMergePullRequest: () => ({ mutate: vi.fn(), isLoading: false }),
}));
vi.mock('../../../hooks/useProjectAiAgents', () => ({
    useProjectAiAgent: () => ({ data: undefined }),
    useCreateAgentThreadMessageMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('./WritebackDiffModal', () => ({ WritebackDiffModal: () => null }));

describe('Bitbucket dbt writeback card', () => {
    afterEach(() => vi.clearAllMocks());

    it('links to Bitbucket without polling CI or offering unsupported actions', async () => {
        const prUrl = 'https://bitbucket.org/workspace/jaffle/pull-requests/7';
        renderWithProviders(
            <MemoryRouter>
                <AiEditDbtProjectToolCall
                    projectUuid="project"
                    metadata={{
                        status: 'success',
                        prUrl,
                        previewUrl: 'https://preview.example.com',
                    }}
                />
            </MemoryRouter>,
        );
        expect(usePullRequestCiChecks).toHaveBeenCalledWith(
            'project',
            null,
            null,
        );
        expect(screen.getByText('workspace/jaffle')).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Merge PR' }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'View' }));
        await waitFor(() =>
            expect(
                screen.getByRole('menuitem', { name: 'Pull request' }),
            ).toHaveAttribute('href', prUrl),
        );
        expect(
            screen.queryByRole('menuitem', { name: 'Preview' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Diff' }),
        ).not.toBeInTheDocument();
    });

    it('directs a missing token to project settings without an app installation action', () => {
        renderWithProviders(
            <MemoryRouter>
                <AiEditDbtProjectToolCall
                    projectUuid="project"
                    metadata={{
                        status: 'error',
                        errorCode: 'bitbucket_token_missing',
                    }}
                />
            </MemoryRouter>,
        );
        expect(screen.getByText('Configure Bitbucket API token')).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Edit project connection' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/project/settings',
        );
        expect(
            screen.queryByRole('link', { name: 'Install GitHub App' }),
        ).not.toBeInTheDocument();
    });
});

describe('the quiet pull request card of a side panel', () => {
    afterEach(() => {
        held.ciChecks = null;
        vi.clearAllMocks();
    });

    it('points to the workspace for its changes and keeps closing and GitHub linking in its menu', async () => {
        held.ciChecks = {
            merged: false,
            state: 'open',
            mergeState: CiMergeState.READY,
            checks: [],
        };
        renderWithProviders(
            <MemoryRouter>
                <QuietCardsContext.Provider value>
                    <AiEditDbtProjectToolCall
                        projectUuid="project"
                        metadata={{
                            status: 'success',
                            prUrl: 'https://github.com/acme/analytics/pull/7',
                        }}
                    />
                </QuietCardsContext.Provider>
            </MemoryRouter>,
        );
        expect(
            screen.getByRole('button', { name: 'View changes' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Merge' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Close PR' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'View' }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        await waitFor(() =>
            expect(
                screen.getByRole('menuitem', { name: 'Discard changes' }),
            ).toBeVisible(),
        );
        expect(
            screen.getByRole('menuitem', { name: 'Open pull requests as you' }),
        ).toHaveAttribute('href', '/generalSettings/profile');
    });
    it.each([
        { merged: true, state: 'closed' as const, word: 'Merged' },
        { merged: false, state: 'closed' as const, word: 'Closed' },
    ])(
        'reads $word once settled, with nothing left to merge',
        ({ merged, state, word }) => {
            held.ciChecks = {
                merged,
                state,
                mergeState: CiMergeState.READY,
                checks: [],
            };
            renderWithProviders(
                <MemoryRouter>
                    <QuietCardsContext.Provider value>
                        <AiEditDbtProjectToolCall
                            projectUuid="project"
                            metadata={{
                                status: 'success',
                                prUrl: 'https://github.com/acme/analytics/pull/7',
                            }}
                        />
                    </QuietCardsContext.Provider>
                </MemoryRouter>,
            );
            expect(screen.getByText(word)).toBeVisible();
            expect(
                screen.queryByRole('button', { name: 'Merge' }),
            ).not.toBeInTheDocument();
        },
    );
});
