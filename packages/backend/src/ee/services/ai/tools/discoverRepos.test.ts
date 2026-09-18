import { toolDiscoverReposOutputSchema } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import Logger from '../../../../logging/logger';
import type { DiscoverReposFn } from '../types/aiAgentDependencies';
import { getDiscoverRepos } from './discoverRepos';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const executeDiscoverRepos = async (discoverRepos: DiscoverReposFn) => {
    const { execute } = getDiscoverRepos({ discoverRepos });
    if (!execute) throw new Error('discoverRepos tool has no execute');
    const output = await execute({}, { messages: [], toolCallId: 'call-1' });
    if (!('result' in output)) throw new Error('unexpected streamed output');
    return output;
};

const repos = [
    {
        owner: 'lightdash',
        repo: 'lightdash',
        defaultBranch: 'main',
        private: false,
    },
    {
        owner: 'acme',
        repo: 'dbt-project',
        defaultBranch: 'master',
        private: true,
    },
];

describe('discoverRepos tool', () => {
    beforeEach(() => {
        vi.mocked(Sentry.captureException).mockClear();
        vi.mocked(Logger.error).mockClear();
    });

    it('lists every repository in the text and the structured content', async () => {
        const output = await executeDiscoverRepos(
            vi.fn().mockResolvedValue(repos),
        );

        expect(output).toEqual({
            result: [
                '2 repositories are accessible. Pass "owner/repo" as the exploreRepo `target` to read one:',
                '• lightdash/lightdash (default branch: main)',
                '• acme/dbt-project (default branch: master, private)',
            ].join('\n'),
            metadata: { status: 'success' },
            structuredContent: { repos },
        });
        expect(toolDiscoverReposOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('uses the singular wording for one repository', async () => {
        const output = await executeDiscoverRepos(
            vi.fn().mockResolvedValue([repos[0]]),
        );

        expect(output.result).toContain('1 repository is accessible.');
        expect(output.structuredContent).toEqual({ repos: [repos[0]] });
    });

    it('drops fields the text does not show from the structured content', async () => {
        const output = await executeDiscoverRepos(
            vi
                .fn()
                .mockResolvedValue([
                    { ...repos[0], installationToken: 'secret' },
                ]),
        );

        expect(output.structuredContent).toEqual({ repos: [repos[0]] });
    });

    it('returns an empty repos list when nothing is accessible', async () => {
        const output = await executeDiscoverRepos(
            vi.fn().mockResolvedValue([]),
        );

        expect(output).toEqual({
            result: "No repositories are accessible to this organization's GitHub App installation.",
            metadata: { status: 'success' },
            structuredContent: { repos: [] },
        });
        expect(toolDiscoverReposOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('mirrors the error text in structuredContent when discovery fails', async () => {
        const output = await executeDiscoverRepos(
            vi.fn().mockRejectedValue(new Error('GitHub App not installed')),
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error discovering repositories.');
        expect(output.result).toContain('GitHub App not installed');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolDiscoverReposOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(Logger.error).toHaveBeenCalled();
    });
});
