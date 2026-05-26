#!/usr/bin/env npx tsx
/**
 * Builds and uploads the e2b sandbox template for Lightdash AI writeback.
 *
 * The template pre-installs dbt adapters, the Claude CLI, and the Lightdash
 * CLI — so sandboxes start instantly ready to run.
 *
 * Prerequisites:
 *   npm install       # in this directory
 *   Add E2B_API_KEY to .env
 *
 * Usage:
 *   npx tsx build-sandbox.ts
 */
import { Template } from 'e2b';
import fs from 'node:fs';
import path from 'node:path';

if (fs.existsSync('.env')) {
    for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
        const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2];
        }
    }
}

const dockerfile = fs.readFileSync('e2b.Dockerfile', 'utf-8');

async function main() {
    try {
        const template = Template({
            fileContextPath: path.resolve('.'),
        }).fromDockerfile(dockerfile);

        const templateName =
            process.env.E2B_TEMPLATE_NAME || 'lightdash-ai-writeback';

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
