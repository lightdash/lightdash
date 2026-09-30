import {
    ForbiddenError,
    toolSyncDbtProjectOutputSchema,
    type ToolSyncDbtProjectOutput,
} from '@lightdash/common';
import { getSyncDbtProject } from './syncDbtProject';

type SyncDbtProjectTool = ReturnType<typeof getSyncDbtProject>;

const executeSyncDbtProject = async (
    tool: SyncDbtProjectTool,
): Promise<ToolSyncDbtProjectOutput> => {
    if (!tool.execute) throw new Error('tool.execute is not defined');
    const output = await tool.execute(
        { reason: null },
        {
            messages: [],
            toolCallId: 'tool-call-1',
            context: {},
        },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool output');
    }
    return output;
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
        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain('compiled successfully');
        expect(toolSyncDbtProjectOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.structuredContent).toEqual({
            status: 'success',
            jobUuid: 'job-1',
            message:
                'The dbt project compiled successfully and is now up to date.',
        });
    });

    it('structured content carries the same facts as the result text', async () => {
        const syncDbtProject = vi.fn().mockResolvedValue({
            status: 'success',
            jobUuid: 'job-facts',
            message: 'Compiled 42 models.',
        });
        const tool = getSyncDbtProject({
            syncDbtProject,
            updateProgress: vi.fn().mockResolvedValue(undefined),
        });

        const output = await executeSyncDbtProject(tool);

        if (!('status' in output.structuredContent)) {
            throw new Error('expected success structured content');
        }
        expect(output.result).toContain(
            `status="${output.structuredContent.status}"`,
        );
        expect(output.result).toContain(
            `jobUuid="${output.structuredContent.jobUuid}"`,
        );
        expect(output.result).toContain(output.structuredContent.message);
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

        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain('still');
        expect(toolSyncDbtProjectOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.structuredContent).toEqual({
            status: 'in_progress',
            jobUuid: 'job-2',
            message:
                'The dbt project is still syncing — the compile has not finished yet.',
        });
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

        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain('boom');
        expect(toolSyncDbtProjectOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.structuredContent).toEqual({ error: output.result });
    });

    it('catches a thrown error and converts it to error metadata', async () => {
        const syncDbtProject = vi.fn().mockRejectedValue(new ForbiddenError());
        const tool = getSyncDbtProject({
            syncDbtProject,
            updateProgress: vi.fn().mockResolvedValue(undefined),
        });

        const output = await executeSyncDbtProject(tool);

        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain('Error syncing the dbt project.');
        expect(toolSyncDbtProjectOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
