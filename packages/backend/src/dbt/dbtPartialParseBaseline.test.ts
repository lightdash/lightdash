import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    DBT_PARTIAL_PARSE_FILE,
    getDbtPartialParseBaselinePath,
    pruneDbtPartialParseBaselines,
    saveDbtPartialParse,
    seedDbtPartialParse,
} from './dbtPartialParseBaseline';

const HOUR = 60 * 60 * 1000;

describe('dbt partial parse baselines', () => {
    let root: string;
    let targetDirectory: string;
    let store: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-baseline-'));
        targetDirectory = path.join(root, 'target');
        store = path.join(root, 'store');
        await fs.mkdir(targetDirectory);
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    const writeBaseline = async (
        name: string,
        bytes: number,
        ageMs: number,
    ) => {
        const filePath = path.join(store, name);
        await fs.writeFile(filePath, Buffer.alloc(bytes));
        const time = new Date(Date.now() - ageMs);
        await fs.utimes(filePath, time, time);
    };

    it('keys a baseline by project and dbt source', () => {
        const projectConnection = getDbtPartialParseBaselinePath({
            projectUuid: 'project-a',
            dbtSourceUuid: null,
            root: store,
        });

        expect(
            getDbtPartialParseBaselinePath({
                projectUuid: 'project-a',
                dbtSourceUuid: null,
                root: store,
            }),
        ).toBe(projectConnection);
        expect(
            new Set([
                projectConnection,
                getDbtPartialParseBaselinePath({
                    projectUuid: 'project-a',
                    dbtSourceUuid: 'source-1',
                    root: store,
                }),
                getDbtPartialParseBaselinePath({
                    projectUuid: 'project-b',
                    dbtSourceUuid: null,
                    root: store,
                }),
            ]).size,
        ).toBe(3);
        expect(path.dirname(projectConnection)).toBe(store);
    });

    it('seeds nothing when no baseline exists yet', async () => {
        await expect(
            seedDbtPartialParse(path.join(store, 'missing'), targetDirectory),
        ).resolves.toBe(false);
        await expect(fs.readdir(targetDirectory)).resolves.toEqual([]);
    });

    it('saves the target file as a private baseline and seeds it back', async () => {
        const baselinePath = path.join(store, 'project.msgpack');
        await fs.writeFile(
            path.join(targetDirectory, DBT_PARTIAL_PARSE_FILE),
            'parsed',
        );

        await saveDbtPartialParse(baselinePath, targetDirectory);

        await expect(fs.readdir(store)).resolves.toEqual(['project.msgpack']);
        expect((await fs.stat(store)).mode.toString(8).slice(-3)).toBe('700');
        expect((await fs.stat(baselinePath)).mode.toString(8).slice(-3)).toBe(
            '600',
        );

        const nextTarget = path.join(root, 'next-target');
        await fs.mkdir(nextTarget);
        await expect(
            seedDbtPartialParse(baselinePath, nextTarget),
        ).resolves.toBe(true);
        await expect(
            fs.readFile(path.join(nextTarget, DBT_PARTIAL_PARSE_FILE), 'utf8'),
        ).resolves.toBe('parsed');
    });

    it('leaves the old baseline in place when dbt wrote no file', async () => {
        const baselinePath = path.join(store, 'project.msgpack');
        await fs.mkdir(store);
        await fs.writeFile(baselinePath, 'previous');

        await saveDbtPartialParse(baselinePath, targetDirectory);

        await expect(fs.readdir(store)).resolves.toEqual(['project.msgpack']);
        await expect(fs.readFile(baselinePath, 'utf8')).resolves.toBe(
            'previous',
        );
    });

    it('removes expired baselines, abandoned writes and the oldest baselines over the size limit', async () => {
        await fs.mkdir(store);
        await writeBaseline('newest.msgpack', 40, 1 * HOUR);
        await writeBaseline('middle.msgpack', 40, 2 * HOUR);
        await writeBaseline('oldest-in-age.msgpack', 40, 3 * HOUR);
        await writeBaseline('expired.msgpack', 1, 200 * HOUR);
        await writeBaseline('abandoned.msgpack.1234.tmp', 1, 2 * HOUR);
        await writeBaseline('in-progress.msgpack.5678.tmp', 1, 0);

        await pruneDbtPartialParseBaselines(store, Date.now(), {
            maxBytes: 100,
            maxAgeMs: 168 * HOUR,
            abandonedWriteAgeMs: 1 * HOUR,
        });

        await expect(
            fs.readdir(store).then((names) => names.sort()),
        ).resolves.toEqual([
            'in-progress.msgpack.5678.tmp',
            'middle.msgpack',
            'newest.msgpack',
        ]);
    });
});
