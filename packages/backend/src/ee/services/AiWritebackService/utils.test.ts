import {
    DbtProjectType,
    ParameterError,
    PullRequestProvider,
    type DbtGithubProjectConfig,
    type DbtGitlabProjectConfig,
    type DbtProjectConfig,
} from '@lightdash/common';
import {
    PR_DESCRIPTION_CLOSE,
    PR_DESCRIPTION_OPEN,
    PR_TITLE_CLOSE,
    PR_TITLE_OPEN,
} from './constants';
import {
    buildCloneTarget,
    buildCoAuthorTrailer,
    buildGitlabCommitAuthor,
    buildNoreplyEmail,
    buildUserCoAuthorTrailer,
    describeToolStep,
    extractPrMetadata,
    interpretAgentEvent,
    parseGithubConnection,
    parseGitlabConnection,
    parseGitNameStatus,
    parseMergeRequestUrl,
    parsePullNumber,
    parsePullRequestUrl,
    progressTextForStage,
    resolvePrMetadataValue,
    resolveSandboxTemplateRef,
    splitStreamBuffer,
    summarizeToolInput,
} from './utils';

const githubConfig = (
    overrides: Partial<DbtGithubProjectConfig> = {},
): DbtProjectConfig => ({
    type: DbtProjectType.GITHUB,
    authorization_method: 'installation_id',
    repository: 'acme/analytics',
    branch: 'main',
    project_sub_path: '/',
    ...overrides,
});

const gitlabConfig = (
    overrides: Partial<DbtGitlabProjectConfig> = {},
): DbtProjectConfig => ({
    type: DbtProjectType.GITLAB,
    personal_access_token: 'pat',
    repository: 'acme/analytics',
    branch: 'main',
    project_sub_path: '/',
    ...overrides,
});

describe('parseGithubConnection', () => {
    it('splits owner/repo and normalises the repo-root sub-path', () => {
        expect(parseGithubConnection(githubConfig())).toEqual({
            provider: PullRequestProvider.GITHUB,
            owner: 'acme',
            repo: 'analytics',
            projectSubPath: '.',
            branch: 'main',
        });
    });

    it('carries the configured branch through', () => {
        expect(
            parseGithubConnection(githubConfig({ branch: 'develop' })).branch,
        ).toBe('develop');
    });

    it('returns an empty branch when none is configured', () => {
        expect(parseGithubConnection(githubConfig({ branch: '' })).branch).toBe(
            '',
        );
    });

    it('strips leading and trailing slashes from a nested sub-path', () => {
        expect(
            parseGithubConnection(
                githubConfig({ project_sub_path: '/dbt/project/' }),
            ).projectSubPath,
        ).toBe('dbt/project');
    });

    it('throws for a non-GitHub dbt connection', () => {
        expect(() =>
            parseGithubConnection({ type: DbtProjectType.DBT }),
        ).toThrow(ParameterError);
    });

    it('throws when the repository is not owner/repo', () => {
        expect(() =>
            parseGithubConnection(githubConfig({ repository: 'analytics' })),
        ).toThrow(ParameterError);
    });
});

describe('parseGitlabConnection', () => {
    it('defaults the host to gitlab.com', () => {
        expect(parseGitlabConnection(gitlabConfig())).toEqual({
            provider: PullRequestProvider.GITLAB,
            owner: 'acme',
            repo: 'analytics',
            projectSubPath: '.',
            hostDomain: 'gitlab.com',
        });
    });

    it('honours a self-hosted host_domain', () => {
        expect(
            parseGitlabConnection(
                gitlabConfig({ host_domain: 'gitlab.acme.com' }),
            ).hostDomain,
        ).toBe('gitlab.acme.com');
    });

    it('throws for a non-GitLab dbt connection', () => {
        expect(() => parseGitlabConnection(githubConfig())).toThrow(
            ParameterError,
        );
    });
});

describe('buildCloneTarget', () => {
    it('builds a GitHub x-access-token target', () => {
        expect(
            buildCloneTarget(parseGithubConnection(githubConfig()), 'tok'),
        ).toEqual({
            url: 'https://github.com/acme/analytics.git',
            username: 'x-access-token',
            password: 'tok',
        });
    });

    it('builds a GitLab oauth2 target honouring the host', () => {
        expect(
            buildCloneTarget(
                parseGitlabConnection(
                    gitlabConfig({ host_domain: 'gitlab.acme.com' }),
                ),
                'tok',
            ),
        ).toEqual({
            url: 'https://gitlab.acme.com/acme/analytics.git',
            username: 'oauth2',
            password: 'tok',
        });
    });
});

describe('parsePullRequestUrl', () => {
    it('parses a github.com pull request link', () => {
        expect(
            parsePullRequestUrl('https://github.com/acme/analytics/pull/42'),
        ).toEqual({ owner: 'acme', repo: 'analytics', pullNumber: 42 });
    });

    it.each([
        'https://gitlab.com/acme/analytics/pull/1',
        'https://github.com/acme/analytics/pull/0',
        'not a url',
    ])('throws for %p', (url) => {
        expect(() => parsePullRequestUrl(url)).toThrow(ParameterError);
    });
});

describe('parseMergeRequestUrl', () => {
    it('parses a merge request link on the connection host', () => {
        expect(
            parseMergeRequestUrl(
                'https://gitlab.com/acme/analytics/-/merge_requests/42',
                'gitlab.com',
            ),
        ).toEqual({ projectPath: 'acme/analytics', mergeRequestIid: 42 });
    });

    it('parses a nested-group project path', () => {
        expect(
            parseMergeRequestUrl(
                'https://gitlab.acme.com/group/sub/proj/-/merge_requests/7',
                'gitlab.acme.com',
            ),
        ).toEqual({ projectPath: 'group/sub/proj', mergeRequestIid: 7 });
    });

    it.each([
        [
            'https://gitlab.com/acme/analytics/-/merge_requests/1',
            'gitlab.acme.com',
        ],
        ['https://gitlab.com/acme/analytics/pull/1', 'gitlab.com'],
        ['not a url', 'gitlab.com'],
    ])('throws for %p on %p', (url, host) => {
        expect(() => parseMergeRequestUrl(url, host)).toThrow(ParameterError);
    });
});

describe('parsePullNumber', () => {
    it('extracts the trailing pull number', () => {
        expect(
            parsePullNumber('https://github.com/acme/analytics/pull/42'),
        ).toBe(42);
    });

    it('extracts the trailing merge request iid', () => {
        expect(
            parsePullNumber(
                'https://gitlab.com/acme/analytics/-/merge_requests/9',
            ),
        ).toBe(9);
    });

    it.each(['https://github.com/acme/analytics/pull/0', 'no-number', ''])(
        'throws for %p',
        (url) => {
            expect(() => parsePullNumber(url)).toThrow(ParameterError);
        },
    );
});

describe('progressTextForStage', () => {
    it('maps each side-effecting stage to a label', () => {
        expect(progressTextForStage('install')).toBe('Setting up');
        expect(progressTextForStage('sandbox')).toBe('Starting sandbox');
        expect(progressTextForStage('clone')).toBe('Cloning project');
        expect(progressTextForStage('agent')).toBe('Starting sub agent');
        expect(progressTextForStage('commit')).toBe('Committing changes');
        expect(progressTextForStage('push')).toBe('Pushing changes');
    });

    it('opts pull_request out of progress reporting', () => {
        expect(progressTextForStage('pull_request')).toBeNull();
    });
});

describe('extractPrMetadata', () => {
    const wrap = (title: string, description: string): string =>
        `${PR_TITLE_OPEN}${title}${PR_TITLE_CLOSE}\n` +
        `${PR_DESCRIPTION_OPEN}${description}${PR_DESCRIPTION_CLOSE}`;

    it('parses title/description and strips the blocks from stdout', () => {
        const stdout = `Here is the change.\n\n${wrap('Add metric', 'Adds a revenue metric.')}`;
        expect(extractPrMetadata(stdout)).toEqual({
            title: 'Add metric',
            description: 'Adds a revenue metric.',
            sanitizedStdout: 'Here is the change.',
        });
    });

    it('returns null fields when the blocks are absent', () => {
        expect(extractPrMetadata('just a reply')).toEqual({
            title: null,
            description: null,
            sanitizedStdout: 'just a reply',
        });
    });

    it('collapses the gap left behind into a single blank line', () => {
        const stdout = `Top\n\n${PR_TITLE_OPEN}T${PR_TITLE_CLOSE}\n\n\nBottom`;
        expect(extractPrMetadata(stdout).sanitizedStdout).toBe('Top\n\nBottom');
    });
});

describe('resolvePrMetadataValue', () => {
    it('prefers the tmp value', () => {
        expect(
            resolvePrMetadataValue({
                fromTmp: '  Title  ',
                fromRepo: 'Repo title',
                fallback: 'fallback',
            }),
        ).toEqual({ source: 'tmp', value: 'Title' });
    });

    it('falls back to the repo copy when tmp is blank', () => {
        expect(
            resolvePrMetadataValue({
                fromTmp: '   ',
                fromRepo: ' Repo title ',
                fallback: 'fallback',
            }),
        ).toEqual({ source: 'repo-fallback', value: 'Repo title' });
    });

    it('uses the fallback when both sources are empty', () => {
        expect(
            resolvePrMetadataValue({
                fromTmp: null,
                fromRepo: null,
                fallback: 'fallback',
            }),
        ).toEqual({ source: 'default', value: 'fallback' });
    });
});

describe('parseGitNameStatus', () => {
    it('splits additions from deletions', () => {
        const stdout = 'A\0added.sql\0M\0modified.yml\0D\0removed.sql\0';
        expect(parseGitNameStatus(stdout)).toEqual({
            addPaths: ['added.sql', 'modified.yml'],
            deletions: [{ path: 'removed.sql' }],
        });
    });

    it('returns empty changes for empty output', () => {
        expect(parseGitNameStatus('')).toEqual({
            addPaths: [],
            deletions: [],
        });
    });
});

describe('interpretAgentEvent', () => {
    it('reads assistant text and tool calls', () => {
        const event = {
            type: 'assistant',
            message: {
                content: [
                    { type: 'text', text: 'Editing ' },
                    { type: 'text', text: 'models' },
                    {
                        type: 'tool_use',
                        name: 'Edit',
                        input: { file_path: '/a' },
                    },
                ],
            },
        };
        expect(interpretAgentEvent(event)).toEqual({
            type: 'assistant',
            text: 'Editing models',
            toolCalls: [{ name: 'Edit', input: { file_path: '/a' } }],
        });
    });

    it('returns null text when an assistant message has no text blocks', () => {
        const event = {
            type: 'assistant',
            message: { content: [{ type: 'tool_use', name: 'Read' }] },
        };
        expect(interpretAgentEvent(event)).toEqual({
            type: 'assistant',
            text: null,
            toolCalls: [{ name: 'Read', input: undefined }],
        });
    });

    it('ignores an assistant message whose content is not an array', () => {
        expect(
            interpretAgentEvent({
                type: 'assistant',
                message: { content: 'x' },
            }),
        ).toEqual({ type: 'assistant', text: null, toolCalls: [] });
    });

    it('reads the cost and timing from a result event', () => {
        expect(
            interpretAgentEvent({
                type: 'result',
                total_cost_usd: 0.42,
                duration_ms: 90000,
                duration_api_ms: 30000,
                num_turns: 7,
            }),
        ).toEqual({
            type: 'result',
            costUsd: 0.42,
            durationMs: 90000,
            durationApiMs: 30000,
            numTurns: 7,
        });
    });

    it('defaults missing result timing fields to null', () => {
        expect(
            interpretAgentEvent({ type: 'result', total_cost_usd: 0.42 }),
        ).toEqual({
            type: 'result',
            costUsd: 0.42,
            durationMs: null,
            durationApiMs: null,
            numTurns: null,
        });
    });

    it.each([null, 'string', { type: 'system' }, undefined])(
        'ignores %p',
        (event) => {
            expect(interpretAgentEvent(event)).toEqual({ type: 'ignored' });
        },
    );
});

describe('describeToolStep', () => {
    it('names the file being edited (basename only)', () => {
        expect(
            describeToolStep({
                name: 'Edit',
                input: { file_path: '/home/user/repo/models/fm_parts.yml' },
            }),
        ).toBe('Editing fm_parts.yml');
        expect(
            describeToolStep({
                name: 'Write',
                input: { file_path: 'models/orders.yml' },
            }),
        ).toBe('Editing orders.yml');
    });

    it('names the file being read', () => {
        expect(
            describeToolStep({
                name: 'Read',
                input: { file_path: 'models/staging/stg_orders.sql' },
            }),
        ).toBe('Reading stg_orders.sql');
    });

    it('describes a search by its pattern', () => {
        expect(
            describeToolStep({ name: 'Grep', input: { pattern: 'revenue' } }),
        ).toBe('Searching for "revenue"');
    });

    it('labels a lightdash compile Bash command', () => {
        expect(
            describeToolStep({
                name: 'Bash',
                input: { command: 'lightdash compile --project-dir .' },
            }),
        ).toBe('Compiling project');
    });

    it('returns null for non-compile Bash and unknown tools', () => {
        expect(
            describeToolStep({ name: 'Bash', input: { command: 'ls -la' } }),
        ).toBeNull();
        expect(describeToolStep({ name: 'TodoWrite', input: {} })).toBeNull();
    });

    it('falls back to a generic label when no file is given', () => {
        expect(describeToolStep({ name: 'Edit', input: {} })).toBe(
            'Editing files',
        );
        expect(describeToolStep({ name: 'Read', input: {} })).toBe(
            'Reading files',
        );
    });
});

describe('summarizeToolInput', () => {
    it('prefers file_path, then command, then pattern', () => {
        expect(summarizeToolInput({ file_path: '/models/x.sql' })).toBe(
            '/models/x.sql',
        );
        expect(summarizeToolInput({ pattern: 'revenue' })).toBe('revenue');
    });

    it('truncates a long command to 120 chars', () => {
        const command = 'x'.repeat(200);
        expect(summarizeToolInput({ command })).toHaveLength(120);
    });

    it('falls back to JSON for shapeless input', () => {
        expect(summarizeToolInput({ foo: 'bar' })).toBe('{"foo":"bar"}');
    });

    it('returns a placeholder for unserializable input', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(summarizeToolInput(circular)).toBe('<unserializable>');
    });
});

describe('splitStreamBuffer', () => {
    it('returns complete lines and carries the unterminated remainder', () => {
        expect(splitStreamBuffer('a\nb\nhalf')).toEqual({
            lines: ['a', 'b'],
            remainder: 'half',
        });
    });

    it('leaves an empty remainder when the buffer ends with a newline', () => {
        expect(splitStreamBuffer('a\nb\n')).toEqual({
            lines: ['a', 'b'],
            remainder: '',
        });
    });
});

describe('github identity helpers', () => {
    it('builds the noreply email', () => {
        expect(buildNoreplyEmail({ id: 123, login: 'octocat' })).toBe(
            '123+octocat@users.noreply.github.com',
        );
    });

    it('builds the co-author trailer', () => {
        expect(buildCoAuthorTrailer({ id: 7, login: 'lightdash-bot' })).toBe(
            'Co-authored-by: lightdash-bot <7+lightdash-bot@users.noreply.github.com>',
        );
    });

    it('builds the user co-author trailer from name + email', () => {
        expect(
            buildUserCoAuthorTrailer({
                firstName: 'Ada',
                lastName: 'Lovelace',
                email: 'ada@example.com',
            }),
        ).toBe('Co-authored-by: Ada Lovelace <ada@example.com>');
    });

    it('falls back to the email as the name when no name is set', () => {
        expect(
            buildUserCoAuthorTrailer({
                firstName: '',
                lastName: '',
                email: 'ada@example.com',
            }),
        ).toBe('Co-authored-by: ada@example.com <ada@example.com>');
    });

    it('returns null when the user has no email to credit', () => {
        expect(
            buildUserCoAuthorTrailer({
                firstName: 'Ada',
                lastName: 'Lovelace',
                email: undefined,
            }),
        ).toBeNull();
    });
});

describe('buildGitlabCommitAuthor', () => {
    it('uses the user name and email when present', () => {
        expect(
            buildGitlabCommitAuthor(
                {
                    id: 5,
                    username: 'jdoe',
                    name: 'Jane Doe',
                    email: 'jane@acme.com',
                },
                'gitlab.com',
            ),
        ).toEqual({ name: 'Jane Doe', email: 'jane@acme.com' });
    });

    it('falls back to a host-scoped noreply email when email is private', () => {
        expect(
            buildGitlabCommitAuthor(
                { id: 5, username: 'jdoe', name: null, email: null },
                'gitlab.acme.com',
            ),
        ).toEqual({
            name: 'jdoe',
            email: '5-jdoe@users.noreply.gitlab.acme.com',
        });
    });
});

describe('resolveSandboxTemplateRef', () => {
    it('appends the tag when present', () => {
        expect(resolveSandboxTemplateRef({ name: 'tpl', tag: 'v2' })).toBe(
            'tpl:v2',
        );
    });

    it('omits the tag separator when the tag is empty', () => {
        expect(resolveSandboxTemplateRef({ name: 'tpl', tag: '' })).toBe('tpl');
    });
});
