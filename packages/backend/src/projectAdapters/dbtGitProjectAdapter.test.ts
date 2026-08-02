import {
    AuthorizationError,
    NotFoundError,
    UnexpectedGitError,
    UnexpectedServerError,
} from '@lightdash/common';
import { GitError } from 'simple-git';
import { gitErrorHandler } from './dbtGitProjectAdapter';

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
