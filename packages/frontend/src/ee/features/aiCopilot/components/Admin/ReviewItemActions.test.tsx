import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { ReviewItemActions } from './ReviewItemActions';

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useAiAgentAdminReviewItem: () => ({ data: undefined }),
    useCreateAiAgentReviewItemWriteback: () => ({
        isLoading: false,
        mutate: vi.fn(),
    }),
}));

vi.mock('./ProjectContextWritebackModal', () => ({
    ProjectContextWritebackModal: () => null,
}));

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
            <ReviewItemActions reviewItem={makeReviewItem()} mode="drawer" />,
        );

        expect(
            screen.queryByText('No writeback strategy for this root cause'),
        ).not.toBeInTheDocument();
    });

    it('still renders other blocked reasons', () => {
        renderWithProviders(
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
            />,
        );

        expect(
            screen.getByText('No project is linked to this finding'),
        ).toBeInTheDocument();
    });
});
