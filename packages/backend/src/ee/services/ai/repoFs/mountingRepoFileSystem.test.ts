import { runShellCommandOnFs, ShellError } from './bashShell';
import { MountingRepoFileSystem } from './mountingRepoFileSystem';
import { RepoFs, type RepoSource } from './RepoFs';

/** A minimal in-memory RepoSource (no GitHub). */
const fakeSource = (files: Record<string, string>): RepoSource => ({
    label: 'fake',
    listAllPaths: async () => ({
        files: Object.entries(files).map(([path, content]) => ({
            path,
            size: content.length,
        })),
        truncated: false,
    }),
    readFile: async (path) => files[path] ?? null,
});

const REPO_FILES: Record<string, Record<string, string>> = {
    'acme/web': {
        'package.json': '{"name":"web"}\n',
        'src/index.ts': 'export const x = 1;\n',
    },
    'acme/api': {
        'package.json': '{"name":"api"}\n',
        'main.py': 'print("api")\n',
    },
    'globex/infra': {
        'README.md': '# infra\n',
        'terraform/main.tf': 'resource "null" "x" {}\n',
    },
};
const DBT_FILES = {
    'dbt_project.yml': 'name: jaffle_shop\n',
    'models/orders.sql': 'select 1 as order_id\n',
};
const REPO_LIST = [
    { owner: 'acme', repo: 'web' },
    { owner: 'acme', repo: 'api' },
    { owner: 'globex', repo: 'infra' },
];

describe('MountingRepoFileSystem', () => {
    let materialised: string[];
    let listCalls: number;

    beforeEach(() => {
        materialised = [];
        listCalls = 0;
    });

    const make = (
        opts: { hasDbtMount?: boolean; maxRepos?: number } = {},
    ): Promise<MountingRepoFileSystem> =>
        MountingRepoFileSystem.create({
            listRepos: async () => {
                listCalls += 1;
                return REPO_LIST;
            },
            hasDbtMount: opts.hasDbtMount ?? true,
            buildDbtRepoFs: async () => {
                materialised.push('dbt');
                return new RepoFs(fakeSource(DBT_FILES));
            },
            buildRepoFs: async (owner, repo) => {
                materialised.push(`${owner}/${repo}`);
                const files = REPO_FILES[`${owner}/${repo}`];
                if (!files) throw new Error(`unknown repo ${owner}/${repo}`);
                return new RepoFs(fakeSource(files));
            },
            maxRepos: opts.maxRepos ?? 10,
        });

    // Mirror production: the exploreRepo closure resets the per-command budget
    // before each command.
    const run = (fs: MountingRepoFileSystem, command: string) => {
        fs.beginCommand();
        return runShellCommandOnFs(fs, command);
    };

    describe('construction is lazy', () => {
        it('fetches the repo list once and no trees', async () => {
            await make();
            expect(listCalls).toBe(1);
            expect(materialised).toEqual([]);
        });
    });

    describe('virtual mount tree', () => {
        it('lists dbt + owners at the root', async () => {
            expect(await run(await make(), 'ls /')).toBe(
                ['dbt', 'acme', 'globex'].sort().join('\n'),
            );
        });

        it('omits /dbt when there is no dbt mount', async () => {
            const out = await run(await make({ hasDbtMount: false }), 'ls /');
            expect(out).toBe(['acme', 'globex'].sort().join('\n'));
            expect(out).not.toContain('dbt');
        });

        it('lists an owner’s repos without fetching any tree', async () => {
            const fs = await make();
            expect(await run(fs, 'ls /acme')).toBe('api\nweb');
            expect(materialised).toEqual([]); // listing repos ≠ opening them
        });
    });

    describe('reading through mounts', () => {
        it('reads a file from a repo mount, materialising it once', async () => {
            const fs = await make();
            expect(await run(fs, 'cat /acme/web/package.json')).toBe(
                '{"name":"web"}',
            );
            expect(materialised).toEqual(['acme/web']);
            // second read of the same mount does not re-materialise
            await run(fs, 'cat /acme/web/src/index.ts');
            expect(materialised).toEqual(['acme/web']);
        });

        it('reads the dbt project at /dbt (subPath-style root)', async () => {
            const fs = await make();
            expect(await run(fs, 'cat /dbt/dbt_project.yml')).toBe(
                'name: jaffle_shop',
            );
            expect(await run(fs, 'ls /dbt')).toContain('dbt_project.yml');
            expect(materialised).toEqual(['dbt']);
        });

        it('reads across two repos in a single command', async () => {
            const fs = await make();
            const out = await run(
                fs,
                'cat /acme/web/package.json /globex/infra/README.md',
            );
            expect(out).toContain('{"name":"web"}');
            expect(out).toContain('# infra');
            expect(materialised.sort()).toEqual(['acme/web', 'globex/infra']);
        });
    });

    describe('materialisation budget', () => {
        it('never materialises more repos than the budget allows', async () => {
            // The cost guarantee: at most `maxRepos` trees are ever fetched per
            // run. A multi-repo `cat` past the budget degrades the over-budget
            // path to "absent" (host command tolerates a per-file miss), so the
            // extra tree is simply never fetched.
            const fs = await make({ maxRepos: 1 });
            await run(
                fs,
                'cat /acme/web/package.json /acme/api/package.json',
            ).catch(() => undefined);
            expect(materialised).toEqual(['acme/web']);
        });

        it('surfaces a clear, recoverable error on an unscoped recursive walk', async () => {
            // The actual footgun: `find /` / `grep -r /` recurse via readdir, so
            // descending into the (budget+1)th repo throws — and find aborts the
            // walk, so the agent gets the named limit instead of a silent cap.
            const fs = await make({ maxRepos: 1 });
            await expect(run(fs, 'find / -name "*.json"')).rejects.toThrow(
                ShellError,
            );
            await expect(
                run(await make({ maxRepos: 1 }), 'find / -name "*.json"'),
            ).rejects.toThrow(/limit 1/);
        });

        it('resets the budget per command so a run can cover more repos than the cap', async () => {
            // The budget bounds a single command, not the whole run. With the
            // cache persisting, a second command can open a different repo even
            // though the per-run total now exceeds maxRepos.
            const fs = await make({ maxRepos: 1 });
            expect(await run(fs, 'cat /acme/web/package.json')).toBe(
                '{"name":"web"}',
            );
            expect(await run(fs, 'cat /globex/infra/README.md')).toContain(
                '# infra',
            );
            expect(materialised.sort()).toEqual(['acme/web', 'globex/infra']);
        });

        it('a cached repo does not charge the budget on re-read', async () => {
            const fs = await make({ maxRepos: 1 });
            // First command opens acme/web (1, at the cap).
            await run(fs, 'cat /acme/web/package.json');
            // Second command re-reads the cached repo AND opens a new one — the
            // cached read is free, so the single new repo stays within budget.
            expect(
                await run(
                    fs,
                    'cat /acme/web/src/index.ts /acme/api/package.json',
                ),
            ).toContain('{"name":"api"}');
            expect(materialised.sort()).toEqual(['acme/api', 'acme/web']);
        });
    });

    describe('isolation', () => {
        it('`..` cannot climb out of the virtual filesystem', async () => {
            const fs = await make();
            await expect(
                run(fs, 'cat /acme/web/../../../../etc/passwd'),
            ).rejects.toThrow(ShellError); // resolves to /etc/passwd → absent
        });

        it('a missing repo path is ENOENT, not a fault', async () => {
            const fs = await make();
            await expect(run(fs, 'ls /acme/nope')).rejects.toThrow(ShellError);
            await expect(run(fs, 'cat /nope/x')).rejects.toThrow(ShellError);
        });

        it('every write is rejected (read-only by construction)', async () => {
            const fs = await make();
            await expect(
                run(fs, 'echo hi > /acme/web/package.json'),
            ).rejects.toThrow(ShellError);
        });
    });

    describe('getAllPaths (glob index)', () => {
        it('exposes only mount points until a repo is opened', async () => {
            const fs = await make();
            const before = fs.getAllPaths();
            expect(before).toContain('/acme/web');
            expect(before).toContain('/dbt');
            expect(before).not.toContain('/acme/web/package.json');

            await fs.readdir('/acme/web'); // materialise
            const after = fs.getAllPaths();
            expect(after).toContain('/acme/web/package.json');
            expect(after).toContain('/acme/web/src/index.ts');
        });

        it('globs resolve inside an opened repo', async () => {
            const fs = await make();
            await run(fs, 'ls /acme/web'); // open it first
            expect(await run(fs, 'ls /acme/web/*.json')).toContain(
                'package.json',
            );
        });
    });
});
