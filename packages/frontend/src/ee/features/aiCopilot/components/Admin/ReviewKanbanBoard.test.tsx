import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { ReviewKanbanBoard } from './ReviewKanbanBoard';

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useAiAgentAdminReviewItems: () => ({ data: items }),
    useAiAgentAdminAgents: () => ({ data: [] }),
    useAiAgentReviewItemPrDiff: () => ({ data: null }),
    useUpdateAiAgentReviewItemStatus: () => ({
        mutate: vi.fn(),
        isLoading: false,
    }),
    useCreateAiAgentReviewItemWriteback: () => ({
        mutate: vi.fn(),
        isLoading: false,
    }),
    useUpdateAiAgentReviewItemAssignee: () => ({
        mutate: vi.fn(),
        isLoading: false,
    }),
}));

vi.mock('../../../../../hooks/useProjectUsersWithRolesV2', () => ({
    useProjectUsersWithRoles: () => ({ usersWithProjectRole: [] }),
}));

vi.mock('../AgentNamePill', () => ({ AgentNamePill: () => null }));

const items = [
    {
        uuid: 'a',
        status: 'open',
        primaryRootCause: 'ambiguous',
        title: 'Triage me',
        prWritebackStatus: null,
        remediation: null,
        linkedPrUrl: null,
        agentUuid: null,
        firstSeenAt: new Date('2026-06-01'),
        writebackEligibility: { eligible: false, reason: 'no_fix_targets' },
        latestFinding: {
            fixTargets: [],
            projectUuid: 'p',
            agentUuid: 'ag',
            threadUuid: 't',
        },
    },
    {
        uuid: 'b',
        status: 'resolved',
        primaryRootCause: 'semantic_layer',
        title: 'All done',
        prWritebackStatus: null,
        remediation: null,
        linkedPrUrl: null,
        agentUuid: null,
        firstSeenAt: new Date('2026-06-01'),
        writebackEligibility: { eligible: false, reason: 'no_fix_targets' },
        latestFinding: {
            fixTargets: [],
            targetRefs: [],
            recommendation: null,
            projectUuid: 'p',
            agentUuid: 'ag',
            threadUuid: 't',
        },
    },
] as unknown as AiAgentReviewItemSummary[];

describe('ReviewKanbanBoard', () => {
    it('renders all four lanes with items bucketed correctly', () => {
        renderWithProviders(<ReviewKanbanBoard onReviewItemSelect={vi.fn()} />);

        expect(screen.getByText('Needs triage')).toBeInTheDocument();
        expect(screen.getByText('To Do')).toBeInTheDocument();
        expect(screen.getByText('In Progress')).toBeInTheDocument();
        expect(screen.getByText('Done')).toBeInTheDocument();

        // ambiguous open item → needs_triage lane; getIssueTitle returns 'Triage correction signal'
        expect(
            screen.getByText('Triage correction signal'),
        ).toBeInTheDocument();
        // resolved item → done lane; getIssueTitle falls back to item.title
        expect(screen.getByText('All done')).toBeInTheDocument();
    });
});
