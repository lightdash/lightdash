import { getEditDbtProject } from './editDbtProject';

type EditDbtProjectTool = ReturnType<typeof getEditDbtProject>;
type EditDbtProjectOutput = {
    result: string;
    metadata?: {
        status: string;
        aiWritebackRunUuid?: string;
        errorCode?: string;
    };
};

const executeEditDbtProject = (
    tool: EditDbtProjectTool,
    args: Partial<{
        prompt: string | null;
        prUrl: string | null;
        fromActiveChangeset: boolean;
        startNewPullRequest: boolean | null;
    }> = {},
) =>
    tool.execute!(
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
    ) as Promise<EditDbtProjectOutput>;

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

        expect(output.metadata?.status).toBe('error');
        expect(output.metadata?.errorCode).toBe('unknown');
    });
});
