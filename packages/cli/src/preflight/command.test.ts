import {
    createPreflightCommand,
    executePreflightAction,
    exitCodeForOutcome,
    resolveCurrentVersion,
    runPreflight,
    type PreflightAction,
    type PreflightActionDependencies,
    type PreflightCommandDependencies,
} from './command';
import { getPreflightCore } from './core';

describe('preflight command arguments', () => {
    it('requires --to', async () => {
        const command = createPreflightCommand(
            vi.fn<PreflightAction>().mockResolvedValue(),
        )
            .exitOverride()
            .configureOutput({ writeErr: () => undefined });

        await expect(
            command.parseAsync(['--facts', 'facts.json'], { from: 'user' }),
        ).rejects.toMatchObject({
            code: 'commander.missingMandatoryOptionValue',
        });
    });

    it('collects repeated --facts values', async () => {
        const action = vi.fn<PreflightAction>().mockResolvedValue();
        const command = createPreflightCommand(action)
            .exitOverride()
            .configureOutput({ writeErr: () => undefined });

        await command.parseAsync(
            [
                '--to',
                '1.79.0',
                '--from',
                '1.78.0',
                '--facts',
                'first.json',
                '--facts',
                'second.json',
            ],
            { from: 'user' },
        );

        expect(action).toHaveBeenCalledWith({
            to: '1.79.0',
            from: '1.78.0',
            facts: ['first.json', 'second.json'],
            intervalSeconds: 10,
            json: false,
        });
    });

    it('leaves --facts empty so the release asset is fetched by default', async () => {
        const action = vi.fn<PreflightAction>().mockResolvedValue();
        const command = createPreflightCommand(action)
            .exitOverride()
            .configureOutput({ writeErr: () => undefined });

        await command.parseAsync(['--to', '1.79.0', '--from', '1.78.0'], {
            from: 'user',
        });

        expect(action).toHaveBeenCalledWith({
            to: '1.79.0',
            from: '1.78.0',
            facts: [],
            intervalSeconds: 10,
            json: false,
        });
    });

    it('allows --from to be omitted for server-side version discovery', async () => {
        const action = vi.fn<PreflightAction>().mockResolvedValue();
        const command = createPreflightCommand(action)
            .exitOverride()
            .configureOutput({ writeErr: () => undefined });

        await command.parseAsync(['--to', '1.79.0'], { from: 'user' });

        expect(action).toHaveBeenCalledWith({
            to: '1.79.0',
            from: null,
            facts: [],
            intervalSeconds: 10,
            json: false,
        });
    });
});

describe('current version resolution', () => {
    const migrationVersions = [
        { migration: '001-first.ts', version: '1.78.0' },
        { migration: '002-second.ts', version: '1.79.0' },
    ];

    it('derives the current version from applied migrations', () => {
        expect(
            resolveCurrentVersion({
                appliedMigrations: ['001-first.ts'],
                migrationVersions,
                suppliedVersion: null,
                stderr: vi.fn<(output: string) => void>(),
            }),
        ).toBe('1.78.0');
    });

    it('uses --from when an older server omits applied migrations', () => {
        expect(
            resolveCurrentVersion({
                appliedMigrations: null,
                migrationVersions,
                suppliedVersion: '1.78.0',
                stderr: vi.fn<(output: string) => void>(),
            }),
        ).toBe('1.78.0');
    });

    it('exits 3 when an older server omits applied migrations and --from is absent', async () => {
        const stderr = vi.fn<(output: string) => void>();
        const exit = vi.fn<PreflightActionDependencies['exit']>();
        const run = vi
            .fn<PreflightActionDependencies['run']>()
            .mockImplementation(async () => {
                resolveCurrentVersion({
                    appliedMigrations: null,
                    migrationVersions,
                    suppliedVersion: null,
                    stderr,
                });
                return 0;
            });

        await executePreflightAction(
            {
                to: '1.79.0',
                from: null,
                facts: [],
                intervalSeconds: 10,
                json: false,
            },
            { run, stderr, exit },
        );

        expect(stderr).toHaveBeenCalledWith(
            expect.stringContaining('too old to report its applied migrations'),
        );
        expect(stderr).toHaveBeenCalledWith(
            expect.stringContaining('Pass --from <version> explicitly'),
        );
        expect(exit).toHaveBeenCalledWith(3);
    });

    it('prefers and reports the observed version when --from disagrees', () => {
        const stderr = vi.fn<(output: string) => void>();

        expect(
            resolveCurrentVersion({
                appliedMigrations: ['001-first.ts'],
                migrationVersions,
                suppliedVersion: '1.79.0',
                stderr,
            }),
        ).toBe('1.78.0');
        expect(stderr).toHaveBeenCalledWith(
            expect.stringContaining(
                '--from 1.79.0 disagrees with the applied migrations (1.78.0); using the observed version 1.78.0',
            ),
        );
    });

    it('reports a partially applied migration set without guessing', () => {
        expect(() =>
            resolveCurrentVersion({
                appliedMigrations: ['002-second.ts'],
                migrationVersions,
                suppliedVersion: null,
                stderr: vi.fn<(output: string) => void>(),
            }),
        ).toThrow(
            'The applied migration set matches no released version; the instance may be partially migrated, so preflight will not guess a current version',
        );
    });
});

describe('exitCodeForOutcome', () => {
    it.each([
        ['ok', 0],
        ['warn', 1],
        ['blocker', 2],
        ['error', 3],
    ] as const)('maps %s to exit code %i', (outcome, exitCode) => {
        expect(exitCodeForOutcome(outcome)).toBe(exitCode);
    });
});

describe('probe table selection', () => {
    const factsWith = (
        entries: { migration: string; introducedIn: string; table: string }[],
    ) =>
        JSON.stringify({
            schemaVersion: '1-draft',
            release: null,
            previousRelease: null,
            cumulativeThrough: null,
            migrationsInRelease: null,
            migrationsWithoutFacts: null,
            migrationFacts: entries.map(
                ({ migration, introducedIn, table }) => ({
                    migration,
                    introducedIn,
                    runsInTransaction: true,
                    resumable: false,
                    batchSize: null,
                    lockTimeout: '5s',
                    tables: [
                        {
                            name: table,
                            access: ['write'],
                            expectedLockModes: [],
                        },
                    ],
                    backfill: null,
                    notes: null,
                }),
            ),
        });

    it('samples every table any fact touches, not just the supplied range', async () => {
        // --from is wrong: the database says 1.77.0, so the analysed range widens
        // after the probe has already been taken. A table sampled only for the
        // supplied range would drop out of the write-rate and lock-timeout checks.
        const sampleProbe = vi
            .fn<
                (
                    tables: string[],
                    intervalSeconds: number,
                ) => Promise<
                    Awaited<
                        ReturnType<PreflightCommandDependencies['sampleProbe']>
                    >
                >
            >()
            .mockRejectedValue(
                new Error('probe stopped after table selection'),
            );

        await runPreflight(
            {
                to: '1.79.0',
                from: '1.78.0',
                facts: ['facts.json'],
                intervalSeconds: 1,
                json: false,
            },
            {
                core: getPreflightCore,
                readFile: async () =>
                    factsWith([
                        {
                            migration: '001-early.ts',
                            introducedIn: '1.77.5',
                            table: 'early_table',
                        },
                        {
                            migration: '002-late.ts',
                            introducedIn: '1.79.0',
                            table: 'late_table',
                        },
                    ]),
                fetchFacts: async () => '',
                sampleProbe,
                explain: async () => null,
                stdout: () => undefined,
                stderr: () => undefined,
            },
        ).catch(() => undefined);

        const [tables] = sampleProbe.mock.calls[0] ?? [[]];
        expect(tables).toEqual(
            expect.arrayContaining(['early_table', 'late_table']),
        );
    });
});

describe('row-estimate reporting through the EXPLAIN endpoint', () => {
    const backfillFacts = JSON.stringify({
        schemaVersion: '1-draft',
        release: null,
        previousRelease: null,
        cumulativeThrough: '1.79.0',
        migrationsInRelease: null,
        migrationsWithoutFacts: null,
        migrationFacts: [
            {
                migration: '001_backfill',
                introducedIn: '1.79.0',
                runsInTransaction: false,
                resumable: true,
                batchSize: 1000,
                lockTimeout: '5s',
                tables: [
                    {
                        name: 'widgets',
                        access: ['write'],
                        expectedLockModes: [],
                    },
                ],
                backfill: {
                    description: 'backfills widgets',
                    estimateSql: 'SELECT widget_id FROM widgets',
                    planSql: null,
                    supportingIndexSql: null,
                },
                notes: null,
            },
        ],
    });

    const probeSample = {
        before: {
            serverTime: '2026-08-07T00:00:00.000Z',
            lockRows: [],
            statRows: [
                {
                    table: 'widgets',
                    inserts: 0,
                    updates: 0,
                    deletes: 0,
                    liveTuples: 4000000,
                },
            ],
            activityRows: [],
            lastMigrationAgeSeconds: 10,
            appliedMigrations: null,
        },
        after: {
            serverTime: '2026-08-07T00:00:01.000Z',
            lockRows: [],
            statRows: [
                {
                    table: 'widgets',
                    inserts: 0,
                    updates: 0,
                    deletes: 0,
                    liveTuples: 4000000,
                },
            ],
            activityRows: [],
            lastMigrationAgeSeconds: 11,
            appliedMigrations: null,
        },
    };

    const run = async (
        explain: PreflightCommandDependencies['explain'],
    ): Promise<string> => {
        let out = '';
        await runPreflight(
            {
                to: '1.79.0',
                from: '1.78.0',
                facts: ['facts.json'],
                intervalSeconds: 0,
                json: true,
            },
            {
                core: getPreflightCore,
                readFile: async () => backfillFacts,
                fetchFacts: async () => backfillFacts,
                sampleProbe: async () => probeSample as never,
                explain,
                stdout: (output) => {
                    out += output;
                },
                stderr: () => undefined,
            },
        ).catch(() => undefined);
        return out;
    };

    it('reports a row estimate when the instance can plan the backfill', async () => {
        const out = await run(async () => ({
            plan: [
                {
                    Plan: {
                        'Node Type': 'Seq Scan',
                        'Relation Name': 'widgets',
                        'Plan Rows': 3900000,
                    },
                },
            ],
            error: null,
        }));
        expect(out).toContain('row-estimate');
        expect(out).not.toContain('no preflight EXPLAIN endpoint');
    });

    it('says the check was skipped when the instance has no EXPLAIN endpoint', async () => {
        const out = await run(async () => null);
        expect(out).toContain('no preflight EXPLAIN endpoint');
        expect(out).toContain('001_backfill');
    });

    it('says so when the instance cannot plan the SQL, rather than staying quiet', async () => {
        const out = await run(async () => ({
            plan: null,
            error: 'column "widget_id" does not exist',
        }));
        expect(out).toContain('could not plan this backfill');
        expect(out).toContain('widget_id');
    });
});
