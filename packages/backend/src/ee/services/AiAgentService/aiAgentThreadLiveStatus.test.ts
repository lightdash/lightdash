import { deriveAiAgentThreadLiveStatus } from './aiAgentThreadLiveStatus';

const NOW = new Date('2026-08-26T12:00:00.000Z');
const THREAD_CREATED_AT = new Date('2026-08-26T10:00:00.000Z');
const PROMPT_CREATED_AT = new Date('2026-08-26T11:58:00.000Z');

const liveStateSignals = () => ({
    threadUuid: 'thread-uuid',
    threadCreatedAt: THREAD_CREATED_AT,
    latestPrompt: {
        createdAt: PROMPT_CREATED_AT,
        retriedAt: null,
        respondedAt: null,
        response: null,
        errorMessage: null,
        interruptedAt: null,
        needsUserInput: null,
    },
    runSqlToolCalls: [],
    pendingWritebackCreatedAt: null,
    activeDeepResearchRun: null,
});

describe('deriveAiAgentThreadLiveStatus', () => {
    it('reports a fresh non-terminal prompt as working', () => {
        expect(deriveAiAgentThreadLiveStatus(liveStateSignals(), NOW)).toEqual({
            threadUuid: 'thread-uuid',
            state: 'working',
            stateChangedAt: '2026-08-26T11:58:00.000Z',
            source: 'deterministic',
        });
    });

    it('reports a non-terminal prompt at the five-minute boundary as working', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        createdAt: new Date('2026-08-26T11:55:00.000Z'),
                    },
                },
                NOW,
            ),
        ).toMatchObject({
            state: 'working',
            stateChangedAt: '2026-08-26T11:55:00.000Z',
        });
    });

    it('reports a non-terminal prompt at five minutes and one millisecond as idle', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        createdAt: new Date('2026-08-26T11:54:59.999Z'),
                    },
                },
                NOW,
            ),
        ).toEqual({
            threadUuid: 'thread-uuid',
            state: 'idle',
            stateChangedAt: '2026-08-26T10:00:00.000Z',
            source: 'deterministic',
        });
    });

    it('reports an old failed prompt as freshly working after retry', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        createdAt: new Date('2026-08-26T10:00:00.000Z'),
                        retriedAt: new Date('2026-08-26T11:59:00.000Z'),
                    },
                },
                NOW,
            ),
        ).toEqual({
            threadUuid: 'thread-uuid',
            state: 'working',
            stateChangedAt: '2026-08-26T11:59:00.000Z',
            source: 'deterministic',
        });
    });

    it('reports a pending SQL approval with a response as waiting for the user', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        response: 'Approval requested in Slack',
                        respondedAt: new Date('2026-08-26T11:58:30.000Z'),
                    },
                    runSqlToolCalls: [
                        {
                            createdAt: new Date('2026-08-26T11:59:00.000Z'),
                            toolResultUuid: null,
                            approvalDecision: null,
                        },
                    ],
                },
                NOW,
            ),
        ).toEqual({
            threadUuid: 'thread-uuid',
            state: 'waiting_for_you',
            stateChangedAt: '2026-08-26T11:59:00.000Z',
            source: 'deterministic',
        });
    });

    it.each([
        [
            'an approval decision',
            { toolResultUuid: null, approvalDecision: 'approved' as const },
        ],
        [
            'a tool result',
            { toolResultUuid: 'tool-result-uuid', approvalDecision: null },
        ],
    ])('does not report waiting when there is %s', (_name, resolution) => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        response: 'Approval requested in Slack',
                        respondedAt: new Date('2026-08-26T11:58:30.000Z'),
                    },
                    runSqlToolCalls: [
                        {
                            createdAt: new Date('2026-08-26T11:59:00.000Z'),
                            ...resolution,
                        },
                    ],
                },
                NOW,
            ).state,
        ).toBe('idle');
    });

    it('does not report an errored prompt with an unresolved SQL call as waiting', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        errorMessage: 'Query failed',
                    },
                    runSqlToolCalls: [
                        {
                            createdAt: new Date('2026-08-26T11:59:00.000Z'),
                            toolResultUuid: null,
                            approvalDecision: null,
                        },
                    ],
                },
                NOW,
            ).state,
        ).toBe('idle');
    });

    it.each(['queued', 'running'] as const)(
        'reports an active %s deep research run as working',
        (status) => {
            expect(
                deriveAiAgentThreadLiveStatus(
                    {
                        ...liveStateSignals(),
                        latestPrompt: {
                            ...liveStateSignals().latestPrompt,
                            createdAt: new Date('2026-08-26T11:00:00.000Z'),
                            response: 'Which source should I use?',
                            respondedAt: new Date('2026-08-26T11:05:00.000Z'),
                            needsUserInput: true,
                        },
                        activeDeepResearchRun: {
                            status,
                            createdAt: new Date('2026-08-26T11:30:00.000Z'),
                            startedAt:
                                status === 'running'
                                    ? new Date('2026-08-26T11:31:00.000Z')
                                    : null,
                        },
                    },
                    NOW,
                ),
            ).toMatchObject({
                state: 'working',
                source: 'deterministic',
                stateChangedAt:
                    status === 'running'
                        ? '2026-08-26T11:31:00.000Z'
                        : '2026-08-26T11:30:00.000Z',
            });
        },
    );

    it('reports a queued deep research run at the 75-minute boundary as working', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        createdAt: new Date('2026-08-26T11:00:00.000Z'),
                    },
                    activeDeepResearchRun: {
                        status: 'queued',
                        createdAt: new Date('2026-08-26T10:45:00.000Z'),
                        startedAt: null,
                    },
                },
                NOW,
            ).state,
        ).toBe('working');
    });

    it('reports a queued deep research run older than 75 minutes as idle', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        createdAt: new Date('2026-08-26T11:00:00.000Z'),
                    },
                    activeDeepResearchRun: {
                        status: 'queued',
                        createdAt: new Date('2026-08-26T10:44:59.999Z'),
                        startedAt: null,
                    },
                },
                NOW,
            ),
        ).toMatchObject({
            state: 'idle',
            stateChangedAt: '2026-08-26T10:00:00.000Z',
        });
    });

    it('reports a terminal response as idle', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        response: 'Done',
                        respondedAt: new Date('2026-08-26T11:59:00.000Z'),
                    },
                },
                NOW,
            ),
        ).toMatchObject({
            state: 'idle',
            stateChangedAt: '2026-08-26T11:59:00.000Z',
        });
    });

    it('reports a completed writeback source-selection response as waiting for the user', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        response:
                            "This project has more than one dbt source. Reply naming one and I'll try again.",
                        respondedAt: new Date('2026-08-26T11:59:00.000Z'),
                        needsUserInput: true,
                    },
                },
                NOW,
            ),
        ).toEqual({
            threadUuid: 'thread-uuid',
            state: 'waiting_for_you',
            stateChangedAt: '2026-08-26T11:59:00.000Z',
            source: 'classified',
        });
    });

    it('keeps a classified non-terminal response working', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        needsUserInput: true,
                    },
                },
                NOW,
            ).state,
        ).toBe('working');
    });

    it.each([false, null])(
        'reports a terminal response classified as %s as idle',
        (needsUserInput) => {
            expect(
                deriveAiAgentThreadLiveStatus(
                    {
                        ...liveStateSignals(),
                        latestPrompt: {
                            ...liveStateSignals().latestPrompt,
                            response: 'Done',
                            respondedAt: new Date('2026-08-26T11:59:00.000Z'),
                            needsUserInput,
                        },
                    },
                    NOW,
                ).state,
            ).toBe('idle');
        },
    );

    it('prioritizes deterministic SQL approval over classification', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        needsUserInput: true,
                    },
                    runSqlToolCalls: [
                        {
                            createdAt: new Date('2026-08-26T11:59:00.000Z'),
                            toolResultUuid: null,
                            approvalDecision: null,
                        },
                    ],
                },
                NOW,
            ),
        ).toMatchObject({
            state: 'waiting_for_you',
            source: 'deterministic',
        });
    });

    it.each([
        ['an error', { errorMessage: 'Failed', interruptedAt: null }],
        [
            'an interruption',
            {
                errorMessage: null,
                interruptedAt: new Date('2026-08-26T11:58:30.000Z'),
            },
        ],
    ])('reports %s as idle', (_name, terminalState) => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        ...terminalState,
                        respondedAt: new Date('2026-08-26T11:59:00.000Z'),
                    },
                },
                NOW,
            ).state,
        ).toBe('idle');
    });

    it('anchors an interruption without a response timestamp to the interruption', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        interruptedAt: new Date('2026-08-26T11:58:30.000Z'),
                    },
                },
                NOW,
            ),
        ).toMatchObject({
            state: 'idle',
            stateChangedAt: '2026-08-26T11:58:30.000Z',
        });
    });

    it('prioritizes a pending SQL approval over other active signals', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    runSqlToolCalls: [
                        {
                            createdAt: new Date('2026-08-26T11:59:00.000Z'),
                            toolResultUuid: null,
                            approvalDecision: null,
                        },
                    ],
                    pendingWritebackCreatedAt: new Date(
                        '2026-08-26T11:58:30.000Z',
                    ),
                    activeDeepResearchRun: {
                        status: 'running',
                        createdAt: new Date('2026-08-26T11:30:00.000Z'),
                        startedAt: new Date('2026-08-26T11:31:00.000Z'),
                    },
                },
                NOW,
            ).state,
        ).toBe('waiting_for_you');
    });

    it('reports a pending writeback run as working', () => {
        expect(
            deriveAiAgentThreadLiveStatus(
                {
                    ...liveStateSignals(),
                    latestPrompt: {
                        ...liveStateSignals().latestPrompt,
                        response: 'Started',
                        respondedAt: new Date('2026-08-26T11:58:10.000Z'),
                        needsUserInput: true,
                    },
                    pendingWritebackCreatedAt: new Date(
                        '2026-08-26T11:58:05.000Z',
                    ),
                },
                NOW,
            ),
        ).toMatchObject({
            state: 'working',
            stateChangedAt: '2026-08-26T11:58:05.000Z',
            source: 'deterministic',
        });
    });
});
