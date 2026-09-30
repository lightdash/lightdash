import { SupportedDbtVersions } from '@lightdash/common';
import execa from 'execa';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import Logger from '../logging/logger';
import { DbtCliClient } from './dbtCliClient';
import { cliArgs, manifestMock } from './dbtCliClient.mock';
import { DBT_PARTIAL_PARSE_FILE } from './dbtPartialParseBaseline';

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

const fakeDbt = (runs: DbtRun[], output: string, logs: string[] = []) =>
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
            await fs.writeFile(seedPath, output);
            await fs.writeFile(
                path.join(targetPath, 'manifest.json'),
                JSON.stringify(manifestMock),
            );
            return { all: logs.join('\n'), stdout: '' };
        },
    );

describe('DbtCliClient partial parse', () => {
    let root: string;
    let baselinePath: string;
    let clients: DbtCliClient[];

    const buildClient = (partialParseBaselinePath: string | null) => {
        const client = new DbtCliClient({
            ...cliArgs,
            dbtProjectDirectory: root,
            dbtVersion: SupportedDbtVersions.V1_11,
            partialParseBaselinePath,
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

        await buildClient(baselinePath).getDbtManifest();

        expect(runs).toEqual([
            { partialParseEnv: 'true', seeded: 'previous compile' },
        ]);
        await expect(fs.readFile(baselinePath, 'utf8')).resolves.toBe(
            'this compile',
        );
        expect(info).toHaveBeenCalledWith(
            'dbt.partialParse command=ls seeded=true reused=true',
            expect.objectContaining({ seeded: true, reused: true }),
        );
    });

    it('saves a baseline after the first compile of a project', async () => {
        const runs: DbtRun[] = [];
        fakeDbt(runs, 'first compile');
        const info = vi.spyOn(Logger, 'info');

        await buildClient(baselinePath).getDbtManifest();

        expect(runs).toEqual([{ partialParseEnv: 'true', seeded: null }]);
        await expect(fs.readFile(baselinePath, 'utf8')).resolves.toBe(
            'first compile',
        );
        expect(info).toHaveBeenCalledWith(
            'dbt.partialParse command=ls seeded=false reused=false',
            expect.objectContaining({ seeded: false, reused: false }),
        );
    });

    it('reports the reason when dbt rejects the baseline', async () => {
        await fs.mkdir(path.dirname(baselinePath), { recursive: true });
        await fs.writeFile(baselinePath, 'stale compile');
        fakeDbt([], 'full parse', [unableToPartialParseLog]);
        const info = vi.spyOn(Logger, 'info');

        await buildClient(baselinePath).getDbtManifest();

        expect(info).toHaveBeenCalledWith(
            'dbt.partialParse command=ls seeded=true reused=false reason="Unable to do partial parsing because profile has changed"',
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

        const client = buildClient(baselinePath);
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
});
