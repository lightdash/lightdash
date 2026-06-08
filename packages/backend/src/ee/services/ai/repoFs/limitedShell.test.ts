import { runRepoShellCommand } from './limitedShell';
import { RepoFs, RepoSource } from './RepoFs';

const FILES: Record<string, string> = {
    'dbt_project.yml': 'name: jaffle\nversion: 1.0.0\n',
    'models/orders.sql': "select * from {{ ref('stg_orders') }}\n-- total\n",
    'models/staging/stg_orders.sql': 'select 1 as id\n',
    'models/staging/stg_api_error.sql': 'select 1 as id\n',
    'README.md': 'Jaffle shop\n',
};

const fakeSource = (): RepoSource => ({
    label: 'acme/jaffle@main',
    listAllPaths: async () => ({
        files: Object.entries(FILES).map(([path, content]) => ({
            path,
            size: content.length,
        })),
        truncated: false,
    }),
    readFile: async (path) => FILES[path] ?? null,
});

const run = (command: string): Promise<string> =>
    runRepoShellCommand(new RepoFs(fakeSource()), command);

describe('repoFs limited shell', () => {
    it('lists the repo root with dirs trailing-slashed and dirs first', async () => {
        await expect(run('ls')).resolves.toBe(
            ['models/', 'dbt_project.yml', 'README.md'].join('\n'),
        );
    });

    it('lists a subdirectory', async () => {
        await expect(run('ls models')).resolves.toBe(
            ['staging/', 'orders.sql'].join('\n'),
        );
    });

    it('cats a file', async () => {
        await expect(run('cat models/orders.sql')).resolves.toBe(
            "select * from {{ ref('stg_orders') }}\n-- total",
        );
    });

    it('errors clearly on a missing file', async () => {
        await expect(run('cat models/missing.sql')).rejects.toThrow(
            'No such file or directory',
        );
    });

    it('finds by name glob', async () => {
        await expect(run('find models -name "stg_*.sql"')).resolves.toBe(
            [
                'models/staging/stg_api_error.sql',
                'models/staging/stg_orders.sql',
            ].join('\n'),
        );
    });

    it('greps recursively with file:line prefixes', async () => {
        await expect(run('grep -rn ref models')).resolves.toBe(
            "models/orders.sql:1:select * from {{ ref('stg_orders') }}",
        );
    });

    it('supports pipes (find | head)', async () => {
        const out = await run('find models -name "*.sql" | head -n 2');
        expect(out.split('\n')).toHaveLength(2);
    });

    it('supports the head -N shorthand', async () => {
        const out = await run('find models -name "*.sql" | head -1');
        expect(out.split('\n')).toHaveLength(1);
    });

    it('supports grep filtering piped stdin', async () => {
        await expect(run('cat models/orders.sql | grep total')).resolves.toBe(
            '-- total',
        );
    });

    it('counts lines with wc -l', async () => {
        await expect(run('cat models/orders.sql | wc -l')).resolves.toBe('2');
    });

    it('grep -l lists matching file names, not lines', async () => {
        await expect(run('grep -rl ref models/staging')).resolves.toBe(
            '(no output)',
        );
        await expect(run('grep -rl id models/staging')).resolves.toBe(
            [
                'models/staging/stg_api_error.sql',
                'models/staging/stg_orders.sql',
            ].join('\n'),
        );
    });

    it('xargs appends piped lines as args (find | xargs grep -l)', async () => {
        await expect(
            run('find models -name "stg_*.sql" | xargs grep -l id'),
        ).resolves.toBe(
            [
                'models/staging/stg_api_error.sql',
                'models/staging/stg_orders.sql',
            ].join('\n'),
        );
    });

    it('xargs grep -l finds files referencing a token across the repo', async () => {
        await expect(
            run('find . -name "*.sql" | xargs grep -l "ref("'),
        ).resolves.toBe('models/orders.sql');
    });

    it('xargs cat concatenates piped files', async () => {
        const out = await run('find models/staging -name "*.sql" | xargs cat');
        expect(out).toContain('select 1 as id');
    });

    it('xargs with no input runs nothing', async () => {
        await expect(
            run('find models -name "nope-*.sql" | xargs cat'),
        ).resolves.toBe('(no output)');
    });

    it('rejects catastrophic-backtracking grep patterns (ReDoS guard)', async () => {
        await expect(run('grep -rE "(a+)+$" .')).rejects.toThrow(
            'catastrophic backtracking',
        );
        await expect(run('grep -rE "(.*)*x" .')).rejects.toThrow(
            'catastrophic backtracking',
        );
        // optional inside a quantified group — bypassed the old nested-quantifier
        // heuristic but is just as catastrophic.
        await expect(run('grep -rE "(aa?)+$" .')).rejects.toThrow(
            'catastrophic backtracking',
        );
        // benign regexes still work
        await expect(run('grep -E "ref" models/orders.sql')).resolves.toContain(
            'ref',
        );
    });

    it('rejects a quantified alternation group (and does not split it as a pipe)', async () => {
        await expect(run('grep -rE "(a|aa)+$" .')).rejects.toThrow(
            'catastrophic backtracking',
        );
    });

    it('treats a quoted | as regex alternation, not a pipe', async () => {
        await expect(run('grep -rE "id|total" models')).resolves.toContain(
            '-- total',
        );
    });

    it('rejects unsupported grep flags loudly (grep -v)', async () => {
        await expect(
            run('grep -v id models/staging/stg_orders.sql'),
        ).rejects.toThrow('unsupported flag -v');
    });

    it('rejects unsupported find flags loudly (-maxdepth)', async () => {
        await expect(
            run('find models -maxdepth 1 -name "*.sql"'),
        ).rejects.toThrow('unsupported flag -maxdepth');
    });

    it('rejects unsupported ls flags loudly (-R)', async () => {
        await expect(run('ls -R models')).rejects.toThrow(
            'unsupported flag -R',
        );
    });

    it('rejects over-long grep patterns', async () => {
        await expect(
            run(`grep -E "${'a'.repeat(250)}" models/orders.sql`),
        ).rejects.toThrow('pattern too long');
    });

    it('cats a known file under a truncated tree even when absent from the listing', async () => {
        const truncatedSource: RepoSource = {
            label: 'acme/big@main',
            listAllPaths: async () => ({
                files: [{ path: 'models/visible.sql', size: 10 }],
                truncated: true,
            }),
            readFile: async (path) =>
                path === 'models/known_file.sql' ? 'select 1 as id\n' : null,
        };
        await expect(
            runRepoShellCommand(
                new RepoFs(truncatedSource),
                'cat models/known_file.sql',
            ),
        ).resolves.toBe('select 1 as id');
    });

    it('does not fall back to the source for a genuinely missing file (complete tree)', async () => {
        const calls: string[] = [];
        const source: RepoSource = {
            label: 'acme/jaffle@main',
            listAllPaths: async () => ({
                files: [{ path: 'models/orders.sql', size: 10 }],
                truncated: false,
            }),
            readFile: async (path) => {
                calls.push(path);
                return 'x';
            },
        };
        await expect(
            runRepoShellCommand(new RepoFs(source), 'cat models/missing.sql'),
        ).rejects.toThrow('No such file or directory');
        expect(calls).toEqual([]); // never hit the Contents API
    });

    it('refuses to escape the chroot via .. even on a truncated tree', async () => {
        const reads: string[] = [];
        const truncatedSource: RepoSource = {
            label: 'acme/big@main',
            listAllPaths: async () => ({
                files: [{ path: 'models/visible.sql', size: 10 }],
                truncated: true,
            }),
            readFile: async (path) => {
                reads.push(path);
                return 'SECRET';
            },
        };
        await expect(
            runRepoShellCommand(
                new RepoFs(truncatedSource),
                'cat ../secrets.env',
            ),
        ).rejects.toThrow('No such file or directory');
        expect(reads).toEqual([]); // never asked the source for a .. path
    });

    it('surfaces a truncated repo listing on tree-walking commands', async () => {
        const truncatedSource: RepoSource = {
            label: 'acme/big@main',
            listAllPaths: async () => ({
                files: [{ path: 'models/orders.sql', size: 10 }],
                truncated: true,
            }),
            readFile: async () => 'select 1\n',
        };
        const out = await runRepoShellCommand(
            new RepoFs(truncatedSource),
            'find . -name "*.sql"',
        );
        expect(out).toContain('models/orders.sql');
        expect(out).toContain('truncated');
    });

    it('rejects unsupported commands', async () => {
        await expect(run('rm -rf /')).rejects.toThrow('Unsupported command');
    });

    it('rejects unsupported commands (sed/awk not implemented)', async () => {
        await expect(run('sed s/a/b/ models/orders.sql')).rejects.toThrow(
            'Unsupported command',
        );
    });
});
