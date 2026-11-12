import { type DeepResearchRunView } from './types';

export const deepResearchRunFixture: DeepResearchRunView = {
    uuid: 'run-quarterly-retention',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-quarterly-retention',
    promptUuid: 'prompt-quarterly-retention',
    question:
        'Why did enterprise retention fall in Q2 despite higher product adoption?',
    status: 'completed',
    terminalReason: null,
    phase: 'Writing the report',
    startedAt: '2026-07-15T09:00:00.000Z',
    completedAt: '2026-07-15T09:18:00.000Z',
    updatedAt: '2026-07-15T09:18:00.000Z',
    elapsedMs: 1_080_000,
    sourceCount: 4,
    queryCount: 7,
    findingCount: 2,
    actionRequired: null,
    latestEvents: [
        {
            uuid: 'event-report',
            type: 'progress',
            label: 'Prepared the evidence-backed report',
            createdAt: '2026-07-15T09:18:00.000Z',
        },
        {
            uuid: 'event-query',
            type: 'progress',
            label: 'Executed a warehouse query',
            createdAt: '2026-07-15T09:12:00.000Z',
        },
    ],
    document: {
        documentUuid: '5f0c6c2e-6f43-4f7b-9a43-0d3b1f1f2a10',
        name: 'Why enterprise retention fell in Q2',
        slug: 'why-enterprise-retention-fell-in-q2',
    },
    errorMessage: null,
};
