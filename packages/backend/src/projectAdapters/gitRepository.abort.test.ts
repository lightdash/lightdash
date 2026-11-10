import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { simpleGit } from 'simple-git';
import { GIT_REPOSITORY_ENVIRONMENT, GitRepository } from './gitRepository';

it.skipIf(process.platform !== 'linux')(
    'kills git and its child before rejecting an aborted refresh',
    async () => {
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'git-abort-'),
        );
        const executable = path.join(directory, 'git');
        const pidsFile = path.join(directory, 'pids');
        const controller = new AbortController();
        const reason = new Error('leaf_a interrupted');
        let pids: number[] = [];
        const repository = new GitRepository(
            simpleGit({ allowEnvironment: GIT_REPOSITORY_ENVIRONMENT }),
            path.join(directory, 'checkout'),
            'https://example.test/leaf_a.git',
            'leaf_a',
            'main',
            { PATH: directory },
        );
        try {
            await fs.writeFile(
                executable,
                `#!/bin/bash\n/bin/sleep 60 &\nchild=$!\ntrap 'wait "$child"; exit 143' TERM\nprintf '%s %s' "$$" "$child" > '${pidsFile}'\nwait "$child"\n`,
                { mode: 0o755 },
            );
            const work = repository
                .refresh(controller.signal)
                .catch((error: unknown) => error);
            await vi.waitFor(async () => {
                pids = (await fs.readFile(pidsFile, 'utf8'))
                    .split(' ')
                    .map(Number);
                expect(pids).toHaveLength(2);
            });
            controller.abort(reason);
            expect(await work).toBe(reason);
            for (const pid of pids)
                expect(() => process.kill(pid, 0)).toThrow();
        } finally {
            controller.abort(reason);
            for (const pid of pids) {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (error) {
                    expect((error as NodeJS.ErrnoException).code).toBe('ESRCH');
                }
            }
            await fs.rm(directory, { recursive: true, force: true });
        }
    },
    20000,
);
