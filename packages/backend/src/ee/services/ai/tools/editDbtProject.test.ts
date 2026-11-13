import { toolEditDbtProjectOutputSchema } from '@lightdash/common';
import { getEditDbtProject } from './editDbtProject';

type EditDbtProjectTool = ReturnType<typeof getEditDbtProject>;

const executeEditDbtProject = async (
    tool: EditDbtProjectTool,
    args: Partial<{
        prompt: string;
        prUrl: string | null;
        startNewPullRequest: boolean | null;
        script: string | null;
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
            context: {},
        },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('getEditDbtProject', () => {
    it('forwards startNewPullRequest: true to the editDbtProject dependency', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'started',
            aiWritebackRunUuid: 'run-1',
        });

        await executeEditDbtProject(
            getEditDbtProject({ editDbtProject, acceptsScript: false }),
            {
                startNewPullRequest: true,
            },
        );

        expect(editDbtProject).toHaveBeenCalledWith(
            expect.objectContaining({ startNewPullRequest: true }),
        );
    });

    it('forwards a null startNewPullRequest unchanged (default follow-up)', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'started',
            aiWritebackRunUuid: 'run-1',
        });

        await executeEditDbtProject(
            getEditDbtProject({ editDbtProject, acceptsScript: false }),
            {
                startNewPullRequest: null,
            },
        );

        expect(editDbtProject).toHaveBeenCalledWith(
            expect.objectContaining({ startNewPullRequest: null }),
        );
    });

    it('forwards the AI SDK tool call id as progressId', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'started',
            aiWritebackRunUuid: 'run-1',
        });

        await executeEditDbtProject(
            getEditDbtProject({ editDbtProject, acceptsScript: false }),
        );

        expect(editDbtProject).toHaveBeenCalledWith(
            expect.objectContaining({ progressId: 'tool-call-1' }),
        );
    });

    it('returns a pending status with the run uuid, without waiting for the run', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'started',
            aiWritebackRunUuid: 'run-1',
        });

        const output = await executeEditDbtProject(
            getEditDbtProject({ editDbtProject, acceptsScript: false }),
        );

        expect(output.metadata).toEqual({
            status: 'pending',
            aiWritebackRunUuid: 'run-1',
        });
        expect(output.result).toBe(
            'Started the change; the pull request opens in the background. Acknowledge it briefly.',
        );
        expect(output.result).not.toContain('run-1');
    });

    it('mirrors the started run as structured content that matches the output schema', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'started',
            aiWritebackRunUuid: 'run-1',
        });

        const output = await executeEditDbtProject(
            getEditDbtProject({ editDbtProject, acceptsScript: false }),
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
            getEditDbtProject({ editDbtProject, acceptsScript: false }),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'unknown',
        });
        expect(output.result).toContain(
            'Error starting AI writeback. No pull request was opened.',
        );
        expect(output.result).toContain('Unable to enqueue writeback');
        expect(output.structuredContent).toEqual({
            error: output.result,
        });
        expect(toolEditDbtProjectOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('saves with a script only when code mode is on', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'started',
            aiWritebackRunUuid: 'run-1',
        });

        await executeEditDbtProject(
            getEditDbtProject({ editDbtProject, acceptsScript: true }),
            { script: 'yaml.set()' },
        );
        await executeEditDbtProject(
            getEditDbtProject({ editDbtProject, acceptsScript: false }),
            { script: 'yaml.set()' },
        );

        expect(editDbtProject.mock.calls.map(([args]) => args.script)).toEqual([
            'yaml.set()',
            null,
        ]);
    });

    it('hands a failed script back to the model with its logs', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'script_failed',
            error: 'models.[name=nope] does not exist',
            logs: ['orders'],
        });

        const output = await executeEditDbtProject(
            getEditDbtProject({ editDbtProject, acceptsScript: true }),
            { script: 'yaml.remove()' },
        );

        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'unknown',
        });
        expect(output.result).toContain('models.[name=nope] does not exist');
        expect(output.result).toContain('console.log:\norders');
        expect(toolEditDbtProjectOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
