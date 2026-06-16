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
        opts: { hasDbtMount?: boolean; maxFilesPerCommand?: number } = {},
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
            maxFilesPerCommand: opts.maxFilesPerCommand,
        });

    // Mirror production: reset the per-command file budget and wire its probe.
    const run = (fs: MountingRepoFileSystem, command: string) => {
        fs.beginCommand();
        return runShellCommandOnFs(fs, command, {
            budgetHit: () => Promise.resolve(fs.wasBudgetHit()),
        });
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

    describe('tree caching', () => {
        it('fetches a repo tree once and reuses it across commands', async () => {
            const fs = await make();
            await run(fs, 'cat /acme/web/package.json');
            await run(fs, 'cat /acme/web/src/index.ts');
            expect(materialised).toEqual(['acme/web']);
        });

        it('opens many repos across commands without limit', async () => {
            const fs = await make();
            await run(fs, 'cat /acme/web/package.json');
            await run(fs, 'cat /acme/api/package.json');
            await run(fs, 'cat /globex/infra/README.md');
            expect(materialised.sort()).toEqual([
                'acme/api',
                'acme/web',
                'globex/infra',
            ]);
        });
    });

    describe('per-command file budget', () => {
        it('stops a crawl past the file limit and steers to search', async () => {
            // A crawl past the budget surfaces the steer either as an appended
            // note (grep keeps its partial output) or as a thrown ShellError
            // (find aborts) — both mention `search`.
            const fs = await make({ maxFilesPerCommand: 2 });
            const outcome = await run(
                fs,
                'grep -rln "name" /acme /globex',
            ).catch((e: Error) => e.message);
            expect(outcome).toMatch(/search/i);
        });

        it('resets the budget each command', async () => {
            const fs = await make({ maxFilesPerCommand: 1 });
            expect(await run(fs, 'cat /acme/web/package.json')).toBe(
                '{"name":"web"}',
            );
            expect(await run(fs, 'cat /globex/infra/README.md')).toContain(
                '# infra',
            );
        });

        it('allows reads within the budget', async () => {
            const fs = await make({ maxFilesPerCommand: 5 });
            const out = await run(
                fs,
                'cat /acme/web/package.json /acme/api/package.json',
            );
            expect(out).toContain('{"name":"web"}');
            expect(out).toContain('{"name":"api"}');
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

    describe('search (server-side code search routing)', () => {
        let treeFetches: string[];

        const searchableSource = (
            label: string,
            files: Record<string, string>,
        ): RepoSource => ({
            label,
            listAllPaths: async () => {
                treeFetches.push(label);
                return {
                    files: Object.entries(files).map(([path, content]) => ({
                        path,
                        size: content.length,
                    })),
                    truncated: false,
                };
            },
            readFile: async (path) => files[path] ?? null,
            searchCode: async (query) =>
                Object.entries(files)
                    .filter(([, content]) => content.includes(query))
                    .map(([path]) => ({ path, fragments: [`…${query}…`] })),
        });

        const makeSearchable = (): Promise<MountingRepoFileSystem> =>
            MountingRepoFileSystem.create({
                listRepos: async () => REPO_LIST,
                hasDbtMount: true,
                buildDbtRepoFs: async () =>
                    new RepoFs(searchableSource('dbt', DBT_FILES)),
                buildRepoFs: async (owner, repo) =>
                    new RepoFs(
                        searchableSource(
                            `${owner}/${repo}`,
                            REPO_FILES[`${owner}/${repo}`],
                        ),
                    ),
                searchOwner: async (owner, query) =>
                    Object.entries(REPO_FILES)
                        .filter(([key]) => key.startsWith(`${owner}/`))
                        .flatMap(([key, files]) => {
                            const [o, r] = key.split('/');
                            return Object.entries(files)
                                .filter(([, content]) =>
                                    content.includes(query),
                                )
                                .map(([path]) => ({
                                    owner: o,
                                    repo: r,
                                    path,
                                    fragments: [`…${query}…`],
                                }));
                        }),
            });

        beforeEach(() => {
            treeFetches = [];
        });

        it('routes to the repo the path lands in and prefixes the mount path', async () => {
            const fs = await makeSearchable();
            const { matches, note } = await fs.search('/acme/web', 'export');
            expect(note).toBeNull();
            expect(matches).toEqual([
                {
                    path: '/acme/web/src/index.ts',
                    fragments: ['…export…'],
                },
            ]);
        });

        it('does NOT fetch the repo tree (search is one API call)', async () => {
            const fs = await makeSearchable();
            await fs.search('/acme/web', 'export');
            expect(treeFetches).toEqual([]);
        });

        it('confines results to the sub-path the search targets', async () => {
            const fs = await makeSearchable();
            const scoped = await fs.search('/dbt/models', 'order_id');
            expect(scoped.matches.map((m) => m.path)).toEqual([
                '/dbt/models/orders.sql',
            ]);
            const elsewhere = await fs.search('/dbt/seeds', 'order_id');
            expect(elsewhere.matches).toEqual([]);
        });

        it('searches every repo of an owner in one call (owner-level)', async () => {
            const fs = await makeSearchable();
            const { matches, note } = await fs.search('/acme', 'name');
            expect(note).toBeNull();
            expect(matches.map((m) => m.path).sort()).toEqual([
                '/acme/api/package.json',
                '/acme/web/package.json',
            ]);
        });

        it('returns a note (no matches) when the path is the virtual root', async () => {
            const fs = await makeSearchable();
            const { matches, note } = await fs.search('/', 'anything');
            expect(matches).toEqual([]);
            expect(note).toMatch(/owner or a repository/i);
        });

        it('returns a note when the source cannot search', async () => {
            const fs = await make();
            const { note } = await fs.search('/acme/web', 'anything');
            expect(note).toMatch(/unavailable/i);
        });

        it('returns a note for an owner path when owner search is not wired', async () => {
            const fs = await make();
            const { matches, note } = await fs.search('/acme', 'anything');
            expect(matches).toEqual([]);
            expect(note).toMatch(/unavailable/i);
        });

        it('drives the `search` shell command end-to-end', async () => {
            const fs = await makeSearchable();
            const out = await runShellCommandOnFs(fs, 'search export', {
                cwd: '/acme/web',
                search: (path, query) => fs.search(path, query),
            });
            expect(out).toContain('/acme/web/src/index.ts');
        });
    });
});
