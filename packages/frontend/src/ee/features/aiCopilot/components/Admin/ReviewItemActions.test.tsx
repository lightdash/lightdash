import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { ReviewItemActions } from './ReviewItemActions';

const { updateStatusMutate } = vi.hoisted(() => ({
    updateStatusMutate: vi.fn(),
}));

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useAiAgentAdminReviewItem: () => ({ data: undefined }),
    useCreateAiAgentReviewItemWriteback: () => ({
        isLoading: false,
        mutate: vi.fn(),
    }),
    useUpdateAiAgentReviewItemStatus: () => ({
        isLoading: false,
        mutate: updateStatusMutate,
    }),
}));

vi.mock('./ProjectContextWritebackModal', () => ({
    ProjectContextWritebackModal: () => null,
}));

vi.mock('../AiAgentSkillModal', () => ({
    AiAgentSkillModal: () => <div>skill modal</div>,
}));

const skillProposalFinding = {
    uuid: 'finding-1',
    promptUuid: 'prompt-1',
    threadUuid: 'thread-1',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    subcategories: ['weekly-revenue-table'],
    fixTargets: ['agent_configuration_change' as const],
    targetRefs: [],
    evidenceExcerpts: [],
    recommendation: {
        actionType: 'create_skill' as const,
        title: 'Create a weekly revenue skill',
        rationale: 'The same steer recurs.',
        targetRefs: [],
    },
    projectContextEntry: null,
    skillProposal: {
        name: 'weekly-revenue-table',
        description: 'Use when the user asks for weekly revenue in GBP.',
        instructions: '## Steps\n1. Query weekly revenue.',
        arguments: [],
        argumentHint: null,
    },
    createdAt: new Date('2026-10-05T08:00:00.000Z'),
};

const makeReviewItem = (
    overrides: Partial<AiAgentReviewItemSummary> = {},
): AiAgentReviewItemSummary =>
    ({
        uuid: 'review-1',
        fingerprint: 'review-1',
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
        agentUuid: 'agent-1',
        title: 'Fallback title',
        description: 'Fallback description',
        primaryRootCause: 'product_capability',
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
            subcategories: [],
            fixTargets: ['product_capability_ticket'],
            targetRefs: [],
            evidenceExcerpts: [],
            recommendation: null,
            projectContextEntry: null,
            createdAt: new Date('2026-06-10T08:00:00.000Z'),
        },
        ...overrides,
    }) as AiAgentReviewItemSummary;

describe('ReviewItemActions', () => {
    it('does not render the unsupported root cause blocked reason', () => {
        renderWithProviders(
            <MemoryRouter>
                <ReviewItemActions
                    reviewItem={makeReviewItem()}
                    mode="drawer"
                />
            </MemoryRouter>,
        );

        expect(
            screen.queryByText('No writeback strategy for this root cause'),
        ).not.toBeInTheDocument();
    });

    it('still renders other blocked reasons', () => {
        renderWithProviders(
            <MemoryRouter>
                <ReviewItemActions
                    reviewItem={makeReviewItem({
                        writebackEligibility: {
                            eligible: false,
                            reason: 'missing_project',
                            strategy: null,
                            provider: null,
                        },
                    })}
                    mode="drawer"
                />
            </MemoryRouter>,
        );

        expect(
            screen.getByText('No project is linked to this issue'),
        ).toBeInTheDocument();
    });

    it('lets you dismiss an item that has moved past triage', () => {
        updateStatusMutate.mockClear();
        renderWithProviders(
            <MemoryRouter>
                <ReviewItemActions
                    reviewItem={makeReviewItem({ status: 'open' })}
                    mode="drawer"
                />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByText('Dismiss'));

        expect(updateStatusMutate).toHaveBeenCalledWith({
            fingerprint: 'review-1',
            body: { status: 'dismissed', dismissedReason: 'not_actionable' },
        });
    });

    it('does not offer dismiss on a terminal item', () => {
        renderWithProviders(
            <MemoryRouter>
                <ReviewItemActions
                    reviewItem={makeReviewItem({ status: 'resolved' })}
                    mode="drawer"
                />
            </MemoryRouter>,
        );

        expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    });

    it('offers to create the drafted skill on an accepted proposal', () => {
        renderWithProviders(
            <MemoryRouter>
                <ReviewItemActions
                    reviewItem={makeReviewItem({
                        status: 'open',
                        primaryRootCause: 'agent_configuration',
                        latestFinding: skillProposalFinding,
                    })}
                    mode="drawer"
                />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByText('Create skill'));

        expect(screen.getByText('skill modal')).toBeInTheDocument();
    });

    it('keeps a skill proposal behind accept while it is in triage', () => {
        renderWithProviders(
            <MemoryRouter>
                <ReviewItemActions
                    reviewItem={makeReviewItem({
                        status: 'triage',
                        primaryRootCause: 'agent_configuration',
                        latestFinding: skillProposalFinding,
                    })}
                    mode="drawer"
                />
            </MemoryRouter>,
        );

        expect(screen.getByText('Accept')).toBeInTheDocument();
        expect(screen.queryByText('Create skill')).not.toBeInTheDocument();
    });
});
