import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { RemediationActivityTimeline } from './RemediationActivityTimeline';

const mockUseAiAgentReviewItemActivity = vi.fn();

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useAiAgentReviewItemActivity: (...args: unknown[]) =>
        mockUseAiAgentReviewItemActivity(...args),
}));

vi.mock('../../../../../hooks/useOrganizationUsers', () => ({
    useOrgUsersByUuid: () =>
        new Map([
            [
                'u1',
                {
                    userUuid: 'u1',
                    firstName: 'Jo',
                    lastName: 'V',
                    email: 'jo@x.com',
                },
            ],
        ]),
}));

const makeReviewItem = (
    overrides: Partial<AiAgentReviewItemSummary> = {},
): AiAgentReviewItemSummary =>
    ({
        uuid: 'fp-1',
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
        latestFinding: null,
        ...overrides,
    }) as AiAgentReviewItemSummary;

describe('RemediationActivityTimeline', () => {
    it('renders an issue event row with its author', () => {
        mockUseAiAgentReviewItemActivity.mockReturnValue({
            data: {
                events: [
                    {
                        kind: 'issue',
                        uuid: 'i1',
                        fingerprint: 'fp-1',
                        occurredAt: '2026-06-24T09:00:00Z',
                        createdByUserUuid: 'u1',
                        eventType: 'status_changed',
                        payload: {
                            from: 'open',
                            to: 'in_progress',
                            dismissedReason: null,
                        },
                    },
                ],
                liveState: null,
                liveMessage: null,
                verdictStale: false,
            },
        });

        renderWithProviders(
            <RemediationActivityTimeline reviewItem={makeReviewItem()} />,
        );

        expect(screen.getByText(/in progress/i)).toBeInTheDocument();
        expect(screen.getByText(/Jo V/)).toBeInTheDocument();
    });
});
