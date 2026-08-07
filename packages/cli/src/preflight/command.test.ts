import {
    createPreflightCommand,
    executePreflightAction,
    exitCodeForOutcome,
    resolveCurrentVersion,
    type PreflightAction,
    type PreflightActionDependencies,
} from './command';

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
