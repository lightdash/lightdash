import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { usePullRequestCiChecks } from '../../../hooks/usePullRequestCiChecks';
import { AiEditDbtProjectToolCall } from './AiEditDbtProjectToolCall';

vi.mock('../../../hooks/usePullRequestCiChecks', () => ({
    usePullRequestCiChecks: vi.fn().mockReturnValue({ data: null }),
}));
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
                    isPreviewDeploySetup={false}
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
                    isPreviewDeploySetup={false}
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
