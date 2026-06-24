import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { IssueDetailModal } from './IssueDetailModal';

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
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
            primaryRootCause: 'semantic_layer',
            fixTargets: [],
            recommendation: null,
            projectContextEntry: null,
        },
        ...overrides,
    }) as AiAgentReviewItemSummary;

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useAiAgentAdminReviewItems: () => ({
        data: [makeReviewItem()],
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
    useAiAgentThread: () => ({
        data: { uuid: 'thread-1', messages: [] },
        isLoading: false,
    }),
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

describe('IssueDetailModal', () => {
    it('renders the issue title, assignee rail, evidence, and activity', () => {
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

        expect(screen.getByText('Wrong revenue')).toBeInTheDocument();
        expect(screen.getByText('Assignee')).toBeInTheDocument();
        expect(screen.getByText('status-actions')).toBeInTheDocument();
        expect(screen.getByText('chat-evidence')).toBeInTheDocument();
        expect(screen.getByText('Evidence')).toBeInTheDocument();
        expect(screen.getByText('Jaffle')).toBeInTheDocument();
    });
});
