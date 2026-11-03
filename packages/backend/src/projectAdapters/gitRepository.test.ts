import { ParameterError } from '@lightdash/common';
import execa from 'execa';
import * as fs from 'fs-extra';
import { GitError, type SimpleGit } from 'simple-git';
import { GitRepository, sparseCheckoutDirectory } from './gitRepository';

vi.mock('execa');
vi.mock('fs-extra', () => ({ access: vi.fn(), emptyDir: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it('normalizes a stored dbt subdirectory for cone checkout', () => {
    expect(sparseCheckoutDirectory('/analytics//./dbt/')).toBe('analytics/dbt');
});

it.each(['', '/', '.', './', '//./'])(
    'keeps root path %j on full checkout',
    (directory) => {
        expect(sparseCheckoutDirectory(directory)).toBeNull();
    },
);

it.each(['../dbt', '/analytics/../dbt', 'a/../b', '..', '/..', '//./../dbt'])(
    'rejects parent traversal in sparse directory %j',
    (directory) => {
        expect(() => sparseCheckoutDirectory(directory)).toThrow(
            ParameterError,
        );
        expect(() => sparseCheckoutDirectory(directory)).toThrow(
            'Project subdirectory must stay within the Git repository',
        );
    },
);

it.each([
    'analytics\\dbt',
    'dbt\nother',
    'dbt\u0000',
    'dbt\u007f',
    'a*b',
    'a?b',
    'a[b',
    'a]b',
    '/analytics/*/dbt/',
    '!x',
    '/!x/',
    '/./!x/',
    '  a/b  ',
    '/ leading/',
    '/trailing /',
    '/.// leading/./',
    '/.//trailing /./',
    ' /dbt',
    'dbt ',
    ' ',
    '/ /',
])('rejects unsupported sparse directory %j', (directory) => {
    expect(() => sparseCheckoutDirectory(directory)).toThrow(ParameterError);
    expect(() => sparseCheckoutDirectory(directory)).toThrow(
        'Project subdirectory contains characters that sparse checkout does not support',
    );
});

it.each([
    ['/analytics/dbt project/', 'analytics/dbt project'],
    ['/#x/', '#x'],
    ['/-x/', '-x'],
    ['/"x"/', '"x"'],
    ['/a /b/', 'a /b'],
    ['/a/ /b/', 'a/ /b'],
    ['/a/!b/', 'a/!b'],
    ['/analytics/..dbt/', 'analytics/..dbt'],
    ['/analytics/dbt@v2 + model (copy)/', 'analytics/dbt@v2 + model (copy)'],
    ['/分析/проект/', '分析/проект'],
    ['/\u00a0dbt/', '\u00a0dbt'],
    ['/dbt\u00a0/', 'dbt\u00a0'],
    ['/\ufeffdbt/', '\ufeffdbt'],
])('preserves literal repository directory %j', (input, expected) => {
    expect(sparseCheckoutDirectory(input)).toBe(expected);
});

it('uses only the existing git environment and pull arguments with a signal', async () => {
    vi.mocked(execa).mockReturnValue(
        Object.assign(Promise.resolve({ stdout: '' }), {
            kill: vi.fn(),
        }) as never,
    );
    const repository = new GitRepository(
        {} as SimpleGit,
        '/tmp/leaf_a',
        'https://example.test/leaf_a.git',
        'leaf_a',
        'main',
    );
    await repository.refresh(new AbortController().signal);
    expect(execa).toHaveBeenCalledExactlyOnceWith(
        'git',
        [
            'pull',
            'https://example.test/leaf_a.git',
            'main',
            '--ff-only',
            '--depth=1',
            '--no-tags',
            '--progress',
        ],
        {
            cwd: '/tmp/leaf_a',
            extendEnv: false,
            env: { GIT_TERMINAL_PROMPT: '0' },
            ...(process.platform === 'linux' ? { detached: true } : {}),
        },
    );
});

it('keeps the simple-git refresh path unchanged without a signal', async () => {
    const git = { env: vi.fn(), cwd: vi.fn(), pull: vi.fn() };
    git.env.mockReturnValue(git);
    git.cwd.mockReturnValue(git);
    const repository = new GitRepository(
        git as unknown as SimpleGit,
        '/tmp/leaf_a',
        'https://example.test/leaf_a.git',
        'leaf_a',
        'main',
    );
    await repository.refresh();
    expect(git.env).toHaveBeenCalledExactlyOnceWith('GIT_TERMINAL_PROMPT', '0');
    expect(git.cwd).toHaveBeenCalledExactlyOnceWith('/tmp/leaf_a');
    expect(git.pull).toHaveBeenCalledExactlyOnceWith(
        'https://example.test/leaf_a.git',
        'main',
        {
            '--ff-only': null,
            '--depth': 1,
            '--no-tags': null,
            '--progress': null,
        },
    );
    expect(execa).not.toHaveBeenCalled();
});

it('maps signalled clone failures through token stripping', async () => {
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('leaf_a missing'));
    vi.mocked(execa).mockReturnValue(
        Object.assign(
            Promise.reject(
                new GitError(
                    { commands: ['clone'] } as never,
                    'leaf_a https://token@example.test/leaf_a.git failed',
                ),
            ),
            { kill: vi.fn() },
        ) as never,
    );
    const repository = new GitRepository(
        {} as SimpleGit,
        '/tmp/leaf_a',
        'https://token@example.test/leaf_a.git',
        'leaf_a',
        'main',
    );
    await expect(
        repository.refresh(new AbortController().signal),
    ).rejects.toThrow('https://*****@example.test/leaf_a.git');
});
