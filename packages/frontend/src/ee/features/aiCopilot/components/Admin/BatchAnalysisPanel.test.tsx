import {
    type AiAgentReviewBatchReport,
    type AiAgentReviewBatchRunSummary,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { BatchAnalysisPanel } from './BatchAnalysisPanel';

const mockUseReviewBatchRun = vi.fn();
const mockUseReviewBatchReport = vi.fn();

vi.mock('../../hooks/useAiAgentReviewBatch', () => ({
    useStartReviewBatch: () => ({ isLoading: false, mutateAsync: vi.fn() }),
    useReviewBatchRuns: () => ({ data: [] }),
    useReviewBatchRun: (...args: unknown[]) => mockUseReviewBatchRun(...args),
    useReviewBatchReport: (...args: unknown[]) =>
        mockUseReviewBatchReport(...args),
}));

const makeRunSummary = (
    overrides: Partial<AiAgentReviewBatchRunSummary> = {},
): AiAgentReviewBatchRunSummary => ({
    runUuid: 'run-1',
    status: 'completed',
    window: {
        startedAt: new Date('2026-05-01T00:00:00.000Z'),
        endedAt: new Date('2026-05-31T00:00:00.000Z'),
    },
    scope: { projectUuid: null, agentUuid: null },
    totalTurns: 500,
    processedTurns: 500,
    findingCount: 12,
    errorMessage: null,
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    completedAt: new Date('2026-06-01T08:05:00.000Z'),
    ...overrides,
});

const makeReport = (
    overrides: Partial<AiAgentReviewBatchReport> = {},
): AiAgentReviewBatchReport => ({
    runUuid: 'run-1',
    window: {
        startedAt: new Date('2026-05-01T00:00:00.000Z'),
        endedAt: new Date('2026-05-31T00:00:00.000Z'),
    },
    scope: { projectUuid: null, agentUuid: null },
    turnsReviewed: 400,
    flaggedTurns: 40,
    flaggedRate: 0.1,
    actions: [
        {
            primaryRootCause: 'semantic_layer',
            ownerType: 'semantic_layer_owner',
            fixTarget: 'semantic_yaml_patch',
            count: 25,
        },
        {
            primaryRootCause: 'project_context',
            ownerType: 'agent_admin',
            fixTarget: 'project_context_rule',
            count: 15,
        },
    ],
    signalsByType: { explicit_dispute: 30, implicit_correction: 10 },
    topExamples: [],
    ...overrides,
});

describe('BatchAnalysisPanel', () => {
    beforeEach(() => {
        mockUseReviewBatchRun.mockReset();
        mockUseReviewBatchReport.mockReset();
        mockUseReviewBatchRun.mockReturnValue({ data: undefined });
        mockUseReviewBatchReport.mockReturnValue({ data: undefined });
    });

    it('renders actions breakdown and flagged-rate % when a run is completed', () => {
        mockUseReviewBatchRun.mockReturnValue({ data: makeRunSummary() });
        mockUseReviewBatchReport.mockReturnValue({ data: makeReport() });

        renderWithProviders(
            <BatchAnalysisPanel projectUuid={null} agentUuid={null} />,
        );

        expect(screen.getByText(/10%/)).toBeInTheDocument();
        expect(screen.getByText('Semantic layer')).toBeInTheDocument();
        expect(screen.getByText('Project context')).toBeInTheDocument();
    });

    it('shows progress text while running and does not show the report', () => {
        mockUseReviewBatchRun.mockReturnValue({
            data: makeRunSummary({
                status: 'running',
                processedTurns: 120,
                totalTurns: 800,
            }),
        });
        mockUseReviewBatchReport.mockReturnValue({ data: undefined });

        renderWithProviders(
            <BatchAnalysisPanel projectUuid={null} agentUuid={null} />,
        );

        expect(screen.getByText(/Reviewing/i)).toBeInTheDocument();
        expect(
            screen.queryByText(/actions breakdown/i),
        ).not.toBeInTheDocument();
    });
});
