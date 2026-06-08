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

    it('rejects unsupported commands', async () => {
        await expect(run('rm -rf /')).rejects.toThrow('Unsupported command');
    });

    it('rejects unsupported commands (sed/awk not implemented)', async () => {
        await expect(run('sed s/a/b/ models/orders.sql')).rejects.toThrow(
            'Unsupported command',
        );
    });
});
