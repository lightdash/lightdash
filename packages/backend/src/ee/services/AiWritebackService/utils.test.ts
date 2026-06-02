import {
    DbtProjectType,
    ParameterError,
    type DbtGithubProjectConfig,
    type DbtProjectConfig,
} from '@lightdash/common';
import {
    PR_DESCRIPTION_CLOSE,
    PR_DESCRIPTION_OPEN,
    PR_TITLE_CLOSE,
    PR_TITLE_OPEN,
} from './constants';
import {
    buildCoAuthorTrailer,
    buildNoreplyEmail,
    buildUserCoAuthorTrailer,
    classifyToolPhase,
    extractPrMetadata,
    getPhaseProgressText,
    interpretAgentEvent,
    parseGitNameStatus,
    parsePullNumber,
    parseTrackedWorkflowPaths,
    progressTextForStage,
    resolveGithubConnection,
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

describe('resolveGithubConnection', () => {
    it('splits owner/repo and normalises the repo-root sub-path', () => {
        expect(resolveGithubConnection(githubConfig())).toEqual({
            owner: 'acme',
            repo: 'analytics',
            projectSubPath: '.',
        });
    });

    it('strips leading and trailing slashes from a nested sub-path', () => {
        expect(
            resolveGithubConnection(
                githubConfig({ project_sub_path: '/dbt/project/' }),
            ).projectSubPath,
        ).toBe('dbt/project');
    });

    it('throws for a non-GitHub dbt connection', () => {
        expect(() =>
            resolveGithubConnection({ type: DbtProjectType.DBT }),
        ).toThrow(ParameterError);
    });

    it('throws when the repository is not owner/repo', () => {
        expect(() =>
            resolveGithubConnection(githubConfig({ repository: 'analytics' })),
        ).toThrow(ParameterError);
    });
});

describe('parsePullNumber', () => {
    it('extracts the trailing pull number', () => {
        expect(
            parsePullNumber('https://github.com/acme/analytics/pull/42'),
        ).toBe(42);
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
        expect(progressTextForStage('push')).toBe('Pushing to GitHub');
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

describe('parseTrackedWorkflowPaths', () => {
    it('keeps only workflow yml/yaml files, trimmed', () => {
        const stdout = [
            '.github/workflows/deploy.yml',
            '  .github/workflows/ci.yaml  ',
            '.github/workflows/README.md',
            'dbt/model.sql',
            '',
        ].join('\n');
        expect(parseTrackedWorkflowPaths(stdout)).toEqual([
            '.github/workflows/deploy.yml',
            '.github/workflows/ci.yaml',
        ]);
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

    it('reads the final cost from a result event', () => {
        expect(
            interpretAgentEvent({ type: 'result', total_cost_usd: 0.42 }),
        ).toEqual({ type: 'result', costUsd: 0.42 });
    });

    it.each([null, 'string', { type: 'system' }, undefined])(
        'ignores %p',
        (event) => {
            expect(interpretAgentEvent(event)).toEqual({ type: 'ignored' });
        },
    );
});

describe('classifyToolPhase', () => {
    it('classifies a lightdash compile Bash command as compiling', () => {
        expect(
            classifyToolPhase({
                name: 'Bash',
                input: { command: 'lightdash compile --project-dir .' },
            }),
        ).toBe('compiling');
    });

    it('does not classify other Bash commands', () => {
        expect(
            classifyToolPhase({ name: 'Bash', input: { command: 'ls -la' } }),
        ).toBeNull();
    });

    it('classifies Edit/Write as editing and Read/Glob/Grep as discovering', () => {
        expect(classifyToolPhase({ name: 'Write', input: {} })).toBe('editing');
        expect(classifyToolPhase({ name: 'Edit', input: {} })).toBe('editing');
        expect(classifyToolPhase({ name: 'Read', input: {} })).toBe(
            'discovering',
        );
        expect(classifyToolPhase({ name: 'Grep', input: {} })).toBe(
            'discovering',
        );
    });

    it('returns null for an unknown tool', () => {
        expect(classifyToolPhase({ name: 'TodoWrite', input: {} })).toBeNull();
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

describe('getPhaseProgressText', () => {
    it('uses workflow wording for preview-deploy setup', () => {
        expect(getPhaseProgressText('preview_deploy_setup')).toEqual({
            discovering: 'Inspecting repository',
            editing: 'Writing workflow files',
            compiling: 'Validating workflow',
        });
    });

    it('uses model wording for a normal writeback', () => {
        expect(getPhaseProgressText('slack')).toEqual({
            discovering: 'Discovering models',
            editing: 'Editing models',
            compiling: 'Compiling project',
        });
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
