import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import AiAgentAdminReviewItemsTable from './AiAgentAdminReviewItemsTable';

const mockCreateWriteback = vi.fn();
const mockUpdateStatus = vi.fn();
const mockUseAiAgentAdminReviewItems = vi.fn();
const mockUseAiAgentAdminReviewSignals = vi.fn();

vi.mock('../../../../../hooks/useProjects', () => ({
    useProjects: () => ({ data: [] }),
}));

vi.mock('../../../../../hooks/useOnboardingMock', () => ({
    useOnboardingMock: (_examples: unknown, _enabled: boolean) => undefined,
}));

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useAiAgentAdminAgents: () => ({ data: [] }),
    useAiAgentAdminReviewItems: (...args: unknown[]) =>
        mockUseAiAgentAdminReviewItems(...args),
    useAiAgentAdminReviewSignals: (...args: unknown[]) =>
        mockUseAiAgentAdminReviewSignals(...args),
    useAiAgentAdminReviewItem: () => ({ data: undefined }),
    useCreateAiAgentReviewItemWriteback: () => ({
        isLoading: false,
        mutate: mockCreateWriteback,
    }),
    useUpdateAiAgentReviewItemStatus: () => ({
        isLoading: false,
        mutate: mockUpdateStatus,
    }),
}));

const makeReviewItem = (
    overrides: Partial<AiAgentReviewItemSummary> = {},
): AiAgentReviewItemSummary =>
    ({
        uuid: 'demo-review:1',
        fingerprint: 'demo-review:1',
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
        agentUuid: 'agent-1',
        title: 'Fallback title',
        description: 'Fallback description',
        primaryRootCause: 'semantic_layer',
        status: 'open',
        dismissedReason: null,
        ownerType: 'semantic_layer_owner',
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
        writebackEligible: true,
        writebackEligibility: {
            eligible: true,
            reason: null,
            strategy: 'semantic_layer',
            provider: 'github',
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
            subcategories: ['missing_metric'],
            fixTargets: ['semantic_yaml_patch'],
            targetRefs: [],
            evidenceExcerpts: [
                {
                    source: 'user_prompt',
                    text: 'How many weekly active users did we have?',
                    redacted: false,
                },
                {
                    source: 'assistant_answer',
                    text: 'I estimated weekly active users from orders.',
                    redacted: false,
                },
                {
                    source: 'next_user_prompt',
                    text: 'Use the canonical weekly_active_users metric.',
                    redacted: false,
                },
            ],
            recommendation: {
                actionType: 'update_semantic_yaml',
                title: 'Create weekly active users metric in analytics',
                rationale:
                    'The agent guessed because a discoverable WAU metric was missing.',
                targetRefs: [],
            },
            projectContextEntry: null,
            createdAt: new Date('2026-06-10T08:00:00.000Z'),
        },
        ...overrides,
    }) as AiAgentReviewItemSummary;

const reviewSignals = [
    {
        uuid: 'signal-1',
        runUuid: 'run-1',
        promptUuid: 'prompt-2',
        threadUuid: 'thread-2',
        projectUuid: 'project-1',
        agentUuid: 'agent-1',
        signal: 'explicit_dispute',
        implicitSignalSources: ['next_user_correction'],
        confidence: 'high',
        promotedToFinding: false,
        promotionReason: null,
        createdAt: new Date('2026-06-10T08:10:00.000Z'),
        runScope: {
            type: 'manual',
            requestedByUserUuid: 'user-1',
            filters: {},
        },
        prompt: 'Show monthly revenue by org',
        responsePreview: 'I used a SQL query instead of a metric.',
        errorMessage: null,
        finding: null,
    },
];

describe('AiAgentAdminReviewItemsTable', () => {
    beforeEach(() => {
        mockCreateWriteback.mockReset();
        mockUpdateStatus.mockReset();
        mockUseAiAgentAdminReviewItems.mockReset();
        mockUseAiAgentAdminReviewSignals.mockReset();
        mockUseAiAgentAdminReviewItems.mockImplementation(
            (
                _args: unknown,
                options?: {
                    select?: (
                        rows: AiAgentReviewItemSummary[],
                    ) => AiAgentReviewItemSummary[];
                },
            ) => {
                const rows = [makeReviewItem()];
                return {
                    data: options?.select ? options.select(rows) : rows,
                    isLoading: false,
                };
            },
        );
        mockUseAiAgentAdminReviewSignals.mockReturnValue({
            data: reviewSignals,
            isLoading: false,
        });
    });

    it('opens the drawer on row click, but not from selection or action buttons', async () => {
        const user = userEvent.setup();
        const onReviewItemSelect = vi.fn();

        renderWithProviders(
            <AiAgentAdminReviewItemsTable
                onReviewItemSelect={onReviewItemSelect}
            />,
        );

        expect(screen.queryByText('View thread')).not.toBeInTheDocument();

        await user.click(
            screen.getByText('Create weekly active users metric in analytics'),
        );

        expect(onReviewItemSelect).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
            threadUuid: 'thread-1',
            reviewItemUuid: 'demo-review:1',
        });

        onReviewItemSelect.mockClear();

        await user.click(screen.getByRole('checkbox', { name: 'Select row' }));
        expect(onReviewItemSelect).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Create PR' }));
        expect(onReviewItemSelect).not.toHaveBeenCalled();
    });
});
