import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ALERT_CODE_RESOURCE } from './projectResources';
import { readCodeResourceFiles } from './resource';

const temporaryDirectories: string[] = [];

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
