import { NotFoundError, type DbtManifest } from '@lightdash/common';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { type FileStreamResult } from '../../clients/FileStorage/FileStorageClient';
import {
    readCompiledDbtManifest,
    readCompiledDbtProjectMap,
    saveCompiledDbtManifest,
} from './compiledDbtManifest';
import { describeDbtProjectMap } from './dbtProjectMap';

const manifest = {
    metadata: {
        dbt_schema_version: '',
        generated_at: '',
        adapter_type: 'postgres',
        project_name: 'shop',
    },
    nodes: Object.fromEntries([
        [
            'model.shop.orders',
            {
                unique_id: 'model.shop.orders',
                resource_type: 'model',
                package_name: 'shop',
                name: 'orders',
                original_file_path: 'models/orders.sql',
                patch_path: 'shop://models/orders.yml',
            },
        ],
    ]),
    sources: {},
    macros: {},
    metrics: {},
    docs: {},
} as DbtManifest;

const storage = () => {
    const files = new Map<string, Buffer>();
    return {
        files,
        uploadTxt: async (txt: Buffer, id: string) => {
            files.set(`${id}.txt`, txt);
            return id;
        },
        getFileStream: async (fileId: string) => {
            const file = files.get(fileId);
            if (!file) throw new NotFoundError(fileId);
            const result: FileStreamResult = {
                stream: Readable.from([file]),
                contentDisposition: null,
            };
            return result;
        },
    };
};

describe('compiled dbt manifest', () => {
    it('stores the project map with the manifest, so a prompt reads only the map', async () => {
        const client = storage();
        await saveCompiledDbtManifest(client, 'project', {
            commitSha: 'sha',
            manifest,
            exploresJobUuid: null,
        });
        expect(await readCompiledDbtProjectMap(client, 'project')).toEqual({
            map: describeDbtProjectMap(manifest),
        });
        expect(
            (await readCompiledDbtManifest(client, 'project'))?.commitSha,
        ).toBe('sha');
    });

    it('has no map for a project never compiled', async () => {
        expect(await readCompiledDbtProjectMap(storage(), 'project')).toBe(
            null,
        );
    });
});
