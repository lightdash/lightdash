import { Command, CommanderError } from 'commander';
import fetch, { Response } from 'node-fetch';
import {
    INDEX_SCHEMA_VERSION,
    type ReleaseSafetyIndex,
} from '../releaseSafety';
import {
    registerUpgradeCheckCommand,
    RELEASE_SAFETY_INDEX_URL,
    upgradeCheckHandler,
    type UpgradeCheckDependencies,
} from './upgradeCheck';

const safeIndex: ReleaseSafetyIndex = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    generatedAt: '2026-08-11T00:00:00.000Z',
    backfillFloorVersion: null,
    entries: [
        {
            version: '1.114.0',
            previousVersion: '1.113.0',
            releaseDate: '2026-07-31T00:00:00.000Z',
            rollingUpdateSafe: true,
            requiredStops: [],
            minPreviousVersion: null,
            backfilled: true,
            syntheticRequiredStop: false,
        },
        {
            version: '1.115.0',
            previousVersion: '1.114.0',
            releaseDate: '2026-08-01T00:00:00.000Z',
            rollingUpdateSafe: true,
            requiredStops: [],
            minPreviousVersion: null,
            backfilled: true,
            syntheticRequiredStop: false,
        },
    ],
};

class ExitError extends Error {
    code: number;

    constructor(code: number) {
        super(`exit ${code}`);
        this.code = code;
    }
}

function responseFor(index: ReleaseSafetyIndex): Response {
    return new Response(JSON.stringify(index), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

function dependenciesFor(index: ReleaseSafetyIndex): {
    dependencies: UpgradeCheckDependencies;
    fetchIndex: ReturnType<typeof vi.fn<typeof fetch>>;
    output: string[];
} {
    const fetchIndex = vi
        .fn<typeof fetch>()
        .mockResolvedValue(responseFor(index));
    const output: string[] = [];
    return {
        dependencies: {
            fetch: fetchIndex,
            writeOutput: (message) => output.push(message),
            exit: (code) => {
                throw new ExitError(code);
            },
        },
        fetchIndex,
        output,
    };
}

describe('upgradeCheckHandler', () => {
    it('fetches the public index without authentication context', async () => {
        const { dependencies, fetchIndex } = dependenciesFor(safeIndex);

        await upgradeCheckHandler(
            { from: '1.114.0', to: '1.115.0' },
            dependencies,
        );

        expect(fetchIndex).toHaveBeenCalledTimes(1);
        expect(fetchIndex).toHaveBeenCalledWith(RELEASE_SAFETY_INDEX_URL);
        expect(fetchIndex.mock.calls[0]).toHaveLength(1);
    });

    it('renders a boundary-precise gap and exits non-zero', async () => {
        const gapIndex: ReleaseSafetyIndex = {
            ...safeIndex,
            entries: [
                ...safeIndex.entries,
                {
                    ...safeIndex.entries[0],
                    version: '1.121.0',
                    previousVersion: '1.120.1',
                    releaseDate: '2026-08-07T00:00:00.000Z',
                },
            ],
        };
        const { dependencies, output } = dependenciesFor(gapIndex);

        await expect(
            upgradeCheckHandler(
                { from: '1.114.0', to: '1.121.0' },
                dependencies,
            ),
        ).rejects.toMatchObject({ code: 1 });
        expect(output.join('\n')).toContain('after 1.115.0 and before 1.121.0');
        expect(output.join('\n')).toContain('Verdict: UNSAFE');
    });

    it('fails closed when the source version is not indexed', async () => {
        const indexWithMissingSource: ReleaseSafetyIndex = {
            ...safeIndex,
            entries: safeIndex.entries.filter(
                (entry) => entry.version !== '1.114.0',
            ),
        };
        const { dependencies, output } = dependenciesFor(
            indexWithMissingSource,
        );

        await expect(
            upgradeCheckHandler(
                { from: '1.114.0', to: '1.115.0' },
                dependencies,
            ),
        ).rejects.toMatchObject({ code: 1 });
        expect(output[0]).toContain(
            'version 1.114.0 is not present in the release-safety index',
        );
    });

    it('emits the stable JSON shape without human output', async () => {
        const { dependencies, output } = dependenciesFor(safeIndex);

        await upgradeCheckHandler(
            { from: '1.114.0', to: '1.115.0', json: true },
            dependencies,
        );

        expect(JSON.parse(output[0])).toEqual({
            fromVersion: '1.114.0',
            toVersion: '1.115.0',
            direction: 'upgrade',
            safe: true,
            verdict: true,
            requiredStops: [],
            minPreviousVersion: null,
            coveredVersions: ['1.115.0'],
            missingRanges: [],
        });
        expect(output).toHaveLength(1);
    });

    it('names false and unknown release reasons in human output', async () => {
        const unsafeIndex: ReleaseSafetyIndex = {
            ...safeIndex,
            entries: [
                safeIndex.entries[0],
                {
                    ...safeIndex.entries[1],
                    rollingUpdateSafe: false,
                },
                {
                    ...safeIndex.entries[1],
                    version: '1.116.0',
                    previousVersion: '1.115.0',
                    rollingUpdateSafe: 'unknown',
                },
            ],
        };
        const { dependencies, output } = dependenciesFor(unsafeIndex);

        await expect(
            upgradeCheckHandler(
                { from: '1.114.0', to: '1.116.0' },
                dependencies,
            ),
        ).rejects.toMatchObject({ code: 1 });
        expect(output[0]).toContain('Unsafe rolling-update safety: 1.115.0');
        expect(output[0]).toContain('Unknown rolling-update safety: 1.116.0');
    });

    it('rejects non-X.Y.Z endpoints before fetching', async () => {
        const { dependencies, fetchIndex } = dependenciesFor(safeIndex);

        await expect(
            upgradeCheckHandler(
                { from: 'v1.114.0', to: '1.115.0' },
                dependencies,
            ),
        ).rejects.toThrow('--from must be a release version in X.Y.Z format');
        expect(fetchIndex).not.toHaveBeenCalled();
    });
});

describe('upgrade-check argv and exit codes', () => {
    async function run(
        argv: string[],
        index: ReleaseSafetyIndex = safeIndex,
    ): Promise<number> {
        const { dependencies } = dependenciesFor(index);
        const command = new Command()
            .name('lightdash')
            .exitOverride()
            .configureOutput({ writeOut: () => {}, writeErr: () => {} });
        registerUpgradeCheckCommand(command, dependencies);
        try {
            await command.parseAsync(['node', 'lightdash', ...argv]);
            return 0;
        } catch (error) {
            if (error instanceof ExitError) {
                return error.code;
            }
            if (error instanceof CommanderError) {
                return error.exitCode;
            }
            throw error;
        }
    }

    it.each([
        {
            name: 'green forward span',
            argv: ['upgrade-check', '--from', '1.114.0', '--to', '1.115.0'],
            expected: 0,
        },
        {
            name: 'unsafe missing target',
            argv: ['upgrade-check', '--from', '1.114.0', '--to', '1.116.0'],
            expected: 1,
        },
        {
            name: 'missing from option',
            argv: ['upgrade-check', '--to', '1.115.0'],
            expected: 1,
        },
        {
            name: 'missing to option',
            argv: ['upgrade-check', '--from', '1.114.0'],
            expected: 1,
        },
    ])('returns $expected for $name', async ({ argv, expected }) => {
        await expect(run(argv)).resolves.toBe(expected);
    });

    it('evaluates a reverse argv span as rollback safety', async () => {
        const { dependencies, output } = dependenciesFor(safeIndex);
        const command = new Command().name('lightdash').exitOverride();
        registerUpgradeCheckCommand(command, dependencies);

        await command.parseAsync([
            'node',
            'lightdash',
            'upgrade-check',
            '--from',
            '1.115.0',
            '--to',
            '1.114.0',
            '--json',
        ]);

        expect(JSON.parse(output[0])).toMatchObject({
            direction: 'rollback',
            safe: true,
            coveredVersions: ['1.115.0'],
        });
    });
});
