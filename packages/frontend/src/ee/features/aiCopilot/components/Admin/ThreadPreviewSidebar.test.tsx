import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { ThreadPreviewSidebar } from './ThreadPreviewSidebar';

vi.mock('../../../../../hooks/useProjects', () => ({
    useProjects: () => ({
        data: [{ projectUuid: 'project-1', name: 'Jaffle Shop' }],
    }),
}));

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useAiAgentAdminAgents: () => ({
        data: [{ uuid: 'agent-1', name: 'Support copilot', imageUrl: null }],
    }),
    useAiAgentAdminReviewItems: () => ({
        data: [
            {
                uuid: 'demo-review:1',
                fingerprint: 'demo-review:1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                title: 'Fallback title',
                description: 'Fallback description',
                primaryRootCause: 'project_context',
                status: 'open',
                dismissedReason: null,
                ownerType: 'unknown',
                assignedToUserUuid: null,
                firstSeenAt: new Date('2026-06-10T08:00:00.000Z'),
                lastSeenAt: new Date('2026-06-10T08:05:00.000Z'),
                findingCount: 1,
                statusUpdatedAt: new Date('2026-06-10T08:05:00.000Z'),
                statusUpdatedByUserUuid: null,
                linkedIssueUrl: null,
                linkedPrUrl: null,
                prState: null,
                prWritebackStatus: null,
                prWritebackMessage: null,
                writebackEligible: false,
                writebackEligibility: {
                    eligible: false,
                    reason: 'unsupported_root_cause',
                    strategy: null,
                    provider: null,
                },
                remediation: null,
                createdAt: new Date('2026-06-10T08:00:00.000Z'),
                updatedAt: new Date('2026-06-10T08:05:00.000Z'),
                latestFinding: {
                    uuid: 'finding-1',
                    promptUuid: 'prompt-1',
                    threadUuid: 'thread-1',
                    projectUuid: 'project-1',
                    agentUuid: 'agent-1',
                    subcategories: ['business_definition'],
                    fixTargets: ['project_context_rule'],
                    targetRefs: [],
                    evidenceExcerpts: [
                        {
                            source: 'user_prompt',
                            text: 'What does active user mean?',
                            redacted: false,
                        },
                    ],
                    recommendation: {
                        actionType: 'add_knowledge_document',
                        title: 'Add active user definition to project context',
                        rationale:
                            'The agent guessed a project-specific business definition.',
                        targetRefs: [],
                    },
                    projectContextEntry: {
                        op: 'create',
                        id: null,
                        kind: 'definition',
                        content:
                            'Active user means a customer with a completed checkout in the last 28 days.',
                        terms: ['active user'],
                        objects: ['customers'],
                    },
                    createdAt: new Date('2026-06-10T08:00:00.000Z'),
                },
            },
        ],
    }),
    useAiAgentAdminReviewItem: () => ({ data: undefined }),
    useCreateAiAgentReviewItemWriteback: () => ({
        isLoading: false,
        mutate: vi.fn(),
    }),
}));

vi.mock('../../hooks/useProjectAiAgents', () => ({
    useAiAgentThread: () => ({
        data: {
            uuid: 'thread-1',
            agentUuid: 'agent-1',
            createdAt: '2026-06-10T08:00:00.000Z',
            createdFrom: 'web_app',
            title: 'Dense review thread',
            titleGeneratedAt: null,
            firstMessage: {
                uuid: 'prompt-1',
                message: 'What does active user mean?',
            },
            user: {
                userUuid: 'user-1',
                firstName: 'Demo',
                lastName: 'User',
            },
            messages: [],
            compactions: [],
        },
        isLoading: false,
    }),
}));

vi.mock('../ChatElements/AgentChatDisplay', () => ({
    AgentChatDisplay: () => <div>Thread chat mock</div>,
}));

vi.mock('./ReviewItemActions', () => ({
    ReviewItemActions: () => <div>Review actions mock</div>,
}));

describe('ThreadPreviewSidebar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('keeps details collapsed until requested when a review item is selected', () => {
        renderWithProviders(
            <MemoryRouter>
                <ThreadPreviewSidebar
                    projectUuid="project-1"
                    agentUuid="agent-1"
                    threadUuid="thread-1"
                    selectedReviewItemUuid="demo-review:1"
                    isOpen
                    onClose={vi.fn()}
                />
            </MemoryRouter>,
        );

        expect(screen.getByText('Review details')).toBeInTheDocument();
        expect(
            screen.getByText('Add active user definition to project context'),
        ).toBeInTheDocument();
        expect(screen.getByText('Review actions mock')).toBeInTheDocument();
        expect(screen.getByText('Thread chat mock')).toBeInTheDocument();
        expect(screen.getByText('Jaffle Shop')).not.toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: /details/i }));
        expect(screen.getByText('Jaffle Shop')).toBeInTheDocument();
        expect(screen.getByText('Support copilot')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /why flagged/i }));
        expect(
            screen.getAllByText(
                'Adds project context: Active user means a customer with a completed checkout in the last 28 days.',
            ).length,
        ).toBeGreaterThan(0);

        expect(
            screen.getByRole('link', { name: 'Open full thread' }),
        ).toHaveAttribute(
            'href',
            '/projects/project-1/ai-agents/agent-1/threads/thread-1',
        );
    });
});
