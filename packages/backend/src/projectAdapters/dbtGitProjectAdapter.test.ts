import {
    AuthorizationError,
    NotFoundError,
    UnexpectedGitError,
    UnexpectedServerError,
    type ExploreError,
} from '@lightdash/common';
import { GitError } from 'simple-git';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtGitProjectAdapter, gitErrorHandler } from './dbtGitProjectAdapter';

const TOKEN_URL =
    'https://lightdash:ghp_secret_token_123@github.com/org/repo.git';

const GIT_STDERR_WITH_TOKEN = `Cloning into '/tmp/git_abc'...\nfatal: Authentication failed for '${TOKEN_URL}/'\n`;

describe('gitErrorHandler', () => {
    it('should strip credentials from stderr on the authentication failed branch', () => {
        try {
            gitErrorHandler(new Error(GIT_STDERR_WITH_TOKEN), 'org/repo');
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(AuthorizationError);
            const serialized = JSON.stringify(e);
            expect(serialized).not.toContain('ghp_secret_token_123');
            expect(serialized).toContain('//*****@github.com');
        }
    });

    it('should strip credentials from stderr on the fallback branch', () => {
        try {
            gitErrorHandler(
                new Error(
                    `fatal: unable to access '${TOKEN_URL}/': Could not resolve host`,
                ),
                'org/repo',
            );
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(UnexpectedGitError);
            expect((e as Error).message).not.toContain('ghp_secret_token_123');
            expect((e as Error).message).toContain('//*****@github.com');
        }
    });

    it('should strip credentials when the thrown value is not an Error', () => {
        try {
            gitErrorHandler(GIT_STDERR_WITH_TOKEN, 'org/repo');
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(UnexpectedServerError);
            expect((e as Error).message).not.toContain('ghp_secret_token_123');
            expect((e as Error).message).toContain('//*****@github.com');
        }
    });

    it('should strip credentials from stderr on the GitError branch', () => {
        try {
            gitErrorHandler(
                new GitError(
                    { commands: ['clone', TOKEN_URL] } as never,
                    `Cloning into '/tmp/git_abc'...\nfatal: unable to access '${TOKEN_URL}/': server certificate verification failed\n`,
                ),
                'org/repo',
            );
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(UnexpectedGitError);
            expect((e as Error).message).not.toContain('ghp_secret_token_123');
            expect((e as Error).message).toContain('//*****@github.com');
        }
    });

    it('should return a NotFoundError without stderr for unknown repositories', () => {
        try {
            gitErrorHandler(
                new Error(
                    "remote: Repository not found.\nfatal: repository 'https://github.com/org/repo.git/' not found",
                ),
                'org/repo',
            );
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(NotFoundError);
            expect((e as Error).message).toContain(
                'Could not find git repository "org/repo"',
            );
        }
    });
});

describe('Git explore compilation', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(['prepareExploreStream', 'compileAllExplores'] as const)(
        '%s refreshes the checkout before preparing the compile',
        async (method) => {
            const adapter = Object.create(
                DbtGitProjectAdapter.prototype,
            ) as DbtGitProjectAdapter;
            const refresh = vi.fn(async () => undefined);
            Object.defineProperty(adapter, '_refreshRepo', { value: refresh });
            const explore: ExploreError = {
                name: 'orders',
                label: 'Orders',
                errors: [],
            };
            const prepare = vi
                .mocked(
                    vi.spyOn(
                        DbtBaseProjectAdapter.prototype,
                        'prepareExploreStream',
                    ),
                )
                .mockImplementation(async () => {
                    expect(refresh).toHaveBeenCalledTimes(1);
                    return (async function* stream() {
                        yield explore;
                    })();
                });

            const result = await adapter[method](undefined, false, true);
            const collected = [];
            for await (const item of result) collected.push(item);

            expect(collected).toEqual([explore]);
            expect(prepare).toHaveBeenCalledExactlyOnceWith(
                undefined,
                false,
                true,
            );
            expect(refresh).toHaveBeenCalledTimes(1);
        },
    );
});
