import { SupportedDbtVersions } from '@lightdash/common';
import execa from 'execa';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import Logger from '../logging/logger';
import { DbtBaseProjectAdapter } from '../projectAdapters/dbtBaseProjectAdapter';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtCliClient } from './dbtCliClient';
import { cliArgs, manifestMock } from './dbtCliClient.mock';
import {
    DBT_PARTIAL_PARSE_FILE,
    getDbtPartialParseBaselineLimits,
    type DbtPartialParseBaseline,
} from './dbtPartialParseBaseline';

vi.mock('execa');

const execaMock = execa as unknown as import('vitest').Mock;

type DbtRun = {
    partialParseEnv: string;
    seeded: string | null;
};

const unableToPartialParseLog = JSON.stringify({
    info: {
        name: 'UnableToPartialParse',
        level: 'info',
        msg: 'Unable to do partial parsing because profile has changed',
    },
});

const dbtLog = (name: string, level: string, msg: string) =>
    JSON.stringify({ info: { name, level, msg } });

const fakeDbt = (
    runs: DbtRun[],
    output: string | null,
    logs: string[] = [],
    stdout = '',
) =>
    execaMock.mockImplementation(
        async (
            _exec: string,
            args: string[],
            options: { env: Record<string, string> },
        ) => {
            if (args.includes('deps')) {
                return { all: '', stdout: '' };
            }
            const targetPath = options.env.DBT_TARGET_PATH;
            const seedPath = path.join(targetPath, DBT_PARTIAL_PARSE_FILE);
            runs.push({
                partialParseEnv: options.env.DBT_PARTIAL_PARSE,
                seeded: await fs.readFile(seedPath, 'utf8').catch(() => null),
            });
            if (output !== null) await fs.writeFile(seedPath, output);
            await fs.writeFile(
                path.join(targetPath, 'manifest.json'),
                JSON.stringify(manifestMock),
            );
            return { all: logs.join('\n'), stdout };
        },
    );

describe('DbtCliClient partial parse', () => {
    let root: string;
    let baselinePath: string;
    let clients: DbtCliClient[];

    const buildClient = (
        access: DbtPartialParseBaseline['access'] | null = 'read-write',
    ) => {
        const client = new DbtCliClient({
            ...cliArgs,
            dbtProjectDirectory: root,
            dbtVersion: SupportedDbtVersions.V1_11,
            partialParseBaseline:
                access === null ? null : { path: baselinePath, access },
        });
        clients.push(client);
        return client;
    };

    beforeEach(async () => {
        vi.resetAllMocks();
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-partial-parse-'));
        baselinePath = path.join(root, 'baselines', 'project.msgpack');
        clients = [];
    });

    afterEach(async () => {
        await Promise.all(clients.map((client) => client.cleanup()));
        await fs.rm(root, { recursive: true, force: true });
    });

    it('seeds dbt ls with the previous baseline and keeps the new one', async () => {
        await fs.mkdir(path.dirname(baselinePath), { recursive: true });
        await fs.writeFile(baselinePath, 'previous compile');
        const runs: DbtRun[] = [];
        fakeDbt(runs, 'this compile');
        const info = vi.spyOn(Logger, 'info');

        await buildClient().getDbtManifest();

        expect(runs).toEqual([
            { partialParseEnv: 'true', seeded: 'previous compile' },
        ]);
        await expect(fs.readFile(baselinePath, 'utf8')).resolves.toBe(
            'this compile',
        );
        expect(info).toHaveBeenCalledWith(
            expect.stringMatching(
                /^dbt\.partialParse command=ls seeded=true reused=true status=saved /,
            ),
            expect.objectContaining({
                seeded: true,
                reused: true,
                status: 'saved',
            }),
        );
    });

    it.each([true, false])(
        'branch parse and ls leave the live baseline untouched (warm=%s)',
        async (warm) => {
            if (warm) {
                await fs.mkdir(path.dirname(baselinePath));
                await fs.writeFile(baselinePath, 'live');
            }
            const runs: DbtRun[] = [];
            fakeDbt(runs, 'branch');
            const info = vi.spyOn(Logger, 'info');
            const client = buildClient('read-only');
            await client.test();
            const liveContents = () =>
                fs
                    .readFile(baselinePath, 'utf8')
                    .catch((error: NodeJS.ErrnoException) => {
                        if (error.code === 'ENOENT') return null;
                        throw error;
                    });
            expect(await liveContents()).toBe(warm ? 'live' : null);
            await client.getDbtManifest();
            expect(await liveContents()).toBe(warm ? 'live' : null);
            expect(runs).toEqual([
                { partialParseEnv: 'true', seeded: warm ? 'live' : null },
                { partialParseEnv: 'true', seeded: 'branch' },
            ]);
            expect(info).toHaveBeenCalledWith(
                expect.stringContaining('baselineAccess=read-only'),
                expect.objectContaining({
                    command: 'parse',
                    baselineAccess: 'read-only',
                    status: 'skipped',
                    seeded: warm,
                }),
            );
        },
    );

    it('keeps the baseline when adapter disk is released before destroy', async () => {
        fakeDbt([], 'leaf_a baseline');
        const client = buildClient();
        const adapter = new DbtBaseProjectAdapter(
            client,
            warehouseClientMock,
            { warehouseCatalog: {}, onWarehouseCatalogChange: vi.fn() },
            SupportedDbtVersions.V1_11,
            root,
        );
        await adapter.getDbtManifest();
        const target = execaMock.mock.calls.find(([, args]) =>
            args.includes('ls'),
        )![2].env.DBT_TARGET_PATH;
        await adapter.releaseDisk();
        await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.readFile(baselinePath, 'utf8')).resolves.toBe(
            'leaf_a baseline',
        );
        await expect(adapter.destroy()).resolves.toBeUndefined();
    });

    it('saves a baseline after the first compile of a project', async () => {
        const runs: DbtRun[] = [];
        fakeDbt(runs, 'first compile');
        const info = vi.spyOn(Logger, 'info');

        await buildClient().getDbtManifest();

        expect(runs).toEqual([{ partialParseEnv: 'true', seeded: null }]);
        await expect(fs.readFile(baselinePath, 'utf8')).resolves.toBe(
            'first compile',
        );
        expect(info).toHaveBeenCalledWith(
            expect.stringMatching(
                /^dbt\.partialParse command=ls seeded=false reused=false status=saved /,
            ),
            expect.objectContaining({ seeded: false, reused: false }),
        );
    });

    it('reports the reason when dbt rejects the baseline', async () => {
        await fs.mkdir(path.dirname(baselinePath), { recursive: true });
        await fs.writeFile(baselinePath, 'stale compile');
        fakeDbt([], 'full parse', [unableToPartialParseLog]);
        const info = vi.spyOn(Logger, 'info');

        await buildClient().getDbtManifest();

        expect(info).toHaveBeenCalledWith(
            expect.stringMatching(
                /^dbt\.partialParse command=ls seeded=true reused=false reason="Unable to do partial parsing because profile has changed" status=saved /,
            ),
            expect.objectContaining({
                seeded: true,
                reused: false,
                unableReason:
                    'Unable to do partial parsing because profile has changed',
            }),
        );
        await expect(fs.readFile(baselinePath, 'utf8')).resolves.toBe(
            'full parse',
        );
    });

    it('reuses the parse from dbt parse in the dbt ls of the same compile', async () => {
        const runs: DbtRun[] = [];
        fakeDbt(runs, 'parsed once');

        const client = buildClient();
        await client.test();
        await client.getDbtManifest();

        expect(runs.map((run) => run.seeded)).toEqual([null, 'parsed once']);
    });

    it('keeps partial parsing off and stores nothing without a baseline path', async () => {
        const runs: DbtRun[] = [];
        fakeDbt(runs, 'not kept');

        await buildClient(null).getDbtManifest();

        expect(runs).toEqual([{ partialParseEnv: 'false', seeded: null }]);
        await expect(fs.readdir(root)).resolves.toEqual([]);
    });

    it('appends the save outcome and the dbt parse events to the old prefix', async () => {
        fakeDbt([], 'first compile', [
            dbtLog(
                'UnableToPartialParse',
                'info',
                'Unable to do partial parsing because saved manifest not found. Starting full parse.',
            ),
            dbtLog('ParsedFileLoadFailed', 'debug', 'Failed to load'),
            dbtLog('FoundStats', 'info', 'Found 1 model'),
        ]);
        const info = vi.spyOn(Logger, 'info');
        const capBytes = getDbtPartialParseBaselineLimits().maxBytes;

        await buildClient().getDbtManifest();

        expect(info).toHaveBeenCalledWith(
            `dbt.partialParse command=ls seeded=false reused=false reason="Unable to do partial parsing because saved manifest not found. Starting full parse." status=saved baselineBytes=13 cacheBytes=13 capBytes=${capBytes} prunedFiles=0 prunedBytes=0 prunedOwnBaseline=false dbtParseEvents=UnableToPartialParse,ParsedFileLoadFailed`,
            {
                event: 'dbt.partialParse',
                command: 'ls',
                seeded: false,
                reused: false,
                unableReason:
                    'Unable to do partial parsing because saved manifest not found. Starting full parse.',
                status: 'saved',
                baselineBytes: 13,
                cacheBytes: 13,
                capBytes,
                prunedFiles: 0,
                prunedBytes: 0,
                prunedOwnBaseline: false,
                dbtParseEvents: [
                    'UnableToPartialParse',
                    'ParsedFileLoadFailed',
                ],
                baselineAccess: 'read-write',
            },
        );
        expect(
            info.mock.calls.filter(([message]) =>
                String(message).startsWith('dbt.partialParse'),
            ),
        ).toHaveLength(1);
    });

    it('logs no_file when dbt leaves no partial parse file in the target directory', async () => {
        fakeDbt([], null);
        const info = vi.spyOn(Logger, 'info');
        const warn = vi.spyOn(Logger, 'warn');
        const capBytes = getDbtPartialParseBaselineLimits().maxBytes;

        await buildClient().getDbtManifest();

        expect(info).toHaveBeenCalledWith(
            `dbt.partialParse command=ls seeded=false reused=false status=no_file baselineBytes=null cacheBytes=0 capBytes=${capBytes} prunedFiles=0 prunedBytes=0 prunedOwnBaseline=false dbtParseEvents=none`,
            expect.objectContaining({
                status: 'no_file',
                baselineBytes: null,
                dbtParseEvents: [],
            }),
        );
        expect(warn).not.toHaveBeenCalledWith(
            expect.stringContaining('Could not save'),
        );
        await expect(fs.stat(baselinePath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    it('logs the dbt ls duration and model count as structured fields', async () => {
        fakeDbt(
            [],
            'parsed',
            [],
            JSON.stringify({
                info: { code: 'Z052' },
                data: { msg: '{"unique_id": "model.project.a"}' },
            }),
        );
        const info = vi.spyOn(Logger, 'info');

        await buildClient().getDbtManifest();

        expect(info).toHaveBeenCalledWith(
            expect.stringMatching(
                /^dbt ls completed in \d+ms, found 1 model\(s\)$/,
            ),
            {
                event: 'dbt.ls',
                durationMs: expect.any(Number),
                modelCount: 1,
            },
        );
    });
});
