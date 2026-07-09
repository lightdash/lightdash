import { type ToolOutput } from '@lightdash/common';
import { getEditDbtProject } from './editDbtProject';

type EditDbtProjectTool = ReturnType<typeof getEditDbtProject>;
type EditDbtProjectOutput = Exclude<ToolOutput, ToolOutput[]>;

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
    value != null && typeof value === 'object' && Symbol.asyncIterator in value;

const executeEditDbtProject = (
    tool: EditDbtProjectTool,
    args: Partial<{
        prompt: string | null;
        prUrl: string | null;
        fromActiveChangeset: boolean;
        startNewPullRequest: boolean | null;
    }> = {},
) =>
    (async (): Promise<EditDbtProjectOutput> => {
        const output = await tool.execute!(
            {
                prompt: 'fix the descriptions',
                prUrl: null,
                fromActiveChangeset: false,
                startNewPullRequest: false,
                ...args,
            },
            {
                messages: [],
                toolCallId: 'tool-call-1',
            },
        );

        if (isAsyncIterable(output) || Array.isArray(output)) {
            throw new Error('Expected non-streaming single tool output item');
        }

        return output;
    })();

describe('getEditDbtProject', () => {
    it('forwards startNewPullRequest: true to the editDbtProject dependency', async () => {
        const editDbtProject = vi
            .fn()
            .mockResolvedValue({ aiWritebackRunUuid: 'run-1' });

        await executeEditDbtProject(getEditDbtProject({ editDbtProject }), {
            startNewPullRequest: true,
        });

        expect(editDbtProject).toHaveBeenCalledWith(
            expect.objectContaining({ startNewPullRequest: true }),
        );
    });

    it('forwards a null startNewPullRequest unchanged (default follow-up)', async () => {
        const editDbtProject = vi
            .fn()
            .mockResolvedValue({ aiWritebackRunUuid: 'run-1' });

        await executeEditDbtProject(getEditDbtProject({ editDbtProject }), {
            startNewPullRequest: null,
        });

        expect(editDbtProject).toHaveBeenCalledWith(
            expect.objectContaining({ startNewPullRequest: null }),
        );
    });

    it('forwards the AI SDK tool call id as progressId', async () => {
        const editDbtProject = vi
            .fn()
            .mockResolvedValue({ aiWritebackRunUuid: 'run-1' });

        await executeEditDbtProject(getEditDbtProject({ editDbtProject }));

        expect(editDbtProject).toHaveBeenCalledWith(
            expect.objectContaining({ progressId: 'tool-call-1' }),
        );
    });

    it('returns a pending status with the run uuid, without waiting for the run', async () => {
        const editDbtProject = vi
            .fn()
            .mockResolvedValue({ aiWritebackRunUuid: 'run-1' });

        const output = await executeEditDbtProject(
            getEditDbtProject({ editDbtProject }),
        );

        expect(output.status).toBe('success');
        if (output.status === 'error') {
            throw new Error(`Unexpected error output: ${output.error}`);
        }

        expect(output.metadata?.status).toBe('pending');
        expect(output.metadata?.aiWritebackRunUuid).toBe('run-1');
        expect(output.result).not.toContain('run-1');
    });

    it('reports an enqueue-time failure (e.g. no active changeset) as an error result', async () => {
        const editDbtProject = vi
            .fn()
            .mockRejectedValue(
                new Error(
                    'There are no changes to write back for this project',
                ),
            );

        const output = await executeEditDbtProject(
            getEditDbtProject({ editDbtProject }),
            { fromActiveChangeset: true, prompt: null },
        );

        expect(output.status).toBe('error');
        if (output.status === 'success') {
            throw new Error(`Unexpected success output: ${output.result}`);
        }

        expect(output.metadata?.status).toBe('error');
        expect(output.metadata?.errorCode).toBe('unknown');
    });
});
