import * as Sentry from '@sentry/node';
import { recordDeepResearchQueueTelemetry } from './AiDeepResearchService';

vi.mock('@sentry/node', () => ({
    startSpan: vi.fn(
        (_options: unknown, callback: () => unknown | Promise<unknown>) =>
            callback(),
    ),
}));

describe('Deep Research queue telemetry', () => {
    it('records the durable queue interval with correlated phase ids', async () => {
        const createdAt = new Date('2026-07-30T10:00:00.000Z');
        const startedAt = new Date('2026-07-30T10:00:42.000Z');

        await recordDeepResearchQueueTelemetry({
            ai_deep_research_run_uuid: 'research-run-1',
            created_at: createdAt,
            started_at: startedAt,
        });

        expect(Sentry.startSpan).toHaveBeenCalledWith(
            {
                name: 'ai.deep_research.queue',
                op: 'queue.wait',
                startTime: createdAt,
                attributes: {
                    'ai.deep_research.run_uuid': 'research-run-1',
                    'ai.deep_research.workflow_phase': 'investigation',
                    'ai.deep_research.latency_phase': 'queue',
                    'ai.deep_research.step_id': 'queue',
                    'ai.deep_research.attempt_id': 'queue:1',
                    'ai.deep_research.started_at': '2026-07-30T10:00:00.000Z',
                    'ai.deep_research.ended_at': '2026-07-30T10:00:42.000Z',
                    'ai.deep_research.outcome': 'success',
                    'ai.deep_research.will_retry': false,
                    'ai.deep_research.aborted': false,
                    'ai.deep_research.tokens_available': false,
                },
            },
            expect.any(Function),
        );
    });
});
