import { type Knex } from 'knex';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import 'tsx/cjs';
import { type KnexMigrationState } from './migrationState';
import {
    getPendingMigrationInventory,
    loadReleaseSafetyArtifact,
    LONG_TRANSACTION_THRESHOLD_SECONDS,
    MIN_DISK_HEADROOM_BYTES,
    MIN_SUPPORTED_POSTGRES_MAJOR,
    normalizeMigrationName,
    parseDiskHeadroomBytes,
    parseReleaseSafetyArtifact,
    renderPreflightReport,
    resolveReleaseSafetyArtifactPath,
    runPreflight,
    type PendingMigrationInventoryItem,
    type PreflightCheck,
    type PreflightProbe,
    type PreflightReport,
    type ReleaseSafetyArtifact,
    type ReleaseSafetyArtifactLoadResult,
} from './preflight';

const artifact = (
    overrides: Partial<ReleaseSafetyArtifact> = {},
): ReleaseSafetyArtifact => ({
    schemaVersion: '2',
    version: '1.122.0',
    previousVersion: '1.121.1',
    migrations: {
        files: [
            {
                name: '20260811110000_create_grants.ts',
                edition: 'core',
                tables: ['users', 'login_grants'],
                heaviness: {
                    locksTable: true,
                    rewritesTable: false,
                    scansTable: true,
                },
            },
        ],
    },
    upgrade: {
        minPreviousVersion: '1.111.0',
        requiredStops: [],
    },
    ...overrides,
});

const state = (
    overrides: Partial<KnexMigrationState> = {},
): KnexMigrationState => ({
    completed: ['20260810100000_previous.js'],
    pending: ['20260811110000_create_grants.js'],
    missing: [],
    offending: [],
    classification: 'database-behind',
    ...overrides,
});

const inventory: PendingMigrationInventoryItem[] = [
    {
        name: '20260811110000_create_grants.js',
        transaction: false,
        tables: ['login_grants', 'users'],
        metadataAvailable: true,
    },
];

const probe = (overrides: Partial<PreflightProbe> = {}): PreflightProbe => ({
    getPostgresVersion: vi.fn(async () => ({
        serverVersion: '16.4',
        serverVersionNum: 160004,
    })),
    getMigrationPrivileges: vi.fn(async () => ({
        schemaName: 'public',
        canCreateInSchema: true,
        unownedTables: [],
    })),
    getRelationActivity: vi.fn(async () => []),
    getDiskHeadroom: vi.fn<PreflightProbe['getDiskHeadroom']>(async () => ({
        availableBytes: MIN_DISK_HEADROOM_BYTES,
        source: 'configured',
    })),
    ...overrides,
});

const report = async ({
    artifactValue = artifact(),
    artifactLoadValue,
    migrationState = state(),
    inventoryValue = inventory,
    probeValue = probe(),
    force = false,
    strict = false,
}: {
    artifactValue?: ReleaseSafetyArtifact;
    artifactLoadValue?: ReleaseSafetyArtifactLoadResult;
    migrationState?: KnexMigrationState;
    inventoryValue?: PendingMigrationInventoryItem[];
    probeValue?: PreflightProbe;
    force?: boolean;
    strict?: boolean;
} = {}): Promise<PreflightReport> =>
    runPreflight({
        artifactLoad: artifactLoadValue ?? {
            status: 'present',
            artifact: artifactValue,
            error: null,
            path: '/usr/app/release-safety.json',
        },
        migrationState,
        inventory: inventoryValue,
        probe: probeValue,
        options: { force, strict },
    });

const check = <Id extends PreflightCheck['id']>(
    value: PreflightReport,
    id: Id,
): Extract<PreflightCheck, { id: Id }> => {
    const match = value.checks.find(
        (candidate): candidate is Extract<PreflightCheck, { id: Id }> =>
            candidate.id === id,
    );
    if (match === undefined) {
        throw new Error(`Missing preflight check ${id}`);
    }
    return match;
};

describe('preflight thresholds', () => {
    test('centralizes the supported version, long transaction, and disk thresholds', () => {
        expect(MIN_SUPPORTED_POSTGRES_MAJOR).toBe(12);
        expect(LONG_TRANSACTION_THRESHOLD_SECONDS).toBe(300);
        expect(MIN_DISK_HEADROOM_BYTES).toBe(5 * 1024 * 1024 * 1024);
    });
});

describe('release-safety artifact handling', () => {
    test('warns when the baked release-safety artifact is absent', async () => {
        const directory = await mkdtemp(
            path.join(tmpdir(), 'release-safety-absent-'),
        );
        const artifactPath = path.join(directory, 'release-safety.json');

        try {
            const artifactLoad = await loadReleaseSafetyArtifact(artifactPath);
            const result = await report({ artifactLoadValue: artifactLoad });

            expect(artifactLoad).toMatchObject({
                status: 'absent',
                artifact: null,
                error: null,
                path: artifactPath,
            });
            expect(check(result, 'version-path')).toMatchObject({
                severity: 'yellow',
                outcome: 'warn',
                message:
                    'No baked release-safety artifact is present; required-stop verification was skipped; upgrade-path safety cannot be verified on this image',
                data: { artifactError: null },
            });
            expect(result).toMatchObject({
                decision: 'proceed-with-warnings',
                summary: { red: 0, yellow: 1 },
            });
            expect(renderPreflightReport(result)).toContain(
                '[YELLOW WARN] version-path: No baked release-safety artifact is present; required-stop verification was skipped; upgrade-path safety cannot be verified on this image',
            );
        } finally {
            await rm(directory, { recursive: true });
        }
    });

    test('aborts for an absent release-safety artifact under strict mode', async () => {
        const directory = await mkdtemp(
            path.join(tmpdir(), 'release-safety-absent-strict-'),
        );
        const artifactPath = path.join(directory, 'release-safety.json');

        try {
            const artifactLoad = await loadReleaseSafetyArtifact(artifactPath);
            const result = await report({
                artifactLoadValue: artifactLoad,
                strict: true,
            });

            expect(check(result, 'version-path')).toMatchObject({
                severity: 'yellow',
                outcome: 'warn',
            });
            expect(result.decision).toBe('abort');
        } finally {
            await rm(directory, { recursive: true });
        }
    });

    test('fails when a present release-safety artifact is corrupt', async () => {
        const directory = await mkdtemp(
            path.join(tmpdir(), 'release-safety-corrupt-'),
        );
        const artifactPath = path.join(directory, 'release-safety.json');

        try {
            await writeFile(artifactPath, '{', 'utf8');
            const artifactLoad = await loadReleaseSafetyArtifact(artifactPath);
            const result = await report({ artifactLoadValue: artifactLoad });

            expect(artifactLoad).toMatchObject({
                status: 'present',
                artifact: null,
                error: expect.stringContaining(
                    'release-safety artifact is not valid JSON',
                ),
                path: artifactPath,
            });
            expect(check(result, 'version-path')).toMatchObject({
                severity: 'red',
                outcome: 'fail',
                message: expect.stringContaining(
                    'The baked release-safety artifact could not be read',
                ),
            });
            expect(result).toMatchObject({
                decision: 'abort',
                summary: { red: 1, yellow: 0 },
            });
        } finally {
            await rm(directory, { recursive: true });
        }
    });

    test('preserves valid loaded artifact behavior', async () => {
        const directory = await mkdtemp(
            path.join(tmpdir(), 'release-safety-valid-'),
        );
        const artifactPath = path.join(directory, 'release-safety.json');
        const artifactValue = artifact();

        try {
            await writeFile(
                artifactPath,
                JSON.stringify(artifactValue),
                'utf8',
            );
            const artifactLoad = await loadReleaseSafetyArtifact(artifactPath);
            const result = await report({ artifactLoadValue: artifactLoad });

            expect(artifactLoad).toMatchObject({
                status: 'present',
                artifact: {
                    schemaVersion: '2',
                    version: '1.122.0',
                    previousVersion: '1.121.1',
                },
                error: null,
                path: artifactPath,
            });
            expect(artifactLoad.artifact?.migrations.files[0]?.tables).toEqual([
                'login_grants',
                'users',
            ]);
            expect(check(result, 'version-path')).toMatchObject({
                severity: 'red',
                outcome: 'pass',
            });
            expect(result.decision).toBe('proceed');
        } finally {
            await rm(directory, { recursive: true });
        }
    });

    test('parses the required contract-v2 fields and sorts deterministic arrays', () => {
        const parsed = parseReleaseSafetyArtifact(
            JSON.stringify({
                schemaVersion: '2',
                version: '1.122.0',
                previousVersion: '1.121.1',
                migrations: {
                    files: [
                        {
                            name: 'b.ts',
                            edition: 'core',
                            tables: ['z', 'a'],
                            heaviness: {
                                locksTable: true,
                                rewritesTable: false,
                                scansTable: 'unknown',
                            },
                        },
                        {
                            name: 'a.ts',
                            edition: 'ee',
                            tables: [],
                            heaviness: {
                                locksTable: false,
                                rewritesTable: false,
                                scansTable: false,
                            },
                        },
                    ],
                },
                upgrade: {
                    minPreviousVersion: null,
                    requiredStops: ['1.120.0', '1.119.0'],
                },
            }),
        );

        expect(
            parsed.migrations.files.map((migration) => migration.name),
        ).toEqual(['a.ts', 'b.ts']);
        expect(parsed.migrations.files[1]?.tables).toEqual(['a', 'z']);
        expect(parsed.upgrade.requiredStops).toEqual(['1.119.0', '1.120.0']);
    });

    test('rejects malformed JSON and incomplete v2 shapes', () => {
        expect(() => parseReleaseSafetyArtifact('{')).toThrow(
            'release-safety artifact is not valid JSON',
        );
        expect(() =>
            parseReleaseSafetyArtifact(JSON.stringify({ schemaVersion: '2' })),
        ).toThrow('release-safety artifact does not match contract v2');
    });

    test('resolves the baked artifact path unless explicitly overridden', () => {
        const originalOverride = process.env.RELEASE_SAFETY_ARTIFACT_PATH;
        delete process.env.RELEASE_SAFETY_ARTIFACT_PATH;
        try {
            expect(resolveReleaseSafetyArtifactPath({ override: '' })).toBe(
                '/usr/app/release-safety.json',
            );
            expect(resolveReleaseSafetyArtifactPath()).toBe(
                '/usr/app/release-safety.json',
            );
            expect(
                resolveReleaseSafetyArtifactPath({
                    override: '/tmp/custom.json',
                }),
            ).toBe('/tmp/custom.json');
        } finally {
            if (originalOverride === undefined) {
                delete process.env.RELEASE_SAFETY_ARTIFACT_PATH;
            } else {
                process.env.RELEASE_SAFETY_ARTIFACT_PATH = originalOverride;
            }
        }
    });
});

describe('pending migration inventory', () => {
    const loadMigrationTransaction = async ({
        source,
        extension = '.ts',
        relativeDirectory = false,
    }: {
        source: string;
        extension?: '.js' | '.ts';
        relativeDirectory?: boolean;
    }): Promise<boolean | null> => {
        const directory = await mkdtemp(
            path.join(tmpdir(), 'migration-transaction-'),
        );
        const migrationName = `20260813120000_test_transaction${extension}`;

        try {
            await writeFile(
                path.join(directory, migrationName),
                source,
                'utf8',
            );
            const result = await getPendingMigrationInventory({
                migrationState: state({ pending: [migrationName] }),
                migrationConfig: {
                    directory: relativeDirectory
                        ? path.relative(process.cwd(), directory)
                        : directory,
                    loadExtensions: [extension],
                },
                artifact: null,
            });
            return result[0]?.transaction ?? null;
        } finally {
            await rm(directory, { recursive: true });
        }
    };

    test('matches artifact .ts names to production .js names and reports transaction false', async () => {
        const getTransaction = vi.fn(
            async (_config: Knex.MigratorConfig, _name: string) => false,
        );

        await expect(
            getPendingMigrationInventory({
                migrationState: state(),
                migrationConfig: {},
                artifact: artifact(),
                getTransaction,
            }),
        ).resolves.toEqual(inventory);
        expect(normalizeMigrationName('migration.ts')).toBe('migration');
        expect(normalizeMigrationName('migration.js')).toBe('migration');
        expect(normalizeMigrationName('migration.mjs')).toBe('migration.mjs');
        expect(getTransaction).toHaveBeenCalledWith(
            {},
            '20260811110000_create_grants.js',
        );
    });

    test('loads transaction configuration from a pending migration module', async () => {
        const migrationName =
            '20260722103000_enforce_dashboard_project_slug_uniqueness.ts';
        const result = await getPendingMigrationInventory({
            migrationState: state({ pending: [migrationName] }),
            migrationConfig: {
                directory: path.resolve(__dirname, '../../database/migrations'),
                loadExtensions: ['.ts'],
            },
            artifact: null,
        });

        expect(result).toEqual([
            {
                name: migrationName,
                transaction: false,
                tables: [],
                metadataAvailable: false,
            },
        ]);
    });

    test.each<[string, string, boolean]>([
        [
            'as const',
            'export const config = { transaction: false } as const;',
            false,
        ],
        [
            'spread configuration',
            'const base = { transaction: false } as const; export const config = { ...base };',
            false,
        ],
        [
            'nested configuration',
            'export const config = { metadata: { transaction: true }, transaction: false } as const;',
            false,
        ],
        [
            'commented-out transaction flag',
            'export const config = { /* transaction: false */ };',
            true,
        ],
    ])('loads %s from the migration module', async (_, source, transaction) => {
        await expect(loadMigrationTransaction({ source })).resolves.toBe(
            transaction,
        );
    });

    test('reports an unknown transaction when the migration module fails to load', async () => {
        await expect(
            loadMigrationTransaction({
                source: "throw new Error('load failed');",
            }),
        ).resolves.toBeNull();
    });

    test('loads transaction configuration from a compiled CommonJS migration', async () => {
        await expect(
            loadMigrationTransaction({
                source: 'exports.config = { transaction: false };',
                extension: '.js',
                relativeDirectory: true,
            }),
        ).resolves.toBe(false);
    });
});

describe('preflight checks', () => {
    test('passes a direct-predecessor ledger across source and built extensions', async () => {
        const result = await report();

        expect(check(result, 'version-path')).toMatchObject({
            outcome: 'pass',
            data: { pendingMigrationsOutsideArtifact: [] },
        });
        expect(result.decision).toBe('proceed');
    });

    test('treats an empty completed ledger as a fresh install', async () => {
        const result = await report({
            artifactValue: artifact({
                upgrade: {
                    minPreviousVersion: '1.111.0',
                    requiredStops: ['1.115.0'],
                },
            }),
            migrationState: state({
                completed: [],
                pending: ['20200101000000_old.js'],
            }),
        });

        expect(check(result, 'version-path')).toMatchObject({
            outcome: 'pass',
            message: expect.stringContaining('fresh install'),
        });
    });

    test('treats a required stop equal to the target as being landed on', async () => {
        const result = await report({
            artifactValue: artifact({
                upgrade: {
                    minPreviousVersion: null,
                    requiredStops: ['1.122.0'],
                },
            }),
            migrationState: state({
                pending: [
                    '20260810150000_older_pending.js',
                    '20260811110000_create_grants.js',
                ],
            }),
        });

        expect(check(result, 'version-path').outcome).toBe('pass');
    });

    test('allows pending migrations from skipped releases when there are no required stops', async () => {
        const result = await report({
            artifactValue: artifact({
                previousVersion: '1.121.1',
                upgrade: {
                    minPreviousVersion: '1.111.0',
                    requiredStops: [],
                },
            }),
            migrationState: state({
                pending: [
                    '20260810150000_older_pending.js',
                    '20260811110000_create_grants.js',
                ],
            }),
        });

        expect(check(result, 'version-path')).toMatchObject({
            outcome: 'pass',
            data: {
                pendingMigrationsOutsideArtifact: [
                    '20260810150000_older_pending.js',
                ],
            },
        });
        expect(result.decision).toBe('proceed');
    });

    test('fails unresolved historical boundaries when older migrations remain pending', async () => {
        const result = await report({
            artifactValue: artifact({
                upgrade: {
                    minPreviousVersion: '1.111.0',
                    requiredStops: ['1.115.0'],
                },
            }),
            migrationState: state({
                pending: [
                    '20260810150000_older_pending.js',
                    '20260811110000_create_grants.js',
                ],
            }),
        });

        expect(check(result, 'version-path')).toMatchObject({
            outcome: 'fail',
            data: {
                pendingMigrationsOutsideArtifact: [
                    '20260810150000_older_pending.js',
                ],
            },
        });
        expect(result.decision).toBe('abort');
    });

    test('fails a diverged actual migration ledger', async () => {
        const result = await report({
            migrationState: state({
                classification: 'diverged',
                missing: ['20260810120000_unknown.js'],
                offending: ['20260810120000_unknown.js'],
            }),
        });

        expect(check(result, 'version-path').outcome).toBe('fail');
    });

    test('fails missing migration privileges and privilege probe errors', async () => {
        const denied = await report({
            probeValue: probe({
                getMigrationPrivileges: vi.fn(async () => ({
                    schemaName: 'public',
                    canCreateInSchema: false,
                    unownedTables: ['users'],
                })),
            }),
        });
        const unavailable = await report({
            probeValue: probe({
                getMigrationPrivileges: vi.fn(async () => {
                    throw new Error('permission denied');
                }),
            }),
        });

        expect(check(denied, 'migration-privileges')).toMatchObject({
            outcome: 'fail',
            data: { canCreateInSchema: false, unownedTables: ['users'] },
        });
        expect(check(unavailable, 'migration-privileges')).toMatchObject({
            outcome: 'fail',
            data: { probeError: 'permission denied' },
        });
    });

    test('fails unsupported PostgreSQL versions', async () => {
        const result = await report({
            probeValue: probe({
                getPostgresVersion: vi.fn(async () => ({
                    serverVersion: '11.22',
                    serverVersionNum: 110022,
                })),
            }),
        });

        expect(check(result, 'postgres-version')).toMatchObject({
            outcome: 'fail',
            data: { minimumSupportedMajor: 12 },
        });
    });

    test('warns for held locks and only classifies old transactions as long', async () => {
        const result = await report({
            probeValue: probe({
                getRelationActivity: vi.fn(async () => [
                    {
                        pid: 20,
                        table: 'users',
                        lockMode: 'AccessShareLock',
                        transactionAgeSeconds: 10,
                    },
                    {
                        pid: 10,
                        table: 'login_grants',
                        lockMode: 'RowExclusiveLock',
                        transactionAgeSeconds:
                            LONG_TRANSACTION_THRESHOLD_SECONDS,
                    },
                ]),
            }),
        });

        expect(check(result, 'held-locks')).toMatchObject({
            outcome: 'warn',
            data: { tables: ['login_grants', 'users'] },
        });
        expect(check(result, 'long-transactions')).toMatchObject({
            outcome: 'warn',
            data: { transactions: [{ pid: 10 }] },
        });
        expect(result.decision).toBe('proceed-with-warnings');
    });

    test('warns for low and unavailable disk headroom without inferring it from database size', async () => {
        const low = await report({
            probeValue: probe({
                getDiskHeadroom: vi.fn<PreflightProbe['getDiskHeadroom']>(
                    async () => ({
                        availableBytes: MIN_DISK_HEADROOM_BYTES - 1,
                        source: 'configured',
                    }),
                ),
            }),
        });
        const unavailable = await report({
            probeValue: probe({
                getDiskHeadroom: vi.fn<PreflightProbe['getDiskHeadroom']>(
                    async () => ({
                        availableBytes: null,
                        source: 'unavailable',
                    }),
                ),
            }),
        });

        expect(check(low, 'disk-headroom')).toMatchObject({
            outcome: 'warn',
            data: {
                applicable: true,
                availableBytes: MIN_DISK_HEADROOM_BYTES - 1,
            },
        });
        expect(check(unavailable, 'disk-headroom')).toMatchObject({
            outcome: 'warn',
            data: {
                applicable: true,
                availableBytes: null,
                source: 'unavailable',
            },
        });
    });

    test('does not require disk headroom when no pending migration scans or rewrites a table', async () => {
        const getDiskHeadroom = vi.fn<PreflightProbe['getDiskHeadroom']>(
            async () => ({
                availableBytes: null,
                source: 'unavailable',
            }),
        );
        const result = await report({
            migrationState: state({
                pending: [],
                classification: 'up-to-date',
            }),
            inventoryValue: [],
            probeValue: probe({ getDiskHeadroom }),
            strict: true,
        });

        expect(check(result, 'disk-headroom')).toMatchObject({
            outcome: 'pass',
            data: { applicable: false, availableBytes: null },
        });
        expect(getDiskHeadroom).not.toHaveBeenCalled();
        expect(result.decision).toBe('proceed');
    });

    test('reports the pending migration inventory with explicit nulls', async () => {
        const result = await report({
            inventoryValue: [
                {
                    name: 'older.js',
                    transaction: null,
                    tables: [],
                    metadataAvailable: false,
                },
            ],
        });

        expect(check(result, 'pending-migrations')).toEqual({
            id: 'pending-migrations',
            severity: 'info',
            outcome: 'info',
            message: '1 pending migration(s)',
            data: {
                migrations: [
                    {
                        name: 'older.js',
                        transaction: null,
                        tables: [],
                        metadataAvailable: false,
                    },
                ],
            },
        });
    });
});

describe('preflight decisions', () => {
    test('promotes yellow to abort under strict and lets force override red or strict', async () => {
        const warningProbe = probe({
            getDiskHeadroom: vi.fn<PreflightProbe['getDiskHeadroom']>(
                async () => ({
                    availableBytes: null,
                    source: 'unavailable',
                }),
            ),
        });
        const normal = await report({ probeValue: warningProbe });
        const strict = await report({
            probeValue: warningProbe,
            strict: true,
        });
        const strictForced = await report({
            probeValue: warningProbe,
            strict: true,
            force: true,
        });
        const redForced = await report({
            force: true,
            migrationState: state({
                classification: 'diverged',
                offending: ['unknown.js'],
            }),
        });

        expect(normal.decision).toBe('proceed-with-warnings');
        expect(strict.decision).toBe('abort');
        expect(strictForced.decision).toBe('force-proceed');
        expect(redForced.decision).toBe('force-proceed');
    });

    test('serializes a stable deterministic JSON payload', async () => {
        const first = JSON.stringify(await report());
        const second = JSON.stringify(await report());

        expect(first).toBe(second);
        expect(JSON.parse(first)).toMatchObject({
            schemaVersion: '1',
            decision: 'proceed',
            force: false,
            strict: false,
            summary: { red: 0, yellow: 0, info: 1 },
        });
    });
});

describe('disk headroom configuration', () => {
    test('parses explicit bytes and rejects malformed values', () => {
        expect(parseDiskHeadroomBytes(undefined)).toBeNull();
        expect(parseDiskHeadroomBytes('0')).toBe(0);
        expect(parseDiskHeadroomBytes('1024')).toBe(1024);
        expect(() => parseDiskHeadroomBytes('-1')).toThrow(
            'MIGRATION_PREFLIGHT_DISK_HEADROOM_BYTES must be a non-negative safe integer',
        );
        expect(() => parseDiskHeadroomBytes('1.5')).toThrow(
            'MIGRATION_PREFLIGHT_DISK_HEADROOM_BYTES must be a non-negative safe integer',
        );
    });
});
