import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    METADATA_FILENAME,
    readMetadataFile,
    writeMetadataFile,
} from './metadataFile';

describe('writeMetadataFile', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-metadata-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('creates the output root when it does not exist yet', async () => {
        const baseDir = path.join(tmpDir, 'brand-new-dir');

        await writeMetadataFile(baseDir, {
            version: 1,
            charts: {},
            dashboards: {},
        });

        const written = JSON.parse(
            await fs.readFile(path.join(baseDir, METADATA_FILENAME), 'utf-8'),
        );
        expect(written).toEqual({ version: 1, charts: {}, dashboards: {} });
    });

    it('merges with existing metadata', async () => {
        await writeMetadataFile(tmpDir, {
            version: 1,
            charts: { 'chart-a': '2026-01-01T00:00:00Z' },
            dashboards: {},
        });
        await writeMetadataFile(tmpDir, {
            version: 1,
            charts: { 'chart-b': '2026-02-02T00:00:00Z' },
            dashboards: { 'dash-a': '2026-02-02T00:00:00Z' },
        });

        expect(await readMetadataFile(tmpDir)).toEqual({
            version: 1,
            charts: {
                'chart-a': '2026-01-01T00:00:00Z',
                'chart-b': '2026-02-02T00:00:00Z',
            },
            dashboards: { 'dash-a': '2026-02-02T00:00:00Z' },
        });
    });
});
