import * as fs from 'fs';
import * as path from 'path';
import {
    SERVICE_REPO,
    CONTROLLERS_DIR,
    ROUTERS_DIR,
    EE_DIR,
    EE_CONTROLLERS_DIR,
    EE_INDEX,
} from './config';
import { matchAll, unique } from './utils';
import type { ServiceDeps, EeParsed } from './types';

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
