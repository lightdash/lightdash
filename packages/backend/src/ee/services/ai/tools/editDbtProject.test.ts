import { toolEditDbtProjectOutputSchema } from '@lightdash/common';
import { getEditDbtProject } from './editDbtProject';

type EditDbtProjectTool = ReturnType<typeof getEditDbtProject>;

const executeEditDbtProject = async (
    tool: EditDbtProjectTool,
    args: Partial<{
        prompt: string;
        prUrl: string | null;
        startNewPullRequest: boolean | null;
    }> = {},
) => {
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(
        {
            prompt: 'fix the descriptions',
            prUrl: null,
            startNewPullRequest: false,
            ...args,
        },
        {
            messages: [],
            toolCallId: 'tool-call-1',
        },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

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

        expect(output.metadata).toEqual({
            status: 'pending',
            aiWritebackRunUuid: 'run-1',
        });
        expect(output.result).toBe(
            'Started the change. Give a brief one-line acknowledgement.',
        );
        expect(output.result).not.toContain('run-1');
    });

    it('mirrors the started run as structured content that matches the output schema', async () => {
        const editDbtProject = vi
            .fn()
            .mockResolvedValue({ aiWritebackRunUuid: 'run-1' });

        const output = await executeEditDbtProject(
            getEditDbtProject({ editDbtProject }),
        );

        expect(toolEditDbtProjectOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.structuredContent).toEqual({ status: 'pending' });
        expect(output.result).toContain('Started');
    });

    it('reports an enqueue-time failure as an error result', async () => {
        const editDbtProject = vi
            .fn()
            .mockRejectedValue(new Error('Unable to enqueue writeback'));

        const output = await executeEditDbtProject(
            getEditDbtProject({ editDbtProject }),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'unknown',
        });
        expect(output.result).toContain(
            'Error starting AI writeback. No pull request was opened.',
        );
        expect(output.result).toContain('Unable to enqueue writeback');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolEditDbtProjectOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
