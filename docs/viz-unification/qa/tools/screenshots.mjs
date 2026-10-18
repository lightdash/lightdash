#!/usr/bin/env node
// Screenshots every item in a QA manifest (dashboard, each SQL chart, the
// document, the share link) so the same pages can be compared before and after
// the upgrade. Uses Playwright from the repo (`pnpm install` at the root).
//
// usage: node screenshots.mjs --base http://host --email e --password p \
//          --manifest ./qa-manifest.json --out ./shots-before [--chromium /path/to/chrome]
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseArgs, requireArg } from './lib.mjs';

const args = parseArgs();
const BASE = requireArg(args, 'base', 'LD_URL');
const EMAIL = requireArg(args, 'email', 'LD_EMAIL');
const PASSWORD = requireArg(args, 'password', 'LD_PASSWORD');
const m = JSON.parse(readFileSync(requireArg(args, 'manifest', 'LD_QA_MANIFEST'), 'utf8'));
const OUT = args.out ?? './shots';
mkdirSync(OUT, { recursive: true });

// Playwright comes from the caller's directory or from the visualization
// package's dev dependencies (`@playwright/test` re-exports the browsers)
const candidates = [
    [createRequire(`${process.cwd()}/`), 'playwright'],
    [createRequire(`${process.cwd()}/`), '@playwright/test'],
    [createRequire(new URL('../../../../packages/visualization/package.json', import.meta.url)), '@playwright/test'],
];
let playwright = null;
for (const [req, name] of candidates) {
    try {
        playwright = req(name);
        break;
    } catch {
        // try the next one
    }
}
if (!playwright) {
    process.stderr.write('Playwright not found: run `pnpm install` at the repo root, or run from a directory where it resolves\n');
    process.exit(2);
}
const { chromium } = playwright;
const browser = await chromium.launch({ ...(args.chromium ? { executablePath: args.chromium } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
// Licence-gated and optional endpoints that fail on every page of an instance without an EE licence
const NOISE = /\/aiAgents\/settings|\/ai-credits\/|\/homepage-settings|\/github\/config|\/api\/v1\/org$|\/user\/account$/;
page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/') && !NOISE.test(r.url())) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`);
});

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', EMAIL);
await page.getByRole('button', { name: /continue/i }).click();
await page.fill('input[name="password"]', PASSWORD);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });

const P = m.projectUuid;
const targets = [
    ...m.dashboards.map((d) => ['dashboard', `/projects/${P}/dashboards/${d.uuid}/view`]),
    ...m.sqlCharts.filter((c) => !c.deleted).map((c) => [`chart-${c.key}`, `/projects/${P}/sql-runner/${c.slug}`]),
    ...m.documents.map((d) => ['document', `/projects/${P}/documents/${d.slug}`]),
    ...m.shares.map((s) => [`share-${s.key}`, s.url.replace(BASE, '')]),
];
for (const [name, path] of targets) {
    const before = errors.length;
    try {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(4000);
    } catch (e) {
        errors.push(`navigation ${name}: ${e.message.split('\n')[0]}`);
    }
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const echarts = await page.locator('[_echarts_instance_]').count();
    const tables = await page.locator('table').count();
    process.stdout.write(`${name.padEnd(28)} ${page.url().replace(BASE, '')}  echarts=${echarts} tables=${tables} errors=${errors.length - before}\n`);
}
process.stdout.write(`\n${errors.join('\n')}\n`);
await browser.close();
