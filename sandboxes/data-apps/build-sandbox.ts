#!/usr/bin/env npx tsx
/**
 * Builds and uploads the e2b sandbox template for Lightdash data apps.
 *
 * The template pre-installs all npm deps, bootstraps shadcn/ui components,
 * and includes the Claude CLI — so sandboxes start instantly ready to generate.
 *
 * Prerequisites:
 *   npm install       # in this directory
 *   Add E2B_API_KEY to .env
 *
 * Usage:
 *   npx tsx build-sandbox.ts
 */
import { Template } from 'e2b';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Load .env so E2B_API_KEY can live alongside the other keys
if (fs.existsSync('.env')) {
    for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
        const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2];
        }
    }
}

// Build and pack @lightdash/query-sdk so it can be installed in the sandbox
console.log('Building @lightdash/query-sdk...');
const sdkDir = path.resolve('../../packages/query-sdk');
execSync(`pnpm -C ${sdkDir} build`, { stdio: 'inherit' });

console.log('Packing @lightdash/query-sdk...');
execSync(`pnpm -C ${sdkDir} pack --pack-destination ${process.cwd()}`, {
    stdio: 'inherit',
});
// Rename to a fixed name so the Dockerfile COPY is deterministic
const tarballs = fs.readdirSync('.').filter((f) => f.startsWith('lightdash-query-sdk-') && f.endsWith('.tgz'));
if (tarballs.length !== 1) {
    console.error('Expected exactly one query-sdk tarball, found:', tarballs);
    process.exit(1);
}
fs.renameSync(tarballs[0], 'lightdash-query-sdk.tgz');
console.log('');

const dockerfile = fs.readFileSync('e2b.Dockerfile', 'utf-8');

async function main() {
    try {
        const template = Template({
            fileContextPath: path.resolve('.'),
        }).fromDockerfile(dockerfile);

        const templateName =
            process.env.E2B_TEMPLATE_NAME || 'lightdash-data-app';

        // Primary tag goes on the build target (`name:tag`). Any extras come
        // through the `tags` option so a single build can be addressed via
        // multiple aliases (e.g. `0.2870.0` and `latest`). Empty/absent
        // values fall through to E2B's implicit `default` tag.
        const primaryTag = process.env.E2B_TEMPLATE_TAG?.trim() || '';
        const extraTags = (process.env.E2B_TEMPLATE_EXTRA_TAGS || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);

        const buildTarget = primaryTag
            ? `${templateName}:${primaryTag}`
            : templateName;

        console.log(
            `Submitting sandbox template build (target: ${buildTarget}${
                extraTags.length ? `, extra tags: ${extraTags.join(', ')}` : ''
            })...\n`,
        );

        const skipCache = process.argv.includes('--no-cache');

        const info = await Template.buildInBackground(
            template,
            buildTarget,
            {
                cpuCount: 2,
                memoryMB: 2048,
                ...(extraTags.length ? { tags: extraTags } : {}),
                ...(skipCache ? { skipCache: true } : {}),
            },
        );

        console.log(`Template: ${info.name}`);
        console.log(`Template ID: ${info.templateId}`);
        console.log(`Build ID: ${info.buildId}`);
        console.log('\nPolling build status...\n');

        let logsOffset = 0;
        while (true) {
            const status = await Template.getBuildStatus(info, {
                logsOffset,
            });
            for (const log of status.logs) {
                console.log(log.toString());
                logsOffset++;
            }
            if (status.status === 'ready') {
                console.log('\nTemplate built successfully!');
                break;
            }
            if (status.status === 'error') {
                console.error('\nBuild failed!');
                process.exit(1);
            }
            await new Promise((r) => setTimeout(r, 2000));
        }
    } catch (err: any) {
        console.error('Build error:', err?.message ?? err);
        console.error('Status:', err?.status);
        console.error('Body:', err?.body ?? err?.response?.body);
        console.error('Stack:', err?.stack);
        process.exit(1);
    }
}

main();
