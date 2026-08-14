import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';
import {
    loadAppEnv,
    isMain,
    requireEnv,
    rootDir,
    runMain,
    sleep,
} from './lib/app.ts';
import { createExeClient, rawExeCommand } from './lib/exe.ts';
import { sshArgs } from '../src/sandboxes/openssh.ts';

interface PreviewOptions {
    vm: string;
    host?: string;
}

export async function publishPreview({
    vm,
    host = `${vm}.exe.xyz`,
}: PreviewOptions): Promise<string> {
    const url = `https://${vm}.exe.xyz`;
    const keyPath = requireEnv('EXE_SSH_KEY');
    const startedAt = Date.now();

    console.error(`=== bootstrap preview on ${vm} (${host}) ===`);
    const bootstrap = await execa(
        'ssh',
        sshArgs(keyPath, host, ['bash', '-s', '--', vm]),
        {
            input: createReadStream(join(rootDir, 'preview/start-preview.sh')),
            stdout: ['pipe', process.stderr],
            stderr: ['pipe', process.stderr],
        },
    );
    console.error(
        `=== bootstrap done in ${Math.floor((Date.now() - startedAt) / 1_000)}s ===`,
    );

    const output = `${bootstrap.stdout}\n${bootstrap.stderr}`;
    const ports = [...output.matchAll(/PREVIEW_PORT=(\d+)/g)];
    const port = ports.at(-1)?.[1] ?? '3000';
    const exe = createExeClient();

    console.error(`=== publish port ${port} ===`);
    const portResult = await rawExeCommand(exe, `share port ${vm} ${port}`);
    if (portResult) console.error(portResult);
    const publicResult = await rawExeCommand(exe, `share set-public ${vm}`);
    if (publicResult) console.error(publicResult);

    console.error(`=== verify ${url}/login ===`);
    let status: number | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
            status = (await fetch(`${url}/login`, { redirect: 'manual' }))
                .status;
        } catch {
            status = undefined;
        }
        if (status === 200) return url;
        await sleep(2_000);
    }

    throw new Error(`login page not served (last code: ${status ?? ''})`);
}

async function main(): Promise<void> {
    loadAppEnv();
    const vm = process.argv[2];
    if (!vm) throw new Error('usage: preview.ts <vm-name> [ssh-host]');
    const url = await publishPreview({ vm, host: process.argv[3] });
    console.log(`PREVIEW: ${url}`);
}

if (isMain(import.meta.url)) runMain(main);
