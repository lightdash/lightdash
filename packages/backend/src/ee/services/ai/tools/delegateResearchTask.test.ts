import {
    toolDelegateResearchTaskOutputSchema,
    type AiDeepResearchWorkerFindings,
    type AiDeepResearchWorkerResult,
} from '@lightdash/common';
import { getDelegateResearchTask } from './delegateResearchTask';

const input = {
    question: 'Did order volume fall in the repriced categories?',
    focus: 'Weekly orders by category for the affected window only',
};

const findings: AiDeepResearchWorkerFindings = {
    summary: 'Orders fell 12% in repriced categories.',
    evidence: [
        {
            finding: 'Weekly orders dropped from 1,200 to 1,056.',
            queryUuids: ['query-1'],
            sources: [],
        },
    ],
    limitations: ['Only four weeks of data were available.'],
    confidence: 'medium',
};

const workerResult = (
    overrides: Partial<AiDeepResearchWorkerResult> = {},
): AiDeepResearchWorkerResult => ({
    task: { id: 'task-1', ...input },
    findings,
    failureReason: null,
    ...overrides,
});

const execute = async (
    tool: ReturnType<typeof getDelegateResearchTask>,
    args: Parameters<NonNullable<typeof tool.execute>>[0],
) => {
    if (!tool.execute) {
        throw new Error('Expected the tool to be executable');
    }
    const output = await tool.execute(args, {
        messages: [],
        toolCallId: 'tool-call-1',
        context: {},
    });
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('delegateResearchTask', () => {
    it('returns the worker packet as text and as structured content', async () => {
        const runTask = vi.fn().mockResolvedValue(workerResult());
        const tool = getDelegateResearchTask({ runTask });

        const output = await execute(tool, input);

        expect(runTask).toHaveBeenCalledWith(input);
        expect(output).toEqual({
            result: JSON.stringify({ taskId: 'task-1', ...findings }),
            metadata: { status: 'success' },
            structuredContent: { taskId: 'task-1', ...findings },
        });
        expect(
            toolDelegateResearchTaskOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(JSON.parse(output.result)).toEqual(output.structuredContent);
    });

    it('mirrors a worker failure as an error envelope', async () => {
        const runTask = vi.fn().mockResolvedValue(
            workerResult({
                findings: null,
                failureReason: 'The delegation cap was reached',
            }),
        );
        const tool = getDelegateResearchTask({ runTask });

        const output = await execute(tool, input);

        expect(output).toEqual({
            result: 'The delegation cap was reached',
            metadata: { status: 'error' },
            structuredContent: { error: 'The delegation cap was reached' },
        });
        expect(
            toolDelegateResearchTaskOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    it('falls back to a generic message when a failed worker gives no reason', async () => {
        const runTask = vi
            .fn()
            .mockResolvedValue(workerResult({ findings: null }));
        const tool = getDelegateResearchTask({ runTask });

        const output = await execute(tool, input);

        expect(output).toEqual({
            result: 'The delegated task did not return findings',
            metadata: { status: 'error' },
            structuredContent: {
                error: 'The delegated task did not return findings',
            },
        });
    });

    it('rejects an invalid task without running a worker', async () => {
        const runTask = vi.fn();
        const tool = getDelegateResearchTask({ runTask });

        const output = await execute(tool, {
            question: '',
            focus: input.focus,
        });

        expect(runTask).not.toHaveBeenCalled();
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(
            toolDelegateResearchTaskOutputSchema.safeParse(output).success,
        ).toBe(true);
    });
});
