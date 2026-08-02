import { ContentAsCodeType, type AgentAsCode } from '@lightdash/common';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    AI_AGENT_CODE_RESOURCE,
    ALERT_CODE_RESOURCE,
} from './projectResources';
import { readCodeResourceFiles, writeCodeResourceDocuments } from './resource';

const temporaryDirectories: string[] = [];

const agent = (slug: string): AgentAsCode => ({
    contentType: ContentAsCodeType.AI_AGENT,
    version: 1,
    agentVersion: 2,
    slug,
    name: slug,
    description: null,
    imageUrl: null,
    instruction: null,
    tags: null,
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: false,
    enableUserContext: false,
    modelConfig: null,
});

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) =>
            fs.rm(directory, {
                recursive: true,
                force: true,
            }),
        ),
    );
});

describe('content-as-code resource files', () => {
    it('preserves other documents when writing a filtered download', async () => {
        const basePath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-content-as-code-'),
        );
        temporaryDirectories.push(basePath);
        await writeCodeResourceDocuments({
            definition: AI_AGENT_CODE_RESOURCE,
            basePath,
            documents: [agent('alpha'), agent('beta')],
            pruneOtherDocuments: true,
        });

        await writeCodeResourceDocuments({
            definition: AI_AGENT_CODE_RESOURCE,
            basePath,
            documents: [agent('alpha')],
            pruneOtherDocuments: false,
        });

        await expect(
            fs.readdir(path.join(basePath, 'ai-agents')),
        ).resolves.toEqual(['alpha.yml', 'beta.yml']);
    });

    it('prunes other documents when writing a complete download', async () => {
        const basePath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-content-as-code-'),
        );
        temporaryDirectories.push(basePath);
        await writeCodeResourceDocuments({
            definition: AI_AGENT_CODE_RESOURCE,
            basePath,
            documents: [agent('alpha'), agent('beta')],
            pruneOtherDocuments: true,
        });

        await writeCodeResourceDocuments({
            definition: AI_AGENT_CODE_RESOURCE,
            basePath,
            documents: [agent('alpha')],
            pruneOtherDocuments: true,
        });

        await expect(
            fs.readdir(path.join(basePath, 'ai-agents')),
        ).resolves.toEqual(['alpha.yml']);
    });

    it('ignores other scheduled content types in a shared legacy folder', async () => {
        const basePath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-content-as-code-'),
        );
        temporaryDirectories.push(basePath);
        const alertFolder = path.join(basePath, 'alerts', 'charts', 'orders');
        await fs.mkdir(alertFolder, { recursive: true });
        await Promise.all([
            fs.writeFile(
                path.join(alertFolder, 'alert.yml'),
                'contentType: alert\nversion: 1\nslug: revenue-alert\nname: Revenue alert\n',
            ),
            fs.writeFile(
                path.join(alertFolder, 'delivery.yml'),
                'contentType: scheduled_delivery\nversion: 1\nslug: revenue-delivery\nname: Revenue delivery\n',
            ),
            fs.writeFile(
                path.join(alertFolder, 'invalid-alert.yml'),
                'contentType: alert\nslug: invalid-alert\nname: Invalid alert\n',
            ),
        ]);

        const result = await readCodeResourceFiles({
            definition: ALERT_CODE_RESOURCE,
            basePath,
        });

        expect(result.files.map(({ document }) => document.slug)).toEqual([
            'revenue-alert',
        ]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].message).toContain('invalid-alert.yml');
        expect(result.failures[0].message).toContain('expected version 1');
    });
});
