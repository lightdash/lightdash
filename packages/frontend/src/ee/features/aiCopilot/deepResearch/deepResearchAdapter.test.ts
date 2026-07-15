import { describe, expect, it } from 'vitest';
import { adaptDeepResearchRun } from './deepResearchAdapter';
import { type DeepResearchRunRegistration } from './types';

const registration: DeepResearchRunRegistration = {
    runUuid: 'run-1',
    projectUuid: 'project-1',
    threadUuid: 'thread-1',
    userUuid: 'user-1',
    question: 'Why did enterprise retention fall?',
    depth: 'standard',
    createdAt: '2026-07-15T09:00:00.000Z',
    state: 'started',
};

describe('adaptDeepResearchRun', () => {
    it('drops unsafe model-produced evidence links', () => {
        const view = adaptDeepResearchRun({
            registration,
            events: [],
            now: Date.parse('2026-07-15T09:05:00.000Z'),
            run: {
                aiDeepResearchRunUuid: 'run-1',
                projectUuid: 'project-1',
                status: 'completed',
                result: {
                    summary: 'A small renewal cohort caused the movement.',
                    findings: [
                        {
                            title: 'Renewal cohort',
                            summary: 'Three accounts drove most of the change.',
                            confidence: 'high',
                            evidence: [
                                {
                                    title: 'Unsafe source',
                                    description: 'Untrusted model output.',
                                    sourceType: 'web',
                                    sourceLabel: 'External source',
                                    sourceUrl: 'javascript:alert(1)',
                                },
                            ],
                        },
                    ],
                    caveats: [],
                    scope: 'Enterprise renewals in Q2.',
                    unresolvedQuestions: [],
                    nextSteps: [],
                },
                budget: {
                    maxRuntimeMs: 1_800_000,
                    maxTokens: 10_000,
                    maxToolCalls: 25,
                    maxWarehouseQueries: 25,
                    maxResultRows: 10_000,
                },
                errorMessage: null,
                cancellationRequestedAt: null,
                createdAt: '2026-07-15T09:00:00.000Z',
                updatedAt: '2026-07-15T09:05:00.000Z',
                startedAt: '2026-07-15T09:00:01.000Z',
                completedAt: '2026-07-15T09:05:00.000Z',
            },
        });

        expect(view.artifact?.findings[0].evidence[0].sourceUrl).toBeNull();
    });
});
