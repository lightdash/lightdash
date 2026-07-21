#!/usr/bin/env npx tsx
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
            process.env.E2B_AGENT_ONBOARDING_TEMPLATE_NAME ||
            'lightdash-agent-onboarding';
        const primaryTag =
            process.env.E2B_AGENT_ONBOARDING_TEMPLATE_TAG?.trim() || '';
        const extraTags = (
            process.env.E2B_AGENT_ONBOARDING_TEMPLATE_EXTRA_TAGS || ''
        )
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
        const buildTarget = primaryTag
            ? `${templateName}:${primaryTag}`
            : templateName;
        const skipCache = process.argv.includes('--no-cache');

        const info = await Template.buildInBackground(template, buildTarget, {
            cpuCount: 2,
            memoryMB: 2048,
            ...(extraTags.length ? { tags: extraTags } : {}),
            ...(skipCache ? { skipCache: true } : {}),
        });

        console.log(`Template: ${info.name}`);
        console.log(`Template ID: ${info.templateId}`);
        console.log(`Build ID: ${info.buildId}`);

        let logsOffset = 0;
        while (true) {
            const status = await Template.getBuildStatus(info, { logsOffset });
            for (const log of status.logs) {
                console.log(log.toString());
                logsOffset += 1;
            }
            if (status.status === 'ready') {
                console.log('Template built successfully');
                break;
            }
            if (status.status === 'error') {
                throw new Error('Template build failed');
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    } catch (error: unknown) {
        console.error('Build error:', error);
        process.exit(1);
    }
}

void main();
