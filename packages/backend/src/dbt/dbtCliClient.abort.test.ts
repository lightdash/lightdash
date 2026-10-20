import { SupportedDbtVersions } from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DbtAbortError } from './DbtAbortError';
import { DbtCliClient } from './dbtCliClient';

it.skipIf(process.platform !== 'linux')(
    'kills the dbt process group and awaits both processes on abort',
    async () => {
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'dbt-abort-'),
        );
        const executable = path.join(directory, 'leaf_a');
        const pidsFile = path.join(directory, 'pids');
        const client = new DbtCliClient({
            dbtProjectDirectory: directory,
            dbtProfilesDirectory: directory,
            environment: {},
            environmentVariableAllowlist: [],
            explicitCredentials: false,
            dbtVersion: SupportedDbtVersions.V1_12,
            partialParseBaselinePath: null,
        });
        const controller = new AbortController();
        let pids: number[] = [];
        try {
            await fs.writeFile(
                executable,
                `#!/bin/bash\nsleep 60 &\nchild=$!\ntrap 'wait "$child"; exit 143' TERM\nprintf '%s %s' "$$" "$child" > '${pidsFile}'\nwait "$child"\n`,
                { mode: 0o755 },
            );
            vi.spyOn(client, 'getDbtExec').mockReturnValue(executable);
            const work = client.installDeps(controller.signal);
            const rejected = work.catch((error: unknown) => error);
            await vi.waitFor(async () => {
                pids = (await fs.readFile(pidsFile, 'utf8'))
                    .split(' ')
                    .map(Number);
                expect(pids).toHaveLength(2);
            });
            controller.abort(new Error('leaf_a interrupted'));
            expect(await rejected).toBeInstanceOf(DbtAbortError);
            for (const pid of pids)
                expect(() => process.kill(pid, 0)).toThrow();
        } finally {
            controller.abort();
            for (const pid of pids) {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (error) {
                    expect((error as NodeJS.ErrnoException).code).toBe('ESRCH');
                }
            }
            await client.cleanup();
            await fs.rm(directory, { recursive: true, force: true });
        }
    },
    20000,
);
