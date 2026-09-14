#!/usr/bin/env node
/**
 * Local chart-registry fixture server, for manually/E2E testing the
 * installable chart types feature without a real charts-repo registry.
 *
 * Builds a one-chart fixture ("fixture-gauge") into `.dev-chart-registry/`
 * (gitignored, repo root) via the backend's `buildChartRegistryFixture`
 * builder, then serves that directory on 127.0.0.1:8089 with node's `http`
 * module. No bundler, no extra dependencies — `tar-stream` is already a
 * direct backend dependency.
 *
 * This file imports a `.ts` module directly, so it MUST be run through
 * `tsx`, not plain `node`:
 *
 *   pnpm dev:chart-registry                  # v1.0.0
 *   pnpm dev:chart-registry -- --version 1.1.0   # rebuild at a bumped
 *                                                 # version (changelog:
 *                                                 # "Fixture upgrade"), to
 *                                                 # exercise the upgrade flow
 *
 * Then point the backend at it (see packages/backend/CLAUDE.md /
 * dev-env-local-env-loading for how .env.development.local is picked up by
 * pm2) and enable the `chart-type-registry` feature flag — see
 * `scripts/dev-feature-flags.sh`.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Duplicated nowhere: this imports the same builder the unit test and the
// (future) charts-repo publish script use, via tsx's on-the-fly TS support.
import { buildChartRegistryFixture } from '../packages/backend/src/ee/services/AppGenerateService/testFixtures/buildChartRegistryFixture.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, '.dev-chart-registry');
const HOST = '127.0.0.1';
const PORT = 8089;

const CONTENT_TYPES = {
    '.json': 'application/json',
    '.tar': 'application/x-tar',
    '.png': 'image/png',
};

function contentTypeFor(filePath) {
    return CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream';
}

function parseArgs(argv) {
    let version;
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--version') {
            version = argv[i + 1];
            i += 1;
        }
    }
    return { version };
}

/** Resolves a request path against OUT_DIR, refusing to escape it (`..`). */
function resolveRequestedFile(pathname) {
    const relativePath = decodeURIComponent(pathname.replace(/^\/+/, ''));
    const requestPath = relativePath === '' ? 'index.json' : relativePath;
    const resolved = path.join(OUT_DIR, requestPath);
    const withinOutDir =
        resolved === OUT_DIR || resolved.startsWith(`${OUT_DIR}${path.sep}`);
    return withinOutDir ? resolved : null;
}

async function handleRequest(req, res) {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
    const resolved = resolveRequestedFile(url.pathname);

    if (!resolved) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        console.log(`404 ${req.method} ${req.url} (outside registry root)`);
        return;
    }

    try {
        const body = await readFile(resolved);
        res.writeHead(200, { 'Content-Type': contentTypeFor(resolved) });
        res.end(body);
        console.log(`200 ${req.method} ${req.url}`);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        console.log(`404 ${req.method} ${req.url}`);
    }
}

async function main() {
    const { version } = parseArgs(process.argv.slice(2));
    const { index } = await buildChartRegistryFixture({
        outDir: OUT_DIR,
        ...(version ? { version } : {}),
    });
    const entry = index.charts[0];
    console.log(
        `Built fixture "${entry.slug}" v${entry.version} into ${OUT_DIR}`,
    );

    const server = createServer((req, res) => {
        handleRequest(req, res).catch((err) => {
            console.error(err);
            res.writeHead(500).end('Internal error');
        });
    });

    server.listen(PORT, HOST, () => {
        console.log(`Chart registry fixture serving on http://${HOST}:${PORT}`);
        console.log('Set in .env.development.local:');
        console.log(`  LIGHTDASH_CHART_REGISTRY_URL=http://${HOST}:${PORT}`);
        console.log('  LIGHTDASH_CHART_REGISTRY_ALLOW_INSECURE=true');
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
