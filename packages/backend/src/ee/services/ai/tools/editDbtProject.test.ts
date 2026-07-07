import { getEditDbtProject } from './editDbtProject';

type EditDbtProjectTool = ReturnType<typeof getEditDbtProject>;
type EditDbtProjectOutput = {
    result: string;
    metadata?: {
        status: string;
        prUrl?: string | null;
        prAction?: string | null;
    };
};

// Minimal successful writeback result covering the fields the tool destructures.
const successResult = {
    prUrl: 'https://github.com/acme/dbt/pull/7',
    prAction: 'opened' as const,
    commitSha: 'abc123',
    additions: 4,
    deletions: 4,
    output: 'Updated four descriptions.',
    projectName: 'Analytics',
    repository: 'acme/dbt',
    previewDeployConfigured: true,
    previewUrl: null,
    steps: [],
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
        const editDbtProject = vi.fn().mockResolvedValue(successResult);

        await executeEditDbtProject(getEditDbtProject({ editDbtProject }), {
            startNewPullRequest: true,
        });

        expect(editDbtProject).toHaveBeenCalledWith(
            expect.objectContaining({ startNewPullRequest: true }),
        );
    });

    it('forwards a null startNewPullRequest unchanged (default follow-up)', async () => {
        const editDbtProject = vi.fn().mockResolvedValue(successResult);

        await executeEditDbtProject(getEditDbtProject({ editDbtProject }), {
            startNewPullRequest: null,
        });

        expect(editDbtProject).toHaveBeenCalledWith(
            expect.objectContaining({ startNewPullRequest: null }),
        );
    });

    it('reports an opened PR without leaking the URL into the reply', async () => {
        const editDbtProject = vi.fn().mockResolvedValue(successResult);

        const output = await executeEditDbtProject(
            getEditDbtProject({ editDbtProject }),
        );

        expect(output.metadata?.status).toBe('success');
        expect(output.metadata?.prUrl).toBe(successResult.prUrl);
        expect(output.result).not.toContain(successResult.prUrl);
    });
});
