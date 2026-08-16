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
            headers: {
                get: (name: string) =>
                    name === 'content-type' ? 'application/json' : null,
            },
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
            headers: {
                get: () => 'application/json',
            },
            text: async () => '',
        });

        await expect(
            loadCombineManifest('https://example.com/manifest.json'),
        ).rejects.toThrow(
            'Could not load manifest from https://example.com/manifest.json',
        );
    });

    test('reports the Lightdash dev app fallback as a missing manifest', async () => {
        mockedFetch.mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: {
                get: (name: string) => {
                    if (name === 'content-type') {
                        return 'application/json; charset=utf-8';
                    }
                    if (name === 'lightdash-version') return '1.163.2';
                    return null;
                },
            },
            text: async () =>
                JSON.stringify({
                    status: 'error',
                    error: {
                        statusCode: 500,
                        name: 'UnexpectedServerError',
                        message: 'Something went wrong.',
                        data: {},
                    },
                }),
        });

        const promise = loadCombineManifest(
            'http://localhost:8080/charter5-does-not-exist/manifest.json',
        );

        await expect(promise).rejects.toThrow('Manifest not found');
        await expect(promise).rejects.not.toThrow('500 Internal Server Error');
    });

    test('reports the Lightdash production html fallback as a missing manifest', async () => {
        mockedFetch.mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: {
                get: (name: string) => {
                    if (name === 'content-type') {
                        return 'text/html; charset=utf-8';
                    }
                    if (name === 'lightdash-version') return '1.163.2';
                    return null;
                },
            },
            text: async () =>
                '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
        });

        await expect(
            loadCombineManifest(
                'https://lightdash.example.com/missing/manifest.json',
            ),
        ).rejects.toThrow('Manifest not found');
    });

    test.each([
        [
            'a Lightdash API error',
            'https://lightdash.example.com/api/v1/missing/manifest.json',
            '1.163.2',
        ],
        [
            'an unmarked external error',
            'https://example.com/missing/manifest.json',
            null,
        ],
    ])('preserves %s', async (_description, url, lightdashVersion) => {
        mockedFetch.mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: {
                get: (name: string) => {
                    if (name === 'content-type') return 'application/json';
                    if (name === 'lightdash-version') return lightdashVersion;
                    return null;
                },
            },
            text: async () =>
                JSON.stringify({
                    status: 'error',
                    error: {
                        statusCode: 500,
                        name: 'UnexpectedServerError',
                        message: 'Something went wrong.',
                        data: {},
                    },
                }),
        });

        await expect(loadCombineManifest(url)).rejects.toThrow(
            '500 Internal Server Error',
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
