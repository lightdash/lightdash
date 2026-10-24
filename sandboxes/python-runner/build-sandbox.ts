#!/usr/bin/env npx tsx
/**
 * Builds and uploads the e2b sandbox template for Lightdash python query nodes.
 *
 * The template pre-installs pandas, numpy, scipy, pyarrow, scikit-learn and
 * polars — the harness is written in per run by the backend.
 *
 * Prerequisites:
 *   npm install       # in this directory
 *   Add E2B_API_KEY to .env
 *
 * Usage:
 *   npx tsx build-sandbox.ts
 */
import { Template, waitForFile } from 'e2b';
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
        const warm = process.argv.includes('--warm');
        const base = Template({
            fileContextPath: path.resolve('.'),
        }).fromDockerfile(dockerfile);

        const template = warm
            ? base.setStartCmd(
                  `python3 -I -c 'import numpy, pandas, scipy.stats, pyarrow; from pathlib import Path; import time; Path("/tmp/python-warm-ready").touch(); time.sleep(10**9)'`,
                  waitForFile('/tmp/python-warm-ready'),
              )
            : base;
        const envPrefix = warm
            ? 'E2B_PYTHON_WARM_TEMPLATE'
            : 'E2B_PYTHON_TEMPLATE';
        const templateName =
            process.env[`${envPrefix}_NAME`] ||
            (warm ? 'lightdash-python-runner-warm' : 'lightdash-python-runner');

        const primaryTag = process.env[`${envPrefix}_TAG`]?.trim() || '';
        const extraTags = (process.env[`${envPrefix}_EXTRA_TAGS`] || '')
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

        const info = await Template.buildInBackground(template, buildTarget, {
            cpuCount: 1,
            memoryMB: 1024,
            ...(extraTags.length ? { tags: extraTags } : {}),
            ...(skipCache ? { skipCache: true } : {}),
        });

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
