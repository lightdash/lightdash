import { QuerySourceType } from '@lightdash/common';
import {
    getSqlApprovalDisplay,
    getSqlApprovalSteps,
    MAX_SQL_APPROVAL_STEPS,
    renderBlocks,
} from './slackSqlAggregate';

const THREAD_URL = 'https://lightdash.example/projects/p/ai-agents/a/threads/t';

const renderPending = (
    toolName: 'runSql' | 'runComposerQueries',
    toolArgs: unknown,
) =>
    renderBlocks(
        {
            kind: 'pending',
            display: getSqlApprovalDisplay({
                sql: 'joined sql',
                steps: getSqlApprovalSteps(toolName, toolArgs),
                threadUrl: THREAD_URL,
            }),
            toolCallId: 'call-1',
            threadUuid: 't',
            heading: 'Awaiting approval to run SQL',
        },
        'https://lightdash.example',
    );

const blockTexts = (blocks: ReturnType<typeof renderBlocks>): string[] =>
    blocks.flatMap((block) => (block.text?.text ? [block.text.text] : []));

const sqlNode = (index: number, description: string | null = null) => ({
    nodeId: `node_${index}`,
    sourceType: QuerySourceType.SQL,
    title: `Step ${index}`,
    description,
    sql: `select ${index}`,
});

describe('renderBlocks pending SQL approval', () => {
    it('shows runSql as one SQL block', () => {
        const blocks = renderPending('runSql', { sql: 'select 1' });

        expect(blockTexts(blocks)).toEqual([
            ':lock: *Awaiting approval to run SQL*',
            '```sql\njoined sql\n```',
        ]);
        expect(blocks.at(-1).type).toBe('actions');
    });

    it('shows each composer sql step with its title and description, without node ids', () => {
        const blocks = renderPending('runComposerQueries', {
            queries: [
                sqlNode(1, 'Monthly signups.'),
                {
                    nodeId: 'merge',
                    sourceType: QuerySourceType.DUCKDB,
                    sql: 'select * from node_1',
                },
                sqlNode(2),
            ],
        });
        const texts = blockTexts(blocks);

        expect(texts).toEqual([
            ':lock: *Awaiting approval to run SQL*',
            '*Step 1*\nMonthly signups.',
            '```sql\nselect 1\n```',
            '*Step 2*',
            '```sql\nselect 2\n```',
        ]);
        expect(texts.join('\n')).not.toContain('node_');
        expect(blocks.filter((block) => block.type === 'actions')).toHaveLength(
            1,
        );
    });

    it('caps the steps shown and links the rest to the thread', () => {
        const stepCount = MAX_SQL_APPROVAL_STEPS + 3;
        const blocks = renderPending('runComposerQueries', {
            queries: Array.from({ length: stepCount }, (_, i) =>
                sqlNode(i + 1),
            ),
        });
        const texts = blockTexts(blocks);

        expect(texts.filter((text) => text.startsWith('*Step'))).toHaveLength(
            MAX_SQL_APPROVAL_STEPS,
        );
        expect(texts.at(-1)).toBe(
            `+3 more SQL steps — <${THREAD_URL}|view in app>`,
        );
        expect(blocks.length).toBeLessThanOrEqual(50);
    });
});
