import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { IssueDetailModal } from './IssueDetailModal';

const { threadHookSpy } = vi.hoisted(() => ({ threadHookSpy: vi.fn() }));

const makeReviewItem = (
    overrides: Partial<AiAgentReviewItemSummary> = {},
): AiAgentReviewItemSummary =>
    ({
        uuid: 'ri-1',
        fingerprint: 'fp-1',
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
        agentUuid: 'agent-1',
        title: 'Wrong revenue',
        description: 'desc',
        primaryRootCause: 'semantic_layer',
        status: 'open',
        dismissedReason: null,
        ownerType: 'semantic_layer_owner',
        assignedToUserUuid: null,
        firstSeenAt: new Date('2026-06-24T08:00:00.000Z'),
        lastSeenAt: new Date('2026-06-24T08:00:00.000Z'),
        findingCount: 1,
        statusUpdatedAt: null,
        statusUpdatedByUserUuid: null,
        linkedIssueUrl: null,
        linkedPrUrl: null,
        prState: null,
        prWritebackStatus: null,
        prWritebackMessage: null,
        boardPosition: null,
        createdAt: new Date('2026-06-24T08:00:00.000Z'),
        updatedAt: new Date('2026-06-24T08:00:00.000Z'),
        writebackEligible: false,
        writebackEligibility: {
            eligible: false,
            reason: 'reviews_disabled',
            provider: null,
            strategy: null,
        },
        remediation: null,
        latestFinding: {
            uuid: 'finding-1',
            promptUuid: 'prompt-1',
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
            subcategories: [],
            fixTargets: [],
            targetRefs: [],
            evidenceExcerpts: [
                {
                    source: 'user_prompt',
                    text: 'What is our total revenue?',
                    redacted: false,
                },
                {
                    source: 'next_user_prompt',
                    text: 'That is wrong — it ignores discounts.',
                    redacted: false,
                },
            ],
            recommendation: null,
            projectContextEntry: null,
            createdAt: new Date('2026-06-24T08:00:00.000Z'),
        },
        ...overrides,
    }) as AiAgentReviewItemSummary;

const { mockReviewItem } = vi.hoisted(() => ({
    mockReviewItem: { current: null as AiAgentReviewItemSummary | null },
}));

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useAiAgentAdminReviewItems: () => ({
        data: [mockReviewItem.current],
        isLoading: false,
    }),
    useAiAgentReviewItemActivity: () => ({ data: undefined }),
    useAiAgentAdminReviewItem: () => ({ data: undefined }),
    useUpdateAiAgentReviewItemStatus: () => ({
        isLoading: false,
        mutate: vi.fn(),
    }),
    useCreateAiAgentReviewItemWriteback: () => ({
        isLoading: false,
        mutate: vi.fn(),
    }),
}));

vi.mock('../../hooks/useProjectAiAgents', () => ({
    useAiAgentThread: (...args: unknown[]) => {
        threadHookSpy(...args);
        return {
            data: { uuid: 'thread-1', messages: [], compactions: [] },
            isLoading: false,
        };
    },
    useProjectAiAgent: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('../../../../../hooks/useProjects', () => ({
    useProjects: () => ({
        data: [{ projectUuid: 'project-1', name: 'Jaffle' }],
    }),
}));

vi.mock('../../../../../hooks/useOrganizationUsers', () => ({
    useOrgUsersByUuid: () => new Map(),
}));

// Heavy children stubbed so the test exercises modal composition, not their
// full dependency trees.
vi.mock('../ChatElements/AgentChatDisplay', () => ({
    AgentChatDisplay: () => <div>chat-evidence</div>,
}));
vi.mock('./ReviewItemActions', () => ({
    ReviewItemActions: () => <div>status-actions</div>,
}));
vi.mock('./ReviewAssigneeMenu', () => ({
    ReviewAssigneeMenu: () => <div>Assign</div>,
}));
// Render markdown excerpts as plain text so assertions match the source.
vi.mock('../../../../../components/common/AiMarkdown', () => ({
    AiMarkdown: ({ children }: { children: string }) => <div>{children}</div>,
}));

const renderModal = () =>
    renderWithProviders(
        <IssueDetailModal
            projectUuid="project-1"
            agentUuid="agent-1"
            threadUuid="thread-1"
            selectedReviewItemUuid="ri-1"
            isOpen
            onClose={() => {}}
        />,
    );

describe('IssueDetailModal', () => {
    beforeEach(() => {
        threadHookSpy.mockClear();
        mockReviewItem.current = makeReviewItem();
    });

    it('renders the issue title, rail, activity, and evidence excerpts', () => {
        renderModal();

        expect(screen.getAllByText('Wrong revenue').length).toBeGreaterThan(0);
        expect(screen.getByText('Assignee')).toBeInTheDocument();
        expect(screen.getByText('status-actions')).toBeInTheDocument();
        expect(screen.getByText('Jaffle')).toBeInTheDocument();
        expect(screen.getByText('Activity')).toBeInTheDocument();

        // Curated excerpts are shown inline; the full chat is NOT rendered yet.
        expect(screen.getByText('User asked')).toBeInTheDocument();
        expect(
            screen.getByText('What is our total revenue?'),
        ).toBeInTheDocument();
        expect(screen.queryByText('chat-evidence')).not.toBeInTheDocument();
    });

    it('opens the full conversation in a stacked modal on demand', async () => {
        const user = userEvent.setup();
        renderModal();

        await user.click(
            screen.getByRole('button', { name: /Read full conversation/i }),
        );

        expect(await screen.findByText('chat-evidence')).toBeInTheDocument();
    });

    it('does not fetch the thread until the conversation is opened', async () => {
        const user = userEvent.setup();
        renderModal();

        expect(threadHookSpy).toHaveBeenLastCalledWith(
            'project-1',
            'agent-1',
            'thread-1',
            expect.objectContaining({ enabled: false }),
        );

        await user.click(
            screen.getByRole('button', { name: /Read full conversation/i }),
        );

        expect(threadHookSpy).toHaveBeenLastCalledWith(
            'project-1',
            'agent-1',
            'thread-1',
            expect.objectContaining({ enabled: true }),
        );
    });

    it('keeps the conversation link when there are no excerpts', async () => {
        const user = userEvent.setup();
        mockReviewItem.current = makeReviewItem({
            latestFinding: {
                ...makeReviewItem().latestFinding!,
                evidenceExcerpts: [],
            },
        });
        renderModal();

        expect(
            screen.queryByTestId('evidence-excerpts'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText(/No excerpts were captured/i),
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: /Read full conversation/i }),
        );

        expect(await screen.findByText('chat-evidence')).toBeInTheDocument();
    });
});
