import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { frontendOptions, loadVite } from './vite-runtime';

type Module = {
    url: string;
    importedModules: Set<Module>;
    staticImportedUrls?: Set<string>;
};
export type WarmGraph = {
    transformRequest(url: string): Promise<unknown>;
    moduleGraph: { getModuleByUrl(url: string): Promise<Module | undefined> };
};
export type WarmResult = {
    status: 'ready' | 'failed';
    modules: number;
    errors: string[];
};

export async function prewarmViteGraph(
    client: WarmGraph,
    entries = ['/src/index.tsx'],
    concurrency = 8,
    maxModules = 15000,
): Promise<WarmResult> {
    if (
        !Number.isInteger(concurrency) ||
        concurrency < 1 ||
        !Number.isInteger(maxModules) ||
        maxModules < 1
    )
        throw new Error('Invalid Vite warmup limits');
    const visited = new Set(entries);
    const pending = [...visited];
    const errors: string[] = [];
    while (pending.length) {
        const batch = pending.splice(0, concurrency);
        const discovered = await Promise.all(
            batch.map(async (url) => {
                try {
                    await client.transformRequest(url);
                    const module = await client.moduleGraph.getModuleByUrl(url);
                    if (!module)
                        throw new Error('Module did not enter the Vite graph');
                    return [...(module?.importedModules ?? [])]
                        .filter((child) =>
                            module?.staticImportedUrls?.has(child.url),
                        )
                        .map((child) => child.url);
                } catch {
                    errors.push(url);
                    return [];
                }
            }),
        );
        for (const url of discovered.flat()) {
            if (
                visited.has(url) ||
                !url.startsWith('/') ||
                url.includes('/node_modules/.vite/')
            )
                continue;
            if (visited.size >= maxModules)
                return {
                    status: 'failed',
                    modules: visited.size,
                    errors: [...errors, 'module-limit'],
                };
            visited.add(url);
            pending.push(url);
        }
    }
    return {
        status: errors.length ? 'failed' : 'ready',
        modules: visited.size,
        errors,
    };
}

export async function serveVite(root: string): Promise<void> {
    const startedAt = Date.now();
    const vite = await loadVite(root);
    const server = await vite.createServer(frontendOptions(root));
    const marker =
        process.env.LDENV_VITE_WARM_MARKER ??
        path.join(server.config.cacheDir, 'ldenv-warm.json');
    await rm(marker, { force: true });
    let closing = false;
    const close = async () => {
        if (closing) return;
        closing = true;
        await server.close();
        process.exit(0);
    };
    process.once('SIGINT', () => {
        void close();
    });
    process.once('SIGTERM', () => {
        void close();
    });
    await server.listen();
    server.printUrls();
    const result = await prewarmViteGraph(server.environments.client);
    const content = {
        ...result,
        pid: process.pid,
        root,
        startedAt,
        finishedAt: Date.now(),
    };
    await mkdir(path.dirname(marker), { recursive: true });
    const temporary = `${marker}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(content));
    await rename(temporary, marker);
    process.stdout.write(`LDENV_VITE_WARM=${JSON.stringify(content)}\n`);
}
