import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
    SandboxCommandError,
    SandboxOutputLimitError,
    SandboxTimeoutError,
} from '../../../ee/services/SandboxRuntime/errors';
import {
    type SandboxHandle,
    type SandboxProvider,
} from '../../../ee/services/SandboxRuntime/types';
import { LocalProcessSandboxProvider } from './LocalProcessSandboxProvider';

const spec = { templateRef: 'local', timeoutMs: 60_000, egress: { allow: [] } };

describe('LocalProcessSandboxProvider', () => {
    const provider: SandboxProvider = new LocalProcessSandboxProvider();
    const created: SandboxHandle[] = [];
    const createSandbox = async () => {
        const handle = await provider.create(spec);
        created.push(handle);
        return handle;
    };

    afterEach(async () => {
        await Promise.all(
            created.splice(0).map((h) => provider.destroy(h.sandboxId)),
        );
    });

    it('runs a script that reads /work inputs and writes /work outputs', async () => {
        const sandbox = await createSandbox();
        await sandbox.files.write(
            '/work/in/orders.jsonl',
            '{"id":1}\n{"id":2}\n',
        );
        await sandbox.files.write(
            '/work/count.mjs',
            [
                "import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';",
                "const rows = readFileSync(process.argv[2] + '/in/orders.jsonl', 'utf8').trim().split('\\n');",
                "mkdirSync(process.argv[2] + '/out', { recursive: true });",
                "writeFileSync(process.argv[2] + '/out/result.jsonl', JSON.stringify({ count: rows.length }) + '\\n');",
                "console.log('done');",
            ].join('\n'),
        );

        const result = await sandbox.commands.run('node /work/count.mjs /work');

        expect(result).toEqual({ stdout: 'done\n', stderr: '', exitCode: 0 });
        await expect(
            sandbox.files.read('/work/out/result.jsonl'),
        ).resolves.toBe('{"count":2}\n');
        await expect(
            sandbox.files.readBytes('/work/out/result.jsonl'),
        ).resolves.toEqual(Buffer.from('{"count":2}\n'));
    });

    it('runs commands with the sandbox work directory as cwd', async () => {
        const sandbox = await createSandbox();
        await sandbox.files.write('/work/marker.txt', 'here');
        await expect(
            sandbox.commands.run('cat marker.txt'),
        ).resolves.toMatchObject({ stdout: 'here' });
    });

    it('rejects a non-zero exit with the exit code, stderr and stdout', async () => {
        const sandbox = await createSandbox();
        const error = await sandbox.commands
            .run("echo partial; echo 'Binder Error: no column' >&2; exit 3")
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SandboxCommandError);
        expect(error).toMatchObject({
            exitCode: 3,
            stderr: 'Binder Error: no column\n',
            stdout: 'partial\n',
        });
    });

    it('rejects a command that outlives its timeout', async () => {
        const sandbox = await createSandbox();
        const startedAt = Date.now();
        await expect(
            sandbox.commands.run('sleep 10', { timeoutMs: 200 }),
        ).rejects.toBeInstanceOf(SandboxTimeoutError);
        expect(Date.now() - startedAt).toBeLessThan(5_000);
    });

    it('rejects command output beyond maxOutputBytes', async () => {
        const sandbox = await createSandbox();
        await expect(
            sandbox.commands.run("printf '%0200d' 0", { maxOutputBytes: 100 }),
        ).rejects.toEqual(new SandboxOutputLimitError(100));
    });

    it('rejects a file read beyond maxBytes', async () => {
        const sandbox = await createSandbox();
        await sandbox.files.write('/work/out/result.jsonl', 'x'.repeat(11));
        await expect(
            sandbox.files.readBytes('/work/out/result.jsonl', { maxBytes: 10 }),
        ).rejects.toEqual(new SandboxOutputLimitError(10));
        await expect(
            sandbox.files.read('/work/out/result.jsonl', { maxBytes: 10 }),
        ).rejects.toEqual(new SandboxOutputLimitError(10));
        await expect(
            sandbox.files.readBytes('/work/out/result.jsonl', { maxBytes: 11 }),
        ).resolves.toHaveLength(11);
    });

    it('removes files and tolerates removing a missing file', async () => {
        const sandbox = await createSandbox();
        await sandbox.files.write('/work/tmp.txt', 'x');
        await sandbox.files.remove('/work/tmp.txt');
        await sandbox.files.remove('/work/tmp.txt');
        await expect(
            sandbox.files.read('/work/tmp.txt'),
        ).rejects.toBeInstanceOf(SandboxCommandError);
    });

    it('isolates sandboxes and deletes the work directory on destroy', async () => {
        const first = await createSandbox();
        const second = await createSandbox();
        await first.files.write('/work/only-first.txt', 'x');
        await expect(
            second.files.read('/work/only-first.txt'),
        ).rejects.toBeInstanceOf(SandboxCommandError);

        await provider.destroy(first.sandboxId);
        await provider.destroy(first.sandboxId);
        expect(existsSync(first.sandboxId)).toBe(false);
    });

    it('lets a script load the built DuckDB warehouse client through NODE_PATH', async () => {
        const sandbox = await createSandbox();
        await sandbox.files.write(
            '/work/load.mjs',
            [
                "import { createRequire } from 'node:module';",
                'const { DuckdbWarehouseClient } = createRequire(import.meta.url)(',
                "    '@lightdash/warehouses/dist/warehouseClients/DuckdbWarehouseClient',",
                ');',
                'console.log(typeof DuckdbWarehouseClient);',
            ].join('\n'),
        );
        await expect(
            sandbox.commands.run('node /work/load.mjs', { timeoutMs: 30_000 }),
        ).resolves.toMatchObject({ stdout: 'function\n' });
    });
});
