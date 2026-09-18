import {
    InsufficientGitPermissionsError,
    PullRequestProvider,
    toolEditProjectContextOutputSchema,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { WritebackGitNotConnectedError } from '../../AiWritebackService/errors';
import { getEditProjectContext } from './editProjectContext';

type EditProjectContextTool = ReturnType<typeof getEditProjectContext>;
type EditProjectContextArgs = Parameters<
    NonNullable<EditProjectContextTool['execute']>
>[0];

const defaultArgs: EditProjectContextArgs = {
    op: 'create',
    id: null,
    kind: 'definition',
    content: '"HR" = the high-risk diabetes cohort, not human resources.',
    terms: ['HR', 'high risk'],
    objects: [],
};

const execute = async (
    tool: EditProjectContextTool,
    args: Partial<EditProjectContextArgs> = {},
) => {
    if (!tool.execute) {
        throw new Error('Expected the tool to have an execute function');
    }
    const output = await tool.execute(
        { ...defaultArgs, ...args },
        { messages: [], toolCallId: 'tool-call-1', context: {} },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('getEditProjectContext', () => {
    it('forwards the entry to the editProjectContext dependency', async () => {
        const editProjectContext = vi
            .fn()
            .mockResolvedValue({ prUrl: 'https://pr/1', prAction: 'opened' });

        await execute(getEditProjectContext({ editProjectContext }), {
            op: 'update',
            id: 'entry-1',
        });

        expect(editProjectContext).toHaveBeenCalledWith({
            ...defaultArgs,
            op: 'update',
            id: 'entry-1',
        });
    });

    it('returns the opened pull request as text, metadata and structured content', async () => {
        const editProjectContext = vi
            .fn()
            .mockResolvedValue({ prUrl: 'https://pr/1', prAction: 'opened' });

        const output = await execute(
            getEditProjectContext({ editProjectContext }),
        );

        expect(
            toolEditProjectContextOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.metadata).toEqual({
            status: 'success',
            prUrl: 'https://pr/1',
            prAction: 'opened',
        });
        expect(output.structuredContent).toEqual({
            prAction: 'opened',
            op: 'create',
            content: defaultArgs.content,
        });
        expect(output.result).toContain('Opened a pull request that adds');
        expect(output.result).toContain(`("${defaultArgs.content}")`);
        expect(output.result).not.toContain('https://pr/1');
    });

    it('describes an updated pull request that updates an entry', async () => {
        const editProjectContext = vi
            .fn()
            .mockResolvedValue({ prUrl: 'https://pr/1', prAction: 'updated' });

        const output = await execute(
            getEditProjectContext({ editProjectContext }),
            { op: 'update', id: 'entry-1' },
        );

        expect(
            toolEditProjectContextOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.structuredContent).toEqual({
            prAction: 'updated',
            op: 'update',
            content: defaultArgs.content,
        });
        expect(output.result).toContain('Updated a pull request that updates');
    });

    it('returns an error envelope whose structured content mirrors the text', async () => {
        const editProjectContext = vi
            .fn()
            .mockRejectedValue(new Error('GitHub API unavailable'));

        const output = await execute(
            getEditProjectContext({ editProjectContext }),
        );

        expect(
            toolEditProjectContextOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'unknown',
        });
        expect(output.result).toContain(
            'Error updating project context. No pull request was opened.',
        );
        expect(output.result).toContain('GitHub API unavailable');
        expect(output.structuredContent).toEqual({ error: output.result });
    });

    it('classifies a missing GitHub installation', async () => {
        const editProjectContext = vi
            .fn()
            .mockRejectedValue(
                new WritebackGitNotConnectedError(PullRequestProvider.GITHUB),
            );

        const output = await execute(
            getEditProjectContext({ editProjectContext }),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'github_not_installed',
        });
        expect(output.structuredContent).toEqual({ error: output.result });
    });

    it('classifies insufficient git permissions', async () => {
        const editProjectContext = vi
            .fn()
            .mockRejectedValue(new InsufficientGitPermissionsError());

        const output = await execute(
            getEditProjectContext({ editProjectContext }),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'git_write_permission',
        });
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
