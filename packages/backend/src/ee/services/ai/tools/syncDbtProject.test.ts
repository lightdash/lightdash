import { ForbiddenError } from '@lightdash/common';
import { getSyncDbtProject } from './syncDbtProject';

type SyncDbtProjectTool = ReturnType<typeof getSyncDbtProject>;
type SyncDbtProjectOutput = {
    result: string;
    metadata?: { status: string };
};

const executeSyncDbtProject = (tool: SyncDbtProjectTool) =>
    tool.execute!(
        { reason: null },
        {
            messages: [],
            toolCallId: 'tool-call-1',
        },
    ) as Promise<SyncDbtProjectOutput>;

describe('getSyncDbtProject', () => {
    it('reports success and includes the message in the model output', async () => {
        const updateProgress = jest.fn().mockResolvedValue(undefined);
        const syncDbtProject = jest.fn().mockResolvedValue({
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
        const syncDbtProject = jest.fn().mockResolvedValue({
            status: 'in_progress',
            jobUuid: 'job-2',
            message:
                'The dbt project is still syncing — the compile has not finished yet.',
        });
        const tool = getSyncDbtProject({
            syncDbtProject,
            updateProgress: jest.fn().mockResolvedValue(undefined),
        });

        const output = await executeSyncDbtProject(tool);

        expect(output.metadata?.status).toBe('success');
        expect(output.result).toContain('still');
    });

    it('maps an error result to error metadata', async () => {
        const syncDbtProject = jest.fn().mockResolvedValue({
            status: 'error',
            jobUuid: 'job-3',
            message: 'The dbt project sync failed: boom',
        });
        const tool = getSyncDbtProject({
            syncDbtProject,
            updateProgress: jest.fn().mockResolvedValue(undefined),
        });

        const output = await executeSyncDbtProject(tool);

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain('boom');
    });

    it('catches a thrown error and converts it to error metadata', async () => {
        const syncDbtProject = jest
            .fn()
            .mockRejectedValue(new ForbiddenError());
        const tool = getSyncDbtProject({
            syncDbtProject,
            updateProgress: jest.fn().mockResolvedValue(undefined),
        });

        const output = await executeSyncDbtProject(tool);

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain('Error syncing the dbt project.');
    });
});
