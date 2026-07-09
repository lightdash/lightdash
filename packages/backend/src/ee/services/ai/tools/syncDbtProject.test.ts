import { ForbiddenError, type ToolOutput } from '@lightdash/common';
import { getSyncDbtProject } from './syncDbtProject';

type SyncDbtProjectTool = ReturnType<typeof getSyncDbtProject>;
type SyncDbtProjectOutput = {
    result: string;
    metadata?: { status: string };
};

const toolOutputToSyncDbtProjectOutput = (
    output: ToolOutput,
): SyncDbtProjectOutput => {
    const items = Array.isArray(output) ? output : [output];
    return {
        result: items
            .map((item) =>
                item.status === 'error' ? item.error : String(item.result),
            )
            .join('\n'),
        metadata: {
            status: items.some((item) => item.status === 'error')
                ? 'error'
                : 'success',
        },
    };
};

const executeSyncDbtProject = async (
    tool: SyncDbtProjectTool,
): Promise<SyncDbtProjectOutput> => {
    const result = await tool.execute!(
        { reason: null },
        {
            messages: [],
            toolCallId: 'tool-call-1',
        },
    );

    if (Symbol.asyncIterator in result) {
        throw new Error('Unexpected streaming result');
    }

    return toolOutputToSyncDbtProjectOutput(result);
};

describe('getSyncDbtProject', () => {
    it('reports success and includes the message in the model output', async () => {
        const updateProgress = vi.fn().mockResolvedValue(undefined);
        const syncDbtProject = vi.fn().mockResolvedValue({
            status: 'success',
            jobUuid: 'job-1',
            message:
                'The dbt project compiled successfully and is now up to date.',
        });
        const tool = getSyncDbtProject({ syncDbtProject, updateProgress });

        const output = await executeSyncDbtProject(tool);

        expect(updateProgress).toHaveBeenCalledWith(
            'Syncing the dbt project...',
        );
        expect(syncDbtProject).toHaveBeenCalledWith({ reason: null });
        expect(output.metadata?.status).toBe('success');
        expect(output.result).toContain('compiled successfully');
    });

    it('maps an in_progress result to success metadata (not an error)', async () => {
        const syncDbtProject = vi.fn().mockResolvedValue({
            status: 'in_progress',
            jobUuid: 'job-2',
            message:
                'The dbt project is still syncing — the compile has not finished yet.',
        });
        const tool = getSyncDbtProject({
            syncDbtProject,
            updateProgress: vi.fn().mockResolvedValue(undefined),
        });

        const output = await executeSyncDbtProject(tool);

        expect(output.metadata?.status).toBe('success');
        expect(output.result).toContain('still');
    });

    it('maps an error result to error metadata', async () => {
        const syncDbtProject = vi.fn().mockResolvedValue({
            status: 'error',
            jobUuid: 'job-3',
            message: 'The dbt project sync failed: boom',
        });
        const tool = getSyncDbtProject({
            syncDbtProject,
            updateProgress: vi.fn().mockResolvedValue(undefined),
        });

        const output = await executeSyncDbtProject(tool);

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain('boom');
    });

    it('catches a thrown error and converts it to error metadata', async () => {
        const syncDbtProject = vi.fn().mockRejectedValue(new ForbiddenError());
        const tool = getSyncDbtProject({
            syncDbtProject,
            updateProgress: vi.fn().mockResolvedValue(undefined),
        });

        const output = await executeSyncDbtProject(tool);

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain('Error syncing the dbt project.');
    });
});
