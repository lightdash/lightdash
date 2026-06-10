import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
    getReviewItemWritebackSuccessToast,
    updateCachedReviewItemLists,
} from './useAiAgentAdmin';

const makeReviewItem = (
    overrides: Partial<AiAgentReviewItemSummary> = {},
): AiAgentReviewItemSummary =>
    ({
        uuid: 'fingerprint-1',
        fingerprint: 'fingerprint-1',
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
        agentUuid: 'agent-1',
        title: 'Review revenue metric',
        description: 'The answer picked the wrong metric',
        primaryRootCause: 'semantic_layer',
        status: 'open',
        dismissedReason: null,
        ownerType: 'semantic_layer_owner',
        assignedToUserUuid: null,
        firstSeenAt: new Date('2026-06-10T09:00:00.000Z'),
        lastSeenAt: new Date('2026-06-10T09:00:00.000Z'),
        findingCount: 1,
        statusUpdatedAt: new Date('2026-06-10T09:00:00.000Z'),
        statusUpdatedByUserUuid: null,
        linkedIssueUrl: null,
        linkedPrUrl: null,
        prState: null,
        prWritebackStatus: null,
        prWritebackMessage: null,
        createdAt: new Date('2026-06-10T09:00:00.000Z'),
        updatedAt: new Date('2026-06-10T09:00:00.000Z'),
        writebackEligible: false,
        writebackEligibility: {
            eligible: false,
            reason: 'unsupported_root_cause',
            provider: null,
            strategy: null,
        },
        remediation: null,
        latestFinding: null,
        ...overrides,
    }) as AiAgentReviewItemSummary;

describe('getReviewItemWritebackSuccessToast', () => {
    it('shows queued copy when the async writeback request has no PR yet', () => {
        const toast = getReviewItemWritebackSuccessToast({
            linkedPrUrl: null,
            prWritebackMessage: 'Queued',
            prWritebackStatus: 'queued',
        });

        expect(toast.title).toBe('Writeback queued');
        expect(toast.subtitle).toBe('The review item will update as it runs.');
        expect(toast.title).not.toContain('changes');
    });

    it('shows PR copy when the response includes a PR URL', () => {
        expect(
            getReviewItemWritebackSuccessToast({
                linkedPrUrl: 'https://github.com/acme/analytics/pull/42',
                prWritebackMessage: 'Opened pull request',
                prWritebackStatus: 'completed',
            }),
        ).toEqual({ title: 'Pull request opened' });
    });

    it('prefers queued copy over a stale PR URL while writeback is in progress', () => {
        expect(
            getReviewItemWritebackSuccessToast({
                linkedPrUrl: 'https://github.com/acme/analytics/pull/41',
                prWritebackMessage: 'Queued',
                prWritebackStatus: 'queued',
            }),
        ).toEqual({
            title: 'Writeback queued',
            subtitle: 'The review item will update as it runs.',
        });
    });

    it('uses terminal copy for a completed no-PR writeback', () => {
        expect(
            getReviewItemWritebackSuccessToast({
                linkedPrUrl: null,
                prWritebackMessage: 'Writeback ran - no changes were needed',
                prWritebackStatus: 'completed',
            }),
        ).toEqual({
            title: 'Writeback completed',
            subtitle: 'Writeback ran - no changes were needed',
        });
    });
});

describe('updateCachedReviewItemLists', () => {
    it('removes dismissed items from active review item queries', () => {
        const queryClient = new QueryClient();
        const openItem = makeReviewItem();
        const dismissedItem = makeReviewItem({
            status: 'dismissed',
            dismissedReason: 'not_actionable',
        });

        queryClient.setQueryData(
            ['ai-agent-admin-review-items', { statuses: ['open'] }],
            [openItem],
        );
        queryClient.setQueryData(
            [
                'ai-agent-admin-review-items',
                { statuses: ['open', 'dismissed'] },
            ],
            [openItem],
        );

        updateCachedReviewItemLists(queryClient, dismissedItem);

        expect(
            queryClient.getQueryData([
                'ai-agent-admin-review-items',
                { statuses: ['open'] },
            ]),
        ).toEqual([]);
        expect(
            queryClient.getQueryData([
                'ai-agent-admin-review-items',
                { statuses: ['open', 'dismissed'] },
            ]),
        ).toEqual([dismissedItem]);
    });
});
