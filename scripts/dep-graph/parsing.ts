import * as fs from 'fs';
import * as path from 'path';
import {
    SERVICE_REPO,
    CONTROLLERS_DIR,
    ROUTERS_DIR,
    EE_DIR,
    EE_CONTROLLERS_DIR,
    EE_INDEX,
    SCHEDULER_DIR,
    EE_SCHEDULER_DIR,
    ENTITIES_DIR,
    ADAPTERS_DIR,
    MIDDLEWARES_DIR,
} from './config';
import { matchAll, unique } from './utils';
import type { ServiceDeps, EeParsed, SchedulerDeps, AdapterInfo } from './types';

export function parseServiceRepository(): Record<string, ServiceDeps> {
    const src = fs.readFileSync(SERVICE_REPO, 'utf-8');

    const methodRe = /public\s+(get\w+)\(\)/g;
    const starts: { pos: number; name: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = methodRe.exec(src)) !== null) {
        starts.push({ pos: m.index, name: m[1] });
    }

    const services: Record<string, ServiceDeps> = {};

    for (let i = 0; i < starts.length; i++) {
        const block = src.slice(
            starts[i].pos,
            i + 1 < starts.length ? starts[i + 1].pos : src.length,
        );

        const keyMatch = block.match(/this\.getService\(\s*'(\w+)'/);
        if (!keyMatch) continue;
        const key = keyMatch[1];

        const models = unique(
            matchAll(block, /this\.models\.(get\w+)\(\)/g).map((x) =>
                x.slice(3),
            ),
        );
        const clients = unique(
            matchAll(block, /this\.clients\.(get\w+)\(\)/g).map((x) =>
                x.slice(3),
            ),
        );
        const svcDeps = unique(
            matchAll(block, /this\.(get\w+Service)\(\)/g)
                .filter((x) => x !== 'getService')
                .map((x) => x.slice(3)),
        );

        const displayName = key[0].toUpperCase() + key.slice(1);
        services[displayName] = { models, clients, services: svcDeps };
    }

    return services;
}

export function parseControllers(): Record<string, string[]> {
    const controllers: Record<string, string[]> = {};

    const patterns = [
        path.join(CONTROLLERS_DIR, '*.ts'),
        path.join(CONTROLLERS_DIR, 'v2', '*.ts'),
    ];

    for (const pattern of patterns) {
        const dir = path.dirname(pattern);
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
        for (const file of files) {
            if (
                file === 'baseController.ts' ||
                file === 'index.ts' ||
                file.includes('.test.') ||
                file.includes('.spec.')
            )
                continue;

            const fpath = path.join(dir, file);
            const content = fs.readFileSync(fpath, 'utf-8');

            const calls = unique(
                matchAll(content, /\.get(\w+Service)(?:<\w+>)?\(\)/g),
            );

            if (calls.length > 0) {
                const isV2 = dir.endsWith('v2');
                const name = file.replace('.ts', '');
                const displayName = isV2 ? `v2/${name}` : name;
                controllers[displayName] = calls.sort();
            }
        }
    }

    return controllers;
}

export function parseRouters(): Record<string, string[]> {
    const routers: Record<string, string[]> = {};

    if (!fs.existsSync(ROUTERS_DIR)) return routers;

    const files = fs.readdirSync(ROUTERS_DIR).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
        if (
            file === 'index.ts' ||
            file.includes('.test.') ||
            file.includes('.spec.')
        )
            continue;

        const fpath = path.join(ROUTERS_DIR, file);
        const content = fs.readFileSync(fpath, 'utf-8');

        const calls = unique(
            matchAll(content, /\.get(\w+Service)(?:<\w+>)?\(\)/g),
        );

        if (calls.length > 0) {
            const name = file.replace('.ts', '');
            routers[name] = calls.sort();
        }
    }

    return routers;
}

export function parseEeIndex(): EeParsed {
    if (!fs.existsSync(EE_INDEX)) {
        return { services: {}, modelNames: [], clientNames: [] };
    }

    const src = fs.readFileSync(EE_INDEX, 'utf-8');

    const serviceBlockMatch = src.match(/serviceProviders:\s*\{([\s\S]*?)\n\s{8}\},/);
    const modelBlockMatch = src.match(/modelProviders:\s*\{([\s\S]*?)\n\s{8}\},/);
    const clientBlockMatch = src.match(/clientProviders:\s*\{([\s\S]*?)\n\s{8}\},/);

    const services: Record<string, ServiceDeps> = {};

    if (serviceBlockMatch) {
        const block = serviceBlockMatch[1];
        const providerRe = /^\s{12}(\w+):\s*\(/gm;
        const providerStarts: { pos: number; name: string }[] = [];
        let m: RegExpExecArray | null;
        while ((m = providerRe.exec(block)) !== null) {
            providerStarts.push({ pos: m.index, name: m[1] });
        }

        for (let i = 0; i < providerStarts.length; i++) {
            const providerBlock = block.slice(
                providerStarts[i].pos,
                i + 1 < providerStarts.length ? providerStarts[i + 1].pos : block.length,
            );
            const key = providerStarts[i].name;

            const models = unique(
                matchAll(providerBlock, /models\.(get\w+)\(\)/g).map((x) => x.slice(3)),
            );
            const clients = unique(
                matchAll(providerBlock, /clients\.(get\w+)\(\)/g).map((x) => x.slice(3)),
            );
            const svcDeps = unique(
                matchAll(providerBlock, /repository\.(get\w+)\(\)/g).map((x) => x.slice(3)),
            );

            const displayName = key[0].toUpperCase() + key.slice(1);
            services[displayName] = { models, clients, services: svcDeps };
        }
    }

    const modelNames: string[] = [];
    if (modelBlockMatch) {
        const block = modelBlockMatch[1];
        const nameRe = /^\s{12}(\w+):/gm;
        let m: RegExpExecArray | null;
        while ((m = nameRe.exec(block)) !== null) {
            modelNames.push(m[1][0].toUpperCase() + m[1].slice(1));
        }
    }

    const clientNames: string[] = [];
    if (clientBlockMatch) {
        const block = clientBlockMatch[1];
        const nameRe = /^\s{12}(\w+):/gm;
        let m: RegExpExecArray | null;
        while ((m = nameRe.exec(block)) !== null) {
            clientNames.push(m[1][0].toUpperCase() + m[1].slice(1));
        }
    }

    return { services, modelNames, clientNames };
}

export function parseEeControllers(): Record<string, string[]> {
    const controllers: Record<string, string[]> = {};

    if (!fs.existsSync(EE_CONTROLLERS_DIR)) return controllers;

    const files = fs.readdirSync(EE_CONTROLLERS_DIR).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
        if (
            file === 'index.ts' ||
            file.includes('.test.') ||
            file.includes('.spec.')
        )
            continue;

        const fpath = path.join(EE_CONTROLLERS_DIR, file);
        const content = fs.readFileSync(fpath, 'utf-8');

        const calls = unique(
            matchAll(content, /\.get(\w+Service)(?:<\w+>)?\(\)/g),
        );

        if (calls.length > 0) {
            const name = file.replace('.ts', '');
            controllers[`ee/${name}`] = calls.sort();
        }
    }

    return controllers;
}

export function parseSchedulerTask(): SchedulerDeps {
    const fp = path.join(SCHEDULER_DIR, 'SchedulerTask.ts');
    if (!fs.existsSync(fp)) return { services: [], clients: [] };

    const src = fs.readFileSync(fp, 'utf-8');
    const blockMatch = src.match(/type\s+SchedulerTaskArguments\s*=\s*\{([\s\S]*?)\};/);
    if (!blockMatch) return { services: [], clients: [] };

    const block = blockMatch[1];
    const services: string[] = [];
    const clients: string[] = [];
    const exclude = new Set(['LightdashConfig', 'EncryptionUtil', 'LightdashAnalytics', 'SchedulerClient']);

    const propRe = /(\w+):\s*(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = propRe.exec(block)) !== null) {
        const typeName = m[2];
        if (exclude.has(typeName)) continue;
        if (typeName.endsWith('Service')) services.push(typeName);
        else if (typeName.endsWith('Client')) clients.push(typeName);
    }

    return { services: unique(services), clients: unique(clients) };
}

export function parseEeSchedulerTask(): SchedulerDeps {
    const fp = path.join(EE_SCHEDULER_DIR, 'SchedulerWorker.ts');
    if (!fs.existsSync(fp)) return { services: [], clients: [] };

    const src = fs.readFileSync(fp, 'utf-8');
    const blockMatch = src.match(/CommercialSchedulerWorkerArguments\s*=\s*SchedulerTaskArguments\s*&\s*\{([\s\S]*?)\}/);
    if (!blockMatch) return { services: [], clients: [] };

    const block = blockMatch[1];
    const services: string[] = [];
    const clients: string[] = [];

    const propRe = /(\w+):\s*(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = propRe.exec(block)) !== null) {
        const typeName = m[2];
        if (typeName.endsWith('Service')) services.push(typeName);
        else if (typeName.endsWith('Client')) clients.push(typeName);
    }

    return { services: unique(services), clients: unique(clients) };
}

export function parseEntities(): string[] {
    if (!fs.existsSync(ENTITIES_DIR)) return [];

    return fs.readdirSync(ENTITIES_DIR)
        .filter((f) =>
            f.endsWith('.ts') &&
            !f.includes('.test.') &&
            !f.includes('.spec.') &&
            f !== 'index.ts' &&
            f !== 'CLAUDE.md',
        )
        .map((f) => f.replace('.ts', ''));
}

export function parseModelEntityImports(
    modelIds: string[],
    resolveFile: (id: string, type: 'model', ee?: boolean) => string | undefined,
): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const modelId of modelIds) {
        const fp = resolveFile(modelId, 'model');
        if (!fp) continue;

        const src = fs.readFileSync(fp, 'utf-8');
        const imports = unique(
            matchAll(src, /from\s+['"].*?database\/entities\/(\w+)['"]/g),
        );
        if (imports.length > 0) {
            result[modelId] = imports;
        }
    }

    return result;
}

export function parseServiceAdapterImports(
    serviceIds: string[],
    adapterNames: string[],
    resolveFile: (id: string, type: 'service', ee?: boolean) => string | undefined,
): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    const adapterSet = new Set(adapterNames);

    for (const serviceId of serviceIds) {
        const fp = resolveFile(serviceId, 'service');
        if (!fp) continue;

        const src = fs.readFileSync(fp, 'utf-8');
        if (!src.includes('projectAdapter')) continue;

        if (src.includes('projectAdapterFromConfig')) {
            result[serviceId] = adapterNames;
            continue;
        }

        const imported = matchAll(
            src,
            /import\s+\{([^}]+)\}\s+from\s+['"].*?projectAdapters\/[^'"]+['"]/g,
        );
        const classNames: string[] = [];
        for (const importBlock of imported) {
            for (const name of importBlock.split(',')) {
                const trimmed = name.trim();
                if (adapterSet.has(trimmed)) classNames.push(trimmed);
            }
        }

        if (classNames.length > 0) {
            result[serviceId] = unique(classNames);
        }
    }

    return result;
}

export function parseAdapters(): Record<string, AdapterInfo> {
    if (!fs.existsSync(ADAPTERS_DIR)) return {};

    const adapters: Record<string, AdapterInfo> = {};
    const files = fs.readdirSync(ADAPTERS_DIR).filter(
        (f) =>
            f.endsWith('.ts') &&
            !f.includes('.test.') &&
            !f.includes('.spec.') &&
            f !== 'projectAdapter.ts' &&
            f !== 'index.ts',
    );

    for (const file of files) {
        const fpath = path.join(ADAPTERS_DIR, file);
        const content = fs.readFileSync(fpath, 'utf-8');

        const classMatch = content.match(
            /class\s+(\w+)\s+extends\s+(\w+)/,
        );
        if (classMatch) {
            adapters[classMatch[1]] = { parent: classMatch[2] };
        } else {
            const implMatch = content.match(
                /class\s+(\w+)\s+implements\s+\w+/,
            );
            if (implMatch) {
                adapters[implMatch[1]] = { parent: null };
            }
        }
    }

    return adapters;
}

export function parseMiddlewares(): Record<string, string[]> {
    if (!fs.existsSync(MIDDLEWARES_DIR)) return {};

    const result: Record<string, string[]> = {};

    const entries = fs.readdirSync(MIDDLEWARES_DIR, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const dirPath = path.join(MIDDLEWARES_DIR, entry.name);
        const files = fs.readdirSync(dirPath).filter(
            (f) =>
                f.endsWith('.ts') &&
                !f.includes('.test.') &&
                !f.includes('.spec.') &&
                f !== 'index.ts',
        );

        for (const file of files) {
            const fpath = path.join(dirPath, file);
            const content = fs.readFileSync(fpath, 'utf-8');

            const calls = unique(
                matchAll(content, /req\.services\?\.get(\w+)\(\)/g),
            );
            if (calls.length > 0) {
                const name = file.replace('.ts', '');
                result[name] = calls;
            }
        }
    }

    return result;
}
