import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prewarmViteGraph, type WarmGraph } from './vite-prewarm';

test('prewarm walks static application imports once and skips optimized dependencies and lazy routes', async () => {
    const graph = new Map<
        string,
        {
            url: string;
            importedModules: Set<never>;
            staticImportedUrls: Set<string>;
        }
    >();
    for (const url of [
        '/entry',
        '/shared',
        '/lazy',
        '/node_modules/.vite/deps/react.js',
    ])
        graph.set(url, {
            url,
            importedModules: new Set(),
            staticImportedUrls: new Set(),
        });
    const entry = graph.get('/entry')!;
    const shared = graph.get('/shared')!;
    const connect = (from: typeof entry, url: string, isStatic: boolean) => {
        (from.importedModules as Set<unknown>).add(graph.get(url)!);
        if (isStatic) from.staticImportedUrls.add(url);
    };
    connect(entry, '/shared', true);
    connect(entry, '/lazy', false);
    connect(entry, '/node_modules/.vite/deps/react.js', true);
    connect(shared, '/entry', true);
    const transformed: string[] = [];
    const result = await prewarmViteGraph(
        {
            transformRequest: async (url) => {
                transformed.push(url);
            },
            moduleGraph: { getModuleByUrl: async (url) => graph.get(url) },
        },
        ['/entry'],
    );
    assert.deepEqual(result, { status: 'ready', modules: 2, errors: [] });
    assert.deepEqual(transformed, ['/entry', '/shared']);
});

test('prewarm exposes transform failures and enforces the module limit', async () => {
    const failing: WarmGraph = {
        transformRequest: async () => {
            throw new Error('bad module');
        },
        moduleGraph: { getModuleByUrl: async () => undefined },
    };
    assert.equal(
        (await prewarmViteGraph(failing, ['/entry'])).status,
        'failed',
    );
    const child = {
        url: '/child',
        importedModules: new Set<never>(),
        staticImportedUrls: new Set<string>(),
    };
    const graph: WarmGraph = {
        transformRequest: async () => null,
        moduleGraph: {
            getModuleByUrl: async () => ({
                url: '/entry',
                importedModules: new Set([child]),
                staticImportedUrls: new Set(['/child']),
            }),
        },
    };
    assert.deepEqual((await prewarmViteGraph(graph, ['/entry'], 2, 1)).errors, [
        'module-limit',
    ]);
});
