import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type {
    AiAgentPromptCreatedEvent,
    AiAgentRequestLifecycleEvent,
} from '../LightdashAnalytics';
import { agentRequestEventsColumns } from './agentRequestEventsStream';
import { EventStreamSink } from './EventStreamSink';
import { eventStreamRegistry } from './registry';
import type { EventStreamRow } from './types';
import { buildCompactionSql } from './UsageEventsCompactor';

const writer = () => ({
    push: vi.fn<(stream: string, row: EventStreamRow) => void>(),
    flush: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
});

const created: AiAgentPromptCreatedEvent = {
    event: 'ai_agent_prompt.created',
    userId: 'user',
    properties: {
        organizationId: 'org',
        projectId: 'project',
        aiAgentId: 'agent',
        threadId: 'thread',
        promptId: 'prompt',
        context: 'web_app',
        hasPinnedContext: false,
        pinnedContextCount: 0,
        pinnedChartCount: 0,
        pinnedDashboardCount: 0,
        pinnedSkillCount: 0,
    },
};
const outcome: AiAgentRequestLifecycleEvent = {
    event: 'ai_agent_request.outcome',
    properties: {
        eventId: 'outcome-event',
        organizationId: 'org',
        projectId: 'project',
        aiAgentId: 'agent',
        threadId: 'thread',
        promptId: 'prompt',
        outcome: 'error',
    },
};

describe('agent request event projection', () => {
    it('projects creation and outcomes at a common typed grain without prompt text', () => {
        const sinkWriter = writer();
        const sink = new EventStreamSink(eventStreamRegistry, sinkWriter);
        sink.handle(created);
        sink.handle(outcome);

        expect(sinkWriter.push).toHaveBeenCalledTimes(2);
        expect(sinkWriter.push.mock.calls.map(([stream]) => stream)).toEqual([
            'agent_request_events',
            'agent_request_events',
        ]);
        const [, start] = sinkWriter.push.mock.calls[0]!;
        const [, end] = sinkWriter.push.mock.calls[1]!;
        expect(start).toMatchObject({
            org_id: 'org',
            user_id: 'user',
            event_id: 'created:prompt',
            stage: 'created',
            surface: 'web_app',
            prompt_id: 'prompt',
        });
        expect(end).toMatchObject({
            org_id: 'org',
            event_id: 'outcome-event',
            stage: 'outcome',
            outcome: 'error',
            prompt_id: 'prompt',
        });
        const columns = agentRequestEventsColumns.map(({ name }) => name);
        for (const row of [start, end]) {
            expect(Object.keys(row).sort()).toEqual([...columns].sort());
            expect(JSON.stringify(row)).not.toContain('prompt text');
        }
    });

    it('does not emit unattributed lifecycle events', () => {
        const sinkWriter = writer();
        new EventStreamSink(eventStreamRegistry, sinkWriter).handle({
            ...outcome,
            properties: { ...outcome.properties, organizationId: '' },
        });
        expect(sinkWriter.push).not.toHaveBeenCalled();
    });

    it('compacts projected JSONL into the typed request-event parquet schema', async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'agent-requests-'));
        const raw = path.join(directory, 'raw.jsonl');
        const compacted = path.join(directory, 'compacted.parquet');
        const instance = await DuckDBInstance.create(':memory:');
        const db = await instance.connect();
        try {
            const sinkWriter = writer();
            const sink = new EventStreamSink(eventStreamRegistry, sinkWriter);
            sink.handle(created);
            sink.handle(outcome);
            await writeFile(
                raw,
                sinkWriter.push.mock.calls
                    .map(([, row]) => JSON.stringify(row))
                    .join('\n'),
            );
            const { sql } = buildCompactionSql({
                bucket: 'local',
                partition: {
                    orgId: 'org',
                    stream: 'agent_request_events',
                    dt: '2026-10-01',
                    keys: ['raw.jsonl'],
                },
                columns: agentRequestEventsColumns,
            });
            await db.run(
                sql
                    .replace("'s3://local/raw.jsonl'", `'${raw}'`)
                    .replace(/TO 's3:\/\/local\/[^']+'/u, `TO '${compacted}'`),
            );
            const rows = (
                await db.runAndReadAll(
                    `SELECT stage, event_id, prompt_id, human_score FROM read_parquet('${compacted}') ORDER BY stage`,
                )
            ).getRowObjectsJson();
            expect(rows).toEqual([
                {
                    stage: 'created',
                    event_id: 'created:prompt',
                    prompt_id: 'prompt',
                    human_score: null,
                },
                {
                    stage: 'outcome',
                    event_id: 'outcome-event',
                    prompt_id: 'prompt',
                    human_score: null,
                },
            ]);
            expect((await readFile(compacted)).length).toBeGreaterThan(0);
        } finally {
            db.closeSync();
            instance.closeSync();
            await rm(directory, { recursive: true, force: true });
        }
    });
});
