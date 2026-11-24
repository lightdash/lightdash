import {
    toolEditDbtProjectMetadataSchema,
    toolEditDbtProjectOutputSchema,
} from '@lightdash/common';
import { getEditDbtProject, getWrite } from './editDbtProject';

type DbtWriteTool =
    | ReturnType<typeof getEditDbtProject>
    | ReturnType<typeof getWrite>;

const executeEditDbtProject = async (
    tool: DbtWriteTool,
    args: Partial<{
        prompt: string;
        prUrl: string | null;
        startNewPullRequest: boolean | null;
        requestedBy: 'user_asked' | 'offer_accepted' | 'agent_initiated';
        script: string | null;
    }> = {},
) => {
    const { execute } = tool;
    if (!execute) throw new Error('tool has no execute');
    const output = await execute(
        {
            prompt: 'fix the descriptions',
            prUrl: null,
            startNewPullRequest: false,
            requestedBy: 'user_asked',
            script: null,
            note: null,
            options: [],
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
    it('refuses an agent-initiated change without starting a run', async () => {
        const editDbtProject = vi.fn();

        const output = await executeEditDbtProject(
            getEditDbtProject({
                editDbtProject,
            }),
            { requestedBy: 'agent_initiated' },
        );

        expect(editDbtProject).not.toHaveBeenCalled();
        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'unknown',
        });
        expect(output.result).toContain('No pull request was opened');
        expect(output.result).toContain('offer_accepted');
    });

    it.each(['user_asked', 'offer_accepted'] as const)(
        'starts a run when the change is %s',
        async (requestedBy) => {
            const editDbtProject = vi.fn().mockResolvedValue({
                status: 'started',
                inSandbox: false,
                aiWritebackRunUuid: 'run-1',
            });

            const output = await executeEditDbtProject(
                getEditDbtProject({
                    editDbtProject,
                }),
                { requestedBy },
            );

            expect(editDbtProject).toHaveBeenCalledTimes(1);
            expect(output.metadata.status).toBe('pending');
        },
    );

    it('forwards startNewPullRequest: true to the editDbtProject dependency', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'started',
            inSandbox: true,
            aiWritebackRunUuid: 'run-1',
        });

        await executeEditDbtProject(
            getEditDbtProject({
                editDbtProject,
            }),
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
            inSandbox: true,
            aiWritebackRunUuid: 'run-1',
        });

        await executeEditDbtProject(
            getEditDbtProject({
                editDbtProject,
            }),
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
            inSandbox: true,
            aiWritebackRunUuid: 'run-1',
        });

        await executeEditDbtProject(
            getEditDbtProject({
                editDbtProject,
            }),
        );

        expect(editDbtProject).toHaveBeenCalledWith(
            expect.objectContaining({ progressId: 'tool-call-1' }),
        );
    });

    it('returns a pending status with the run uuid, without waiting for the run', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'started',
            inSandbox: true,
            aiWritebackRunUuid: 'run-1',
            diffs: null,
        });

        const output = await executeEditDbtProject(
            getEditDbtProject({
                editDbtProject,
            }),
        );

        expect(output.metadata).toEqual({
            status: 'pending',
            aiWritebackRunUuid: 'run-1',
            diffs: null,
        });
        expect(output.result).toBe(
            'Started the change; the pull request opens in the background. Acknowledge it briefly. Until it opens, listWorkstreams shows it as a change still being opened.',
        );
        expect(output.result).not.toContain('run-1');
    });

    it('mirrors the started run as structured content that matches the output schema', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'started',
            inSandbox: true,
            aiWritebackRunUuid: 'run-1',
        });

        const output = await executeEditDbtProject(
            getEditDbtProject({
                editDbtProject,
            }),
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
            getEditDbtProject({
                editDbtProject,
            }),
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

    it('saves a script only through write, always on the open draft', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'started',
            inSandbox: true,
            aiWritebackRunUuid: 'run-1',
        });

        await executeEditDbtProject(getWrite({ editDbtProject }), {
            script: 'yaml.set()',
            prUrl: 'https://github.com/o/r/pull/1',
            startNewPullRequest: true,
        });
        await executeEditDbtProject(getEditDbtProject({ editDbtProject }), {
            script: 'yaml.set()',
        });

        expect(
            editDbtProject.mock.calls.map(([args]) => [
                args.script,
                args.prUrl,
                args.startNewPullRequest,
            ]),
        ).toEqual([
            ['yaml.set()', null, null],
            [null, null, false],
        ]);
    });

    it('hands a failed script back to the model with its logs', async () => {
        const editDbtProject = vi.fn().mockResolvedValue({
            status: 'script_failed',
            error: 'models.[name=nope] does not exist',
            logs: ['orders'],
        });

        const output = await executeEditDbtProject(
            getWrite({
                editDbtProject,
            }),
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

    it('carries what a script save writes on the pending result, and reads rows from before it did', async () => {
        const diffs = [
            '--- a/models/a.yml\n+++ b/models/a.yml\n@@ -1,1 +1,1 @@\n-a\n+b\n',
        ];
        const output = await executeEditDbtProject(
            getWrite({
                editDbtProject: vi.fn().mockResolvedValue({
                    status: 'started',
                    inSandbox: false,
                    aiWritebackRunUuid: 'run-1',
                    diffs,
                }),
            }),
            { script: 'yaml.set()' },
        );

        expect(output.metadata).toEqual({
            status: 'pending',
            aiWritebackRunUuid: 'run-1',
            diffs,
        });
        expect(output.result).not.toContain('+b');
        expect(toolEditDbtProjectOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(
            toolEditDbtProjectMetadataSchema.safeParse({
                status: 'pending',
                aiWritebackRunUuid: 'run-1',
            }).success,
        ).toBe(true);
    });

    it('says a save that falls back to the sandbox takes minutes', async () => {
        const started = (inSandbox: boolean) =>
            executeEditDbtProject(
                getWrite({
                    editDbtProject: vi.fn().mockResolvedValue({
                        status: 'started',
                        inSandbox,
                        aiWritebackRunUuid: 'run-1',
                    }),
                }),
                { script: 'yaml.set()' },
            );

        expect((await started(true)).result).toContain('a few minutes');
        expect((await started(false)).result).not.toContain('a few minutes');
    });
});
