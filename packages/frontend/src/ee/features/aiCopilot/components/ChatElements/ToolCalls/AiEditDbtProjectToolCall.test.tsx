import { CiMergeState } from '@lightdash/common';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePullRequestCiChecks } from '../../../../../../features/writeback/usePullRequestCiChecks';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { AiEditDbtProjectToolCall } from './AiEditDbtProjectToolCall';
import { InStudioChatContext, StudioAskContext } from './studioChatContext';

const held = vi.hoisted(
    (): {
        ciChecks: unknown;
        diff: string;
        compile: unknown;
        pullRequest: unknown;
        workspaces: unknown[];
    } => ({
        ciChecks: null,
        diff: '',
        compile: null,
        pullRequest: null,
        workspaces: [],
    }),
);
vi.mock('../../../../../../features/writeback/usePullRequestCiChecks', () => ({
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
vi.mock('../../../../../../features/semanticStudio/ModelFieldChanges', () => ({
    DraftFieldChanges: () => null,
}));
vi.mock('../../../../../../features/semanticStudio/TryItButton', () => ({
    TryIt: () => null,
}));
vi.mock('../../SemanticStudioAgent/PublishDraftModal', () => ({
    PublishDraftModal: () => null,
}));
vi.mock('../../SemanticStudioAgent/useSemanticStudioChat', () => ({
    useFinishDiscardedWork: () => vi.fn(),
}));
vi.mock('../../SemanticStudioAgent/useStudioPullRequest', () => ({
    useStudioPullRequest: () => held.pullRequest,
}));
vi.mock(
    '../../../../../../features/semanticStudio/useStudioWorkspaces',
    () => ({
        useStudioWorkspaces: () => ({
            data: { mine: held.workspaces, others: [], recent: [] },
        }),
    }),
);
vi.mock(
    '../../../../../../features/semanticStudio/useSemanticLayerModel',
    () => ({
        useDraftCheckout: () => ({
            data: held.compile
                ? { workspaceUuid: 'ws', branchCompile: held.compile }
                : null,
        }),
    }),
);
vi.mock('../../../../../../features/writeback/usePullRequestDiff', () => ({
    usePullRequestDiff: () => ({ data: { diff: held.diff } }),
}));

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
        held.diff = '';
        held.compile = null;
        held.pullRequest = null;
        held.workspaces = [];
        vi.clearAllMocks();
    });

    it('points to the workspace for its changes and leaves trying, publishing and discarding to the toolbar', () => {
        held.ciChecks = {
            merged: false,
            state: 'open',
            mergeState: CiMergeState.READY,
            checks: [],
        };
        renderWithProviders(
            <MemoryRouter>
                <InStudioChatContext.Provider value>
                    <AiEditDbtProjectToolCall
                        projectUuid="project"
                        metadata={{
                            status: 'success',
                            prUrl: 'https://github.com/acme/analytics/pull/7',
                        }}
                    />
                </InStudioChatContext.Provider>
            </MemoryRouter>,
        );
        // The card is one line until it is opened; its link is inside.
        expect(
            screen.queryByRole('link', { name: 'View changes' }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Draft/ }));
        expect(
            screen.getByRole('link', { name: 'View changes' }),
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
        expect(
            screen.queryByRole('button', { name: 'More' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Try it' }),
        ).not.toBeInTheDocument();
    });
    it.each([
        { merged: true, state: 'closed' as const, word: 'Merged' },
        { merged: false, state: 'closed' as const, word: 'Discarded' },
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
                    <InStudioChatContext.Provider value>
                        <AiEditDbtProjectToolCall
                            projectUuid="project"
                            metadata={{
                                status: 'success',
                                prUrl: 'https://github.com/acme/analytics/pull/7',
                            }}
                        />
                    </InStudioChatContext.Provider>
                </MemoryRouter>,
            );
            expect(screen.getAllByText(word)[0]).toBeVisible();
            expect(
                screen.queryByRole('button', { name: 'Merge' }),
            ).not.toBeInTheDocument();
        },
    );
    it('opens on a failed compile with the files the turn changed, and asks the agent to fix it', () => {
        const prUrl = 'https://github.com/acme/analytics/pull/7';
        held.diff = [
            'diff --git a/models/orders.yml b/models/orders.yml',
            '--- a/models/orders.yml',
            '+++ b/models/orders.yml',
            '@@ -1,2 +1,3 @@',
            ' models:',
            '+  - name: orders',
            'diff --git a/models/refunds.sql b/models/refunds.sql',
            'new file mode 100644',
            '--- /dev/null',
            '+++ b/models/refunds.sql',
            '@@ -0,0 +1 @@',
            '+select 1',
        ].join('\n');
        held.compile = {
            status: 'failed',
            error: 'refunds is not defined',
        };
        held.pullRequest = {
            prUrl,
            commitSha: 'abc',
            state: 'open',
            changedModels: ['orders', 'refunds'],
            isMine: true,
            previewProjectUuid: null,
        };
        held.workspaces = [
            {
                workspaceUuid: 'ws',
                name: 'Refunds',
                pullRequest: { url: prUrl, state: 'open' },
            },
        ];
        const ask = vi.fn();
        renderWithProviders(
            <MemoryRouter>
                <InStudioChatContext.Provider value>
                    <StudioAskContext.Provider value={ask}>
                        <AiEditDbtProjectToolCall
                            projectUuid="project"
                            metadata={{
                                status: 'success',
                                prUrl,
                                commitSha: 'abc',
                            }}
                        />
                    </StudioAskContext.Provider>
                </InStudioChatContext.Provider>
            </MemoryRouter>,
        );
        expect(screen.getByText("Draft doesn't compile")).toBeVisible();
        // A draft that does not compile is open without being asked.
        expect(
            screen.getByRole('link', { name: /orders\.yml/ }),
        ).toHaveTextContent('models/orders.yml+1 −0');
        expect(
            screen.getByRole('link', { name: /refunds\.sql/ }),
        ).toHaveTextContent('models/refunds.sql+1 −0');
        fireEvent.click(screen.getByRole('button', { name: 'Fix with agent' }));
        expect(ask).toHaveBeenCalledWith(
            "The draft doesn't compile: refunds is not defined. Fix it.",
        );
    });
});
