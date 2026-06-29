import { DbtManifest, DbtNode } from '@lightdash/common';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import type { Mock } from 'vitest';
import { combineManifests, isHttpUrl, loadCombineManifest } from './manifest';

vi.mock('node-fetch');
vi.mock('fs', () => ({
    promises: {
        readFile: vi.fn(),
    },
}));

const mockedFetch = fetch as unknown as Mock;
const mockedReadFile = fs.readFile as unknown as Mock;

const modelNode = (uniqueId: string, extra: Record<string, unknown> = {}) =>
    ({
        unique_id: uniqueId,
        resource_type: 'model',
        compiled: true,
        ...extra,
    }) as unknown as DbtNode;

const testNode = (uniqueId: string) =>
    ({
        unique_id: uniqueId,
        resource_type: 'test',
    }) as unknown as DbtNode;

const buildManifest = (
    nodes: Record<string, DbtNode>,
    overrides: Partial<DbtManifest> = {},
): DbtManifest =>
    ({
        nodes,
        metadata: {
            adapter_type: 'postgres',
        },
        metrics: {},
        docs: {},
        ...overrides,
    }) as unknown as DbtManifest;

describe('combineManifests', () => {
    test('adds external-only model nodes and lists their unique_ids', () => {
        const primary = buildManifest({
            'model.proj.a': modelNode('model.proj.a', { tag: 'primary' }),
        });
        const external = buildManifest({
            'model.proj.b': modelNode('model.proj.b'),
            'model.proj.c': modelNode('model.proj.c'),
        });

        const { manifest, addedModelIds } = combineManifests(primary, external);

        expect(Object.keys(manifest.nodes).sort()).toEqual([
            'model.proj.a',
            'model.proj.b',
            'model.proj.c',
        ]);
        expect(addedModelIds.sort()).toEqual(['model.proj.b', 'model.proj.c']);
    });

    test('primary wins on conflict and does not list the conflicting id as added', () => {
        const primary = buildManifest({
            'model.proj.a': modelNode('model.proj.a', { tag: 'primary' }),
        });
        const external = buildManifest({
            'model.proj.a': modelNode('model.proj.a', { tag: 'external' }),
            'model.proj.b': modelNode('model.proj.b'),
        });

        const { manifest, addedModelIds } = combineManifests(primary, external);

        const mergedA = manifest.nodes['model.proj.a'] as unknown as {
            tag: string;
        };
        expect(mergedA.tag).toBe('primary');
        expect(addedModelIds).toEqual(['model.proj.b']);
    });

    test('external model nodes that were not compiled are merged but not reported as added', () => {
        const primary = buildManifest({
            'model.proj.a': modelNode('model.proj.a'),
        });
        const external = buildManifest({
            'model.proj.compiled': modelNode('model.proj.compiled', {
                compiled: true,
            }),
            'model.proj.uncompiled': modelNode('model.proj.uncompiled', {
                compiled: false,
            }),
            'model.proj.missing': modelNode('model.proj.missing', {
                compiled: undefined,
            }),
        });

        const { manifest, addedModelIds } = combineManifests(primary, external);

        // All external nodes are merged (so joins by name still resolve)
        expect(manifest.nodes['model.proj.uncompiled']).toBeDefined();
        expect(manifest.nodes['model.proj.missing']).toBeDefined();
        // ...but only the compiled one is reported as added
        expect(addedModelIds).toEqual(['model.proj.compiled']);
    });

    test('non-model external nodes are merged into nodes but not reported as added', () => {
        const primary = buildManifest({
            'model.proj.a': modelNode('model.proj.a'),
        });
        const external = buildManifest({
            'test.proj.t': testNode('test.proj.t'),
            'model.proj.b': modelNode('model.proj.b'),
        });

        const { manifest, addedModelIds } = combineManifests(primary, external);

        expect(manifest.nodes['test.proj.t']).toBeDefined();
        expect(addedModelIds).toEqual(['model.proj.b']);
    });

    test('metrics, docs, and metadata come from primary only', () => {
        const primary = buildManifest(
            { 'model.proj.a': modelNode('model.proj.a') },
            {
                metrics: {
                    'metric.proj.p': { id: 'p' },
                } as unknown as DbtManifest['metrics'],
                docs: {
                    'doc.proj.p': { id: 'p' },
                } as unknown as DbtManifest['docs'],
                metadata: {
                    adapter_type: 'postgres',
                } as unknown as DbtManifest['metadata'],
            },
        );
        const external = buildManifest(
            { 'model.proj.b': modelNode('model.proj.b') },
            {
                metrics: {
                    'metric.proj.e': { id: 'e' },
                } as unknown as DbtManifest['metrics'],
                docs: {
                    'doc.proj.e': { id: 'e' },
                } as unknown as DbtManifest['docs'],
                metadata: {
                    adapter_type: 'snowflake',
                } as unknown as DbtManifest['metadata'],
            },
        );

        const { manifest } = combineManifests(primary, external);

        expect(Object.keys(manifest.metrics)).toEqual(['metric.proj.p']);
        expect(Object.keys(manifest.docs)).toEqual(['doc.proj.p']);
        expect(manifest.metadata.adapter_type).toBe('postgres');
    });
});

describe('isHttpUrl', () => {
    test('returns true for http and https urls', () => {
        expect(isHttpUrl('http://example.com/manifest.json')).toBe(true);
        expect(isHttpUrl('https://bucket.s3.amazonaws.com/manifest.json')).toBe(
            true,
        );
    });

    test('returns false for local paths and bare strings', () => {
        expect(isHttpUrl('./target/manifest.json')).toBe(false);
        expect(isHttpUrl('/abs/path/manifest.json')).toBe(false);
        expect(isHttpUrl('manifest.json')).toBe(false);
        expect(isHttpUrl('s3://bucket/manifest.json')).toBe(false);
    });
});

describe('loadCombineManifest', () => {
    beforeEach(() => {
        mockedFetch.mockReset();
        mockedReadFile.mockReset();
    });

    test('fetches and parses a manifest from an http url', async () => {
        const manifest = buildManifest({
            'model.proj.a': modelNode('model.proj.a'),
        });
        mockedFetch.mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify(manifest),
        });

        const result = await loadCombineManifest(
            'https://example.com/manifest.json',
        );

        expect(mockedFetch).toHaveBeenCalledWith(
            'https://example.com/manifest.json',
        );
        expect(Object.keys(result.nodes)).toEqual(['model.proj.a']);
        expect(mockedReadFile).not.toHaveBeenCalled();
    });

    test('throws a wrapped error when the http response is not ok', async () => {
        mockedFetch.mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: async () => '',
        });

        await expect(
            loadCombineManifest('https://example.com/manifest.json'),
        ).rejects.toThrow(
            'Could not load manifest from https://example.com/manifest.json',
        );
    });

    test('reads a manifest from a local path', async () => {
        const manifest = buildManifest({
            'model.proj.b': modelNode('model.proj.b'),
        });
        mockedReadFile.mockResolvedValue(JSON.stringify(manifest));

        const result = await loadCombineManifest('./target/manifest.json');

        expect(mockedReadFile).toHaveBeenCalled();
        expect(Object.keys(result.nodes)).toEqual(['model.proj.b']);
        expect(mockedFetch).not.toHaveBeenCalled();
    });
});
