import execa from 'execa';
import * as fs from 'fs-extra';
import { simpleGit } from 'simple-git';
import { GitRepository } from './gitRepository';

vi.mock('execa');
vi.mock('fs-extra', () => ({ access: vi.fn(), emptyDir: vi.fn() }));

beforeEach(async () => {
    vi.resetAllMocks();
    const { default: realExeca } = await vi.importActual<{
        default: typeof execa;
    }>('execa');
    vi.mocked(execa).mockImplementation(() =>
        realExeca(process.execPath, ['-e', ''], {
            detached: process.platform === 'linux',
            encoding: null,
        }),
    );
});

it('selects the sparse cone before materializing the checkout without a signal', async () => {
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('No checkout yet'));
    const git = simpleGit();
    vi.spyOn(git, 'env').mockReturnThis();
    vi.spyOn(git, 'cwd').mockReturnThis();
    const clone = vi.spyOn(git, 'clone').mockResolvedValue('');
    const raw = vi.spyOn(git, 'raw').mockResolvedValue('');
    const repository = new GitRepository(
        git,
        '/tmp/checkout',
        'https://example.test/repo.git',
        'repo',
        'main',
        {},
        { kind: 'sparse', directories: ['analytics/dbt'] },
    );

    await repository.refresh();

    expect(clone).toHaveBeenCalledExactlyOnceWith(
        'https://example.test/repo.git',
        '/tmp/checkout',
        {
            '--single-branch': null,
            '--depth': 1,
            '--branch': 'main',
            '--no-tags': null,
            '--progress': null,
            '--no-checkout': null,
            '--filter': 'blob:none',
        },
    );
    expect(raw.mock.calls).toEqual([
        [['sparse-checkout', 'set', '--cone', '--', 'analytics/dbt']],
        [['checkout']],
    ]);
    expect(git.cwd).toHaveBeenCalledWith('/tmp/checkout');
});

it('selects the sparse cone before materializing the checkout with a signal', async () => {
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('No checkout yet'));
    const repository = new GitRepository(
        simpleGit(),
        '/tmp/checkout',
        'https://example.test/repo.git',
        'repo',
        'main',
        { GIT_CONFIG_GLOBAL: '/tmp/test-git-config' },
        { kind: 'sparse', directories: ['analytics/dbt'] },
    );

    await repository.refresh(new AbortController().signal);

    expect(vi.mocked(execa).mock.calls.map((call) => call[1])).toEqual([
        [
            'clone',
            '--single-branch',
            '--depth=1',
            '--branch=main',
            '--no-tags',
            '--progress',
            '--no-checkout',
            '--filter=blob:none',
            'https://example.test/repo.git',
            '/tmp/checkout',
        ],
        ['sparse-checkout', 'set', '--cone', '--', 'analytics/dbt'],
        ['checkout'],
    ]);
    expect(execa).toHaveBeenLastCalledWith('git', ['checkout'], {
        cwd: '/tmp/checkout',
        extendEnv: false,
        env: {
            GIT_CONFIG_GLOBAL: '/tmp/test-git-config',
            GIT_TERMINAL_PROMPT: '0',
        },
        ...(process.platform === 'linux' ? { detached: true } : {}),
    });
});

it.each([false, true])(
    'preserves sparse checkout on pull failure (signal=%s)',
    async (withSignal) => {
        const git = simpleGit();
        vi.spyOn(git, 'env').mockReturnThis();
        vi.spyOn(git, 'cwd').mockReturnThis();
        vi.spyOn(git, 'pull').mockRejectedValueOnce(
            new Error('Cannot fast-forward'),
        );
        const clone = vi.spyOn(git, 'clone').mockResolvedValue('');
        const raw = vi.spyOn(git, 'raw').mockResolvedValue('');
        vi.mocked(execa).mockRejectedValueOnce(
            new Error('Cannot fast-forward'),
        );
        const repository = new GitRepository(
            git,
            '/tmp/checkout',
            'https://example.test/repo.git',
            'repo',
            'main',
            {},
            { kind: 'sparse', directories: ['analytics/dbt'] },
        );

        await repository.refresh(
            withSignal ? new AbortController().signal : undefined,
        );

        expect(fs.emptyDir).toHaveBeenCalledExactlyOnceWith('/tmp/checkout');
        if (withSignal) {
            expect(execa).toHaveBeenCalledTimes(4);
            expect(execa).toHaveBeenNthCalledWith(
                1,
                'git',
                expect.arrayContaining(['pull']),
                expect.anything(),
            );
            expect(execa).toHaveBeenNthCalledWith(
                2,
                'git',
                expect.arrayContaining(['clone', '--filter=blob:none']),
                expect.anything(),
            );
            expect(execa).toHaveBeenNthCalledWith(
                3,
                'git',
                ['sparse-checkout', 'set', '--cone', '--', 'analytics/dbt'],
                expect.anything(),
            );
            expect(execa).toHaveBeenNthCalledWith(
                4,
                'git',
                ['checkout'],
                expect.anything(),
            );
            expect(vi.mocked(execa).mock.calls[1]?.[1]).toContain(
                '--filter=blob:none',
            );
        } else {
            expect(clone).toHaveBeenCalledWith(
                expect.any(String),
                '/tmp/checkout',
                expect.objectContaining({ '--filter': 'blob:none' }),
            );
            expect(raw.mock.calls).toEqual([
                [['sparse-checkout', 'set', '--cone', '--', 'analytics/dbt']],
                [['checkout']],
            ]);
        }
    },
);

it.each([false, true])(
    'leaves a successful sparse pull unchanged (signal=%s)',
    async (withSignal) => {
        const git = simpleGit();
        vi.spyOn(git, 'env').mockReturnThis();
        vi.spyOn(git, 'cwd').mockReturnThis();
        const pull = vi.spyOn(git, 'pull').mockResolvedValue({
            files: [],
            created: [],
            deleted: [],
            insertions: {},
            deletions: {},
            summary: { changes: 0, insertions: 0, deletions: 0 },
            remoteMessages: { all: [] },
        });
        const clone = vi.spyOn(git, 'clone');
        const raw = vi.spyOn(git, 'raw');
        const repository = new GitRepository(
            git,
            '/tmp/checkout',
            'https://example.test/repo.git',
            'repo',
            'main',
            {},
            { kind: 'sparse', directories: ['analytics/dbt'] },
        );

        await repository.refresh(
            withSignal ? new AbortController().signal : undefined,
        );

        if (withSignal) {
            expect(vi.mocked(execa).mock.calls.map((call) => call[1])).toEqual([
                [
                    'pull',
                    'https://example.test/repo.git',
                    'main',
                    '--ff-only',
                    '--depth=1',
                    '--no-tags',
                    '--progress',
                ],
            ]);
        } else {
            expect(pull).toHaveBeenCalledExactlyOnceWith(
                'https://example.test/repo.git',
                'main',
                {
                    '--ff-only': null,
                    '--depth': 1,
                    '--no-tags': null,
                    '--progress': null,
                },
            );
        }
        expect(clone).not.toHaveBeenCalled();
        expect(raw).not.toHaveBeenCalled();
        expect(fs.emptyDir).not.toHaveBeenCalled();
    },
);

it('does not start sparse materialization after cancellation between clone steps', async () => {
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('No checkout yet'));
    const controller = new AbortController();
    const reason = new Error('Compile cancelled');
    const { default: realExeca } = await vi.importActual<{
        default: typeof execa;
    }>('execa');
    vi.mocked(execa).mockImplementationOnce(() => {
        const child = realExeca(process.execPath, ['-e', ''], {
            detached: process.platform === 'linux',
            encoding: null,
        });
        controller.abort(reason);
        return child;
    });
    const repository = new GitRepository(
        simpleGit(),
        '/tmp/checkout',
        'https://example.test/repo.git',
        'repo',
        'main',
        {},
        { kind: 'sparse', directories: ['analytics/dbt'] },
    );

    await expect(repository.refresh(controller.signal)).rejects.toBe(reason);
    expect(execa).toHaveBeenCalledOnce();
});

it.each([false, true])(
    'strips credentials from sparse materialization failures (signal=%s)',
    async (withSignal) => {
        vi.mocked(fs.access).mockRejectedValueOnce(
            new Error('No checkout yet'),
        );
        const git = simpleGit();
        vi.spyOn(git, 'env').mockReturnThis();
        vi.spyOn(git, 'cwd').mockReturnThis();
        vi.spyOn(git, 'clone').mockResolvedValue('');
        const failure = new Error(
            'Fetch https://test-token@example.test/repo.git failed',
        );
        vi.spyOn(git, 'raw').mockRejectedValueOnce(failure);
        const { default: realExeca } = await vi.importActual<{
            default: typeof execa;
        }>('execa');
        vi.mocked(execa)
            .mockImplementationOnce(() =>
                realExeca(process.execPath, ['-e', ''], {
                    detached: process.platform === 'linux',
                    encoding: null,
                }),
            )
            .mockRejectedValueOnce(failure);
        const repository = new GitRepository(
            git,
            '/tmp/checkout',
            'https://test-token@example.test/repo.git',
            'repo',
            'main',
            {},
            { kind: 'sparse', directories: ['analytics/dbt'] },
        );

        await expect(
            repository.refresh(
                withSignal ? new AbortController().signal : undefined,
            ),
        ).rejects.toThrow('https://*****@example.test/repo.git');
    },
);
