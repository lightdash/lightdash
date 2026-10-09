import { describe, expect, it } from 'vitest';
import { groupToolCallSummaries } from './toolCallGrouping';
import { type ToolCallSummary } from './types';

const contentCall = (
    toolName: 'readContent' | 'editContent',
    slug: string,
    type: 'chart' | 'dashboard',
): ToolCallSummary => ({
    toolCallId: `${toolName}-${slug}`,
    toolName,
    toolArgs: { slug, type },
});

const slugsOf = (calls: ToolCallSummary[]) =>
    calls.map((call) => (call.toolArgs as { slug: string }).slug);

describe('groupToolCallSummaries', () => {
    it('keeps charts that were only read out of the edited content group', () => {
        const groups = groupToolCallSummaries([
            contentCall('readContent', 'orders-per-partner', 'chart'),
            contentCall('readContent', 'partner-metrics-overview', 'chart'),
            contentCall('editContent', 'kpi-dashboard', 'dashboard'),
        ]);

        expect(groups).toHaveLength(2);

        const [reads, edits] = groups;
        expect(reads.toolName).toBe('readContent');
        expect(slugsOf(reads.calls)).toEqual([
            'orders-per-partner',
            'partner-metrics-overview',
        ]);
        expect(edits.toolName).toBe('editContent');
        expect(slugsOf(edits.calls)).toEqual(['kpi-dashboard']);
    });

    it('shows reads between edits as reads', () => {
        const groups = groupToolCallSummaries([
            contentCall('editContent', 'kpi-dashboard', 'dashboard'),
            contentCall('readContent', 'orders-per-partner', 'chart'),
            contentCall('editContent', 'orders-per-partner', 'chart'),
            contentCall('readContent', 'partner-metrics-overview', 'chart'),
        ]);

        expect(
            groups.map((group) => [group.toolName, slugsOf(group.calls)]),
        ).toEqual([
            ['editContent', ['kpi-dashboard']],
            ['readContent', ['orders-per-partner']],
            ['editContent', ['orders-per-partner']],
            ['readContent', ['partner-metrics-overview']],
        ]);
    });

    it('still groups consecutive edits and creates as edited content', () => {
        const groups = groupToolCallSummaries([
            contentCall('editContent', 'kpi-dashboard', 'dashboard'),
            {
                toolCallId: 'create-1',
                toolName: 'createContent',
                toolArgs: { content: { slug: 'new-chart' }, type: 'chart' },
            },
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0].display?.doneLabel).toBe('Edited content');
    });
});
