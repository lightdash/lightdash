import {
    toolListWorkstreamsOutputSchema,
    type ToolListWorkstreamsArgs,
} from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListWorkstreamsFn } from '../types/aiAgentDependencies';
import { getListWorkstreams } from './listWorkstreams';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const options: ToolExecutionOptions<Record<string, unknown>> = {
    toolCallId: 'call',
    messages: [],
    context: {},
};

const workstreams = [
    {
        repository: 'acme/web-app',
        provider: 'github',
        prUrl: 'https://github.com/acme/web-app/pull/12',
        prNumber: 12,
        summary: 'Add revenue metric',
    },
    {
        repository: 'acme/dbt',
        provider: 'github',
        prUrl: 'https://github.com/acme/dbt/pull/7',
        prNumber: 7,
        summary: null,
    },
];

const execute = async (
    listWorkstreams: ListWorkstreamsFn,
    args: ToolListWorkstreamsArgs,
) => {
    const listWorkstreamsTool = getListWorkstreams({ listWorkstreams });
    if (!listWorkstreamsTool.execute) {
        throw new Error('Missing executor');
    }
    const output = await listWorkstreamsTool.execute(args, options);
    if (Symbol.asyncIterator in output) {
        throw new Error('Unexpected streaming output');
    }
    return output;
};

describe('listWorkstreams tool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists the pull requests as text and structured content', async () => {
        const listWorkstreams = vi
            .fn<ListWorkstreamsFn>()
            .mockResolvedValue(workstreams);
        const output = await execute(listWorkstreams, { repoTarget: null });

        expect(listWorkstreams).toHaveBeenCalledWith({ repoTarget: null });
        expect(output).toEqual({
            result: [
                "2 pull requests opened in this conversation. To continue one, pass its URL as the edit tool's `prUrl` (editRepo or editDbtProject); for a separate change set `startNewPullRequest`:",
                '• acme/web-app #12 — https://github.com/acme/web-app/pull/12',
                '  Add revenue metric',
                '• acme/dbt #7 — https://github.com/acme/dbt/pull/7',
            ].join('\n'),
            metadata: { status: 'success' },
            structuredContent: {
                repoTarget: null,
                workstreams: [
                    {
                        repository: 'acme/web-app',
                        prNumber: 12,
                        prUrl: 'https://github.com/acme/web-app/pull/12',
                        summary: 'Add revenue metric',
                    },
                    {
                        repository: 'acme/dbt',
                        prNumber: 7,
                        prUrl: 'https://github.com/acme/dbt/pull/7',
                        summary: null,
                    },
                ],
            },
        });
        expect(toolListWorkstreamsOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('structured content carries the same facts as the text', async () => {
        const listWorkstreams = vi
            .fn<ListWorkstreamsFn>()
            .mockResolvedValue(workstreams);
        const output = await execute(listWorkstreams, { repoTarget: null });
        const parsed = toolListWorkstreamsOutputSchema.parse(output);

        if (!('workstreams' in parsed.structuredContent)) {
            throw new Error('Expected success structured content');
        }
        expect(output.result).toContain(
            `${parsed.structuredContent.workstreams.length} pull requests`,
        );
        parsed.structuredContent.workstreams.forEach((w) => {
            expect(output.result).toContain(`${w.repository} #${w.prNumber}`);
            expect(output.result).toContain(w.prUrl);
            if (w.summary) {
                expect(output.result).toContain(w.summary);
            }
        });
    });

    it('reports an empty list scoped to a repository', async () => {
        const listWorkstreams = vi
            .fn<ListWorkstreamsFn>()
            .mockResolvedValue([]);
        const output = await execute(listWorkstreams, {
            repoTarget: 'acme/web-app',
        });

        expect(output).toEqual({
            result: 'This conversation has not opened any pull requests on acme/web-app yet. Use editRepo or editDbtProject to open one.',
            metadata: { status: 'success' },
            structuredContent: {
                repoTarget: 'acme/web-app',
                workstreams: [],
            },
        });
        expect(toolListWorkstreamsOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('reports an empty list across all repositories', async () => {
        const listWorkstreams = vi
            .fn<ListWorkstreamsFn>()
            .mockResolvedValue([]);
        const output = await execute(listWorkstreams, { repoTarget: null });

        expect(output).toEqual({
            result: 'This conversation has not opened any pull requests yet. Use editRepo or editDbtProject to open one.',
            metadata: { status: 'success' },
            structuredContent: { repoTarget: null, workstreams: [] },
        });
    });

    it('returns the error envelope when listing fails', async () => {
        const listWorkstreams = vi
            .fn<ListWorkstreamsFn>()
            .mockRejectedValue(new Error('GitHub API 403'));
        const output = await execute(listWorkstreams, { repoTarget: null });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Error listing the pull requests for this conversation.',
        );
        expect(output.result).toContain('GitHub API 403');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolListWorkstreamsOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
