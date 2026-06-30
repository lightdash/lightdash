import { DbtManifest, DbtNode } from '@lightdash/common';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import type { Mock } from 'vitest';
import { isHttpUrl, loadCombineManifest } from './manifest';

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
