import { DbtError, SupportedDbtVersions } from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DbtCliClient } from './dbtCliClient';

it.each([true, false])(
    'owns failed deps downloads with cancellation enabled=%s',
    async (enabled) => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-disk-'));
        const ambientTmp = path.join(directory, 'ambient');
        const executable = path.join(directory, 'leaf_a');
        const client = new DbtCliClient({
            dbtProjectDirectory: directory,
            dbtProfilesDirectory: directory,
            environment: { TMPDIR: ambientTmp },
            environmentVariableAllowlist: [],
            explicitCredentials: false,
            dbtVersion: SupportedDbtVersions.V1_12,
            partialParseBaselinePath: null,
        });
        try {
            await fs.mkdir(ambientTmp);
            await fs.writeFile(
                executable,
                '#!/bin/bash\nmkdir "$TMPDIR/dbt-downloads-leaf_a"\nprintf failed > "$TMPDIR/dbt-downloads-leaf_a/package"\nexit 1\n',
                { mode: 0o755 },
            );
            vi.spyOn(client, 'getDbtExec').mockReturnValue(executable);
            await expect(
                client.installDeps(
                    enabled ? new AbortController().signal : undefined,
                ),
            ).rejects.toBeInstanceOf(DbtError);
            const target = client.targetDirectory!;
            expect(
                await fs.readFile(
                    path.join(target, 'tmp', 'dbt-downloads-leaf_a', 'package'),
                    'utf8',
                ),
            ).toBe('failed');
            expect(await fs.readdir(ambientTmp)).toEqual([]);
            await client.cleanup();
            await expect(fs.stat(target)).rejects.toMatchObject({
                code: 'ENOENT',
            });
        } finally {
            await client.cleanup();
            await fs.rm(directory, { recursive: true, force: true });
            vi.restoreAllMocks();
        }
    },
);
