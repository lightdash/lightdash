import {
    parseRepoTarget,
    runRepoShellCommand,
    runShellCommandOnFs,
    ShellError,
    type RepoCodeSearchFn,
} from './bashShell';
import { RepoFileSystem } from './repoFileSystem';
import { RepoFs, type RepoSource } from './RepoFs';

describe('parseRepoTarget', () => {
    it('parses "owner/repo"', () => {
        expect(parseRepoTarget('lightdash/lightdash')).toEqual({
            owner: 'lightdash',
            repo: 'lightdash',
        });
    });

    it('trims surrounding whitespace', () => {
        expect(parseRepoTarget('  acme/analytics  ')).toEqual({
            owner: 'acme',
            repo: 'analytics',
        });
    });

    it.each(['lightdash', 'a/b/c', '/repo', 'owner/', ''])(
        'throws ShellError for malformed target %p',
        (target) => {
            expect(() => parseRepoTarget(target)).toThrow(ShellError);
        },
    );

    it('rejects an @branch suffix (default branch only)', () => {
        expect(() => parseRepoTarget('owner/repo@main')).toThrow(ShellError);
    });
});

/** A minimal in-memory RepoSource for exercising the shell end-to-end. */
const fakeSource = (
    files: Record<string, string>,
    truncated = false,
): RepoSource => ({
    label: 'owner/repo@main',
    listAllPaths: async () => ({
        files: Object.entries(files).map(([path, content]) => ({
            path,
            size: content.length,
        })),
        truncated,
    }),
    readFile: async (path) => files[path] ?? null,
});

const REPO = {
    'dbt_project.yml': 'name: jaffle\nversion: 1\n',
    'models/orders.sql':
        'select * from {{ ref("stg_orders") }}\njoin payments\n',
    'models/customers.sql': 'select * from {{ ref("stg_customers") }}\n',
    'models/schema.yml': 'models:\n  - name: orders\n  - name: customers\n',
    'models/staging/stg_orders.sql': 'select 1 as order_id\n',
};

const run = (command: string, files = REPO, truncated = false) =>
    runRepoShellCommand(new RepoFs(fakeSource(files, truncated)), command);

describe('runRepoShellCommand (just-bash)', () => {
    describe('reading', () => {
        it('lists the repo root', async () => {
            const out = await run('ls');
            expect(out).toContain('dbt_project.yml');
            expect(out).toContain('models');
        });

        it('cats a file', async () => {
            expect(await run('cat dbt_project.yml')).toBe(
                'name: jaffle\nversion: 1',
            );
        });

        it('finds files by glob', async () => {
            const out = await run('find . -name "*.sql"');
            expect(out).toContain('models/orders.sql');
            expect(out).toContain('models/staging/stg_orders.sql');
            expect(out).not.toContain('schema.yml');
        });
    });

    describe('search + pipelines', () => {
        it('greps recursively and lists matching files', async () => {
            const out = await run('grep -rl orders models');
            expect(out).toContain('models/orders.sql');
            expect(out).toContain('models/schema.yml');
        });

        it('pipes find into xargs grep', async () => {
            const out = await run('find . -name "*.sql" | xargs grep -l ref');
            expect(out).toContain('models/orders.sql');
            expect(out).toContain('models/customers.sql');
        });

        it('ranks files by line count', async () => {
            // `wc -l` emits a grand `total` line; exclude it to rank real files.
            const out = await run(
                'find models -name "*.sql" | xargs wc -l | grep -v total | sort -rn | head -1',
            );
            expect(out).toContain('models/orders.sql');
        });

        it('returns (no output) when grep matches nothing', async () => {
            expect(await run('grep -r nonexistent_token models')).toBe(
                '(no output)',
            );
        });
    });

    describe('expanded command surface (the whole point)', () => {
        it('supports sed', async () => {
            expect(await run('cat dbt_project.yml | sed -n 1p')).toBe(
                'name: jaffle',
            );
        });

        it('supports awk', async () => {
            const out = await run(
                `grep -rh name models/schema.yml | awk '{print $NF}'`,
            );
            expect(out).toContain('orders');
            expect(out).toContain('customers');
        });

        it('supports cut + sort -u and || sequencing', async () => {
            const out = await run('echo b; echo a; echo a');
            expect(out).toBe('b\na\na');
            expect(await run('printf "a\\nb\\na\\n" | sort -u')).toBe('a\nb');
        });

        it('honours 2>/dev/null without /dev/null in the VFS', async () => {
            // The old shell stripped this token; just-bash special-cases it.
            const out = await run('cat dbt_project.yml 2>/dev/null');
            expect(out).toContain('name: jaffle');
        });

        it('reads a source that defers via a macrotask (network I/O)', async () => {
            // Regression: just-bash defense-in-depth blocks setTimeout/setImmediate
            // /Proxy during script execution. Our real source does async GitHub
            // I/O DURING that window, so with defense-in-depth enabled every read
            // threw SecurityViolationError. This source defers via setTimeout to
            // mimic that; it must still read cleanly (defense-in-depth is off).
            const deferringSource: RepoSource = {
                label: 'owner/repo@main',
                listAllPaths: async () => ({
                    files: [{ path: 'models/x.sql', size: 10 }],
                    truncated: false,
                }),
                readFile: async (path) => {
                    await new Promise((resolve) => {
                        setTimeout(resolve, 0);
                    });
                    return path === 'models/x.sql' ? 'select 1\n' : null;
                },
            };
            const out = await runRepoShellCommand(
                new RepoFs(deferringSource),
                'cat models/x.sql',
            );
            expect(out).toBe('select 1');
        });
    });

    describe('search (server-side code search command)', () => {
        const fs = async () =>
            RepoFileSystem.create(new RepoFs(fakeSource(REPO)));

        const runSearch = async (
            command: string,
            search: RepoCodeSearchFn,
        ): Promise<string> =>
            runShellCommandOnFs(await fs(), command, { search });

        const matchOrders: RepoCodeSearchFn = async (_path, query) => ({
            matches:
                query === 'orders'
                    ? [
                          {
                              path: '/dbt/models/orders.sql',
                              fragments: ['join payments on orders'],
                          },
                          { path: '/dbt/models/schema.yml', fragments: [] },
                      ]
                    : [],
            note: null,
        });

        it('lists matching files with their fragments', async () => {
            const out = await runSearch('search orders', matchOrders);
            expect(out).toContain('/dbt/models/orders.sql');
            expect(out).toContain('join payments on orders');
            expect(out).toContain('/dbt/models/schema.yml');
        });

        it('passes the resolved path through to the resolver', async () => {
            const search = jest.fn(matchOrders);
            await runShellCommandOnFs(await fs(), 'search orders models', {
                cwd: '/',
                search,
            });
            expect(search).toHaveBeenCalledWith('/models', 'orders');
        });

        it('returns a terse no-match line (no quotable mechanism prose)', async () => {
            const out = await runSearch('search nothing_here', matchOrders);
            expect(out).toContain('No matches');
            expect(out).toContain('nothing_here');
            expect(out).not.toMatch(/default branch|regex/i);
        });

        it('relays the resolver note (no repo in scope / unavailable)', async () => {
            const out = await runSearch('search foo', async () => ({
                matches: [],
                note: 'search needs a single repository.',
            }));
            expect(out).toContain('search needs a single repository');
        });

        it('errors on a missing search term', async () => {
            await expect(
                runSearch('search', matchOrders),
            ).rejects.toBeInstanceOf(ShellError);
        });

        it('is unavailable when no resolver is wired (single-repo path)', async () => {
            await expect(run('search orders')).rejects.toBeInstanceOf(
                ShellError,
            );
        });
    });

    describe('read-only + error model', () => {
        it('is read-only: writes fail, repo unchanged', async () => {
            await expect(run('echo hi > models/orders.sql')).rejects.toThrow();
            // original content still intact on a fresh read
            expect(await run('cat models/orders.sql')).toContain('payments');
        });

        it('classifies a redirect-write (EROFS) as a ShellError, not a fault', async () => {
            // The filesystem throws EROFS to enforce read-only; just-bash rethrows
            // it. It must surface as a ShellError so the tool layer does NOT page
            // Sentry for an expected agent mistake (`cmd > file` is a common habit).
            await expect(
                run('echo HACKED > dbt_project.yml'),
            ).rejects.toBeInstanceOf(ShellError);
            await expect(
                run('echo more >> models/orders.sql'),
            ).rejects.toBeInstanceOf(ShellError);
        });

        it('rejects an unknown command as a ShellError', async () => {
            await expect(run('killall everything')).rejects.toBeInstanceOf(
                ShellError,
            );
        });

        it('does not register mutating commands', async () => {
            await expect(run('rm dbt_project.yml')).rejects.toBeInstanceOf(
                ShellError,
            );
        });

        it('does not register code-execution or network commands', async () => {
            // python3 / js-exec / node / curl are arbitrary-code-execution and
            // network surfaces; they must stay unavailable (flags off + not in
            // the allowlist).
            for (const cmd of [
                'python3 --version',
                'node -e "1"',
                'js-exec "1"',
                'curl https://example.com',
            ]) {
                // eslint-disable-next-line no-await-in-loop
                await expect(run(cmd)).rejects.toBeInstanceOf(ShellError);
            }
        });

        it('reports a missing file', async () => {
            await expect(run('cat nope.sql')).rejects.toBeInstanceOf(
                ShellError,
            );
        });

        it('appends a truncation note for find on a large repo', async () => {
            const out = await run('find . -name "*.sql"', REPO, true);
            expect(out).toContain('GitHub truncated');
        });
    });

    describe('partial failure (stderr must not be swallowed)', () => {
        it('surfaces the missing-file diagnostic alongside the file that was read', async () => {
            // Regression: `cat good missing` prints the existing file (stdout)
            // AND errors on the missing one (stderr, exit 1). Previously stdout
            // won unconditionally and the diagnostic was dropped, so the agent
            // saw a partial result as if it were complete. Both must surface.
            const out = await run('cat dbt_project.yml nope.sql');
            expect(out).toContain('name: jaffle');
            expect(out).toContain('nope.sql');
            expect(out).toContain('No such file');
        });

        it('does not throw — the partial output is still returned to the agent', async () => {
            await expect(
                run('cat dbt_project.yml nope.sql'),
            ).resolves.toContain('name: jaffle');
        });
    });
});
