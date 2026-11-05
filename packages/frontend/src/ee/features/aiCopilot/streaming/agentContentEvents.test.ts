import { describe, expect, it } from 'vitest';
import { type StreamPart } from '../store/aiAgentThreadStreamSlice';
import { planAgentContentEvents } from './agentContentEvents';

const successMetadata = (uuid: string, slug: string) => ({
    status: 'success',
    slug,
    name: slug,
    uuid,
    href: `/projects/project-uuid/${slug}`,
    warnings: [],
    versionUuids: { before: null, after: null },
});

const editPart = (
    toolCallId: string,
    type: 'chart' | 'dashboard' | 'sql_chart',
    uuid: string,
    overrides: Partial<{ isPreliminary: boolean; status: string }> = {},
) =>
    ({
        type: 'toolCall',
        toolCallId,
        toolName: 'editContent',
        isPreliminary: overrides.isPreliminary ?? false,
        toolArgs: { type, slug: `${type}-slug`, patch: [] },
        toolResult: {
            result: '{}',
            metadata:
                overrides.status === 'error'
                    ? { status: 'error' }
                    : successMetadata(uuid, `${type}-slug`),
        },
    }) as unknown as StreamPart;

const chartCreatePart = {
    type: 'toolCall',
    toolCallId: 'chart-create',
    toolName: 'createContent',
    isPreliminary: false,
    toolArgs: {
        type: 'chart',
        content: { slug: 'new-chart', dashboardSlug: 'jaffle-dashboard' },
    },
    toolResult: {
        result: '{}',
        metadata: successMetadata('new-chart-uuid', 'new-chart'),
    },
} as unknown as StreamPart;

describe('planAgentContentEvents', () => {
    it('emits chartSaved with the right action for created and edited charts', () => {
        const plan = planAgentContentEvents({
            parts: [chartCreatePart, editPart('chart-edit', 'chart', 'c1')],
            handledToolCallIds: new Set(),
        });

        expect(plan.events).toEqual([
            {
                type: 'chartSaved',
                payload: { chartUuid: 'new-chart-uuid', action: 'created' },
            },
            {
                type: 'chartSaved',
                payload: { chartUuid: 'c1', action: 'updated' },
            },
        ]);
        expect(plan.handledToolCallIds).toEqual(['chart-create', 'chart-edit']);
    });

    it('emits one dashboardSaved when the agent adds a chart to a dashboard', () => {
        const plan = planAgentContentEvents({
            parts: [
                { type: 'text', text: 'Adding the chart' },
                editPart('dashboard-edit', 'dashboard', 'dashboard-uuid'),
            ],
            handledToolCallIds: new Set(),
        });

        expect(plan.events).toEqual([
            {
                type: 'dashboardSaved',
                payload: { dashboardUuid: 'dashboard-uuid', action: 'updated' },
            },
        ]);
    });

    it('emits dashboardSaved as created when the agent creates a dashboard', () => {
        const dashboardCreate = {
            ...(chartCreatePart as object),
            toolCallId: 'dashboard-create',
            toolArgs: { type: 'dashboard', content: { slug: 'new-dashboard' } },
            toolResult: {
                result: '{}',
                metadata: successMetadata(
                    'new-dashboard-uuid',
                    'new-dashboard',
                ),
            },
        } as unknown as StreamPart;

        const plan = planAgentContentEvents({
            parts: [dashboardCreate],
            handledToolCallIds: new Set(),
        });

        expect(plan.events).toEqual([
            {
                type: 'dashboardSaved',
                payload: {
                    dashboardUuid: 'new-dashboard-uuid',
                    action: 'created',
                },
            },
        ]);
    });

    it('skips handled, unfinished, failed and SQL chart tool calls', () => {
        const plan = planAgentContentEvents({
            parts: [
                editPart('handled', 'dashboard', 'd1'),
                editPart('preliminary', 'dashboard', 'd2', {
                    isPreliminary: true,
                }),
                editPart('failed', 'chart', 'c1', { status: 'error' }),
                editPart('sql', 'sql_chart', 's1'),
            ],
            handledToolCallIds: new Set(['handled']),
        });

        expect(plan.events).toEqual([]);
        expect(plan.handledToolCallIds).toEqual([]);
    });
});
