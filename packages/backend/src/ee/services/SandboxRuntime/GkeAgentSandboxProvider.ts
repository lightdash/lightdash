import * as k8s from '@kubernetes/client-node';
import { randomUUID } from 'node:crypto';
import { PassThrough, Readable, Writable } from 'node:stream';
import {
    SandboxCommandError,
    SandboxOutputLimitError,
    SandboxTimeoutError,
} from './errors';
import { createGitOverCommands, shQuote } from './gitOverCommands';
import type {
    CommandResult,
    FileReadOptions,
    PersistOptions,
    RunOptions,
    SandboxCapabilities,
    SandboxHandle,
    SandboxProvider,
    SandboxSpec,
    SnapshotRef,
} from './types';

export interface GkeAgentSandboxConfig {
    namespace: string;
    warmPool: string;
    container: string;
}
const GROUP = 'extensions.agents.x-k8s.io';
const VERSION = 'v1beta1';

/** Minimal ustar archive so many files land in one exec. */
const tarOf = (files: { path: string; contents: Buffer }[]): Buffer => {
    const blocks: Buffer[] = [];
    for (const f of files) {
        const name = f.path.replace(/^\/+/, '');
        const h = Buffer.alloc(512);
        h.write(name, 0, 100, 'utf8');
        h.write('0000644\0', 100);
        h.write('0001750\0', 108);
        h.write('0001750\0', 116);
        h.write(`${f.contents.length.toString(8).padStart(11, '0')}\0`, 124);
        h.write(
            `${Math.floor(Date.now() / 1000)
                .toString(8)
                .padStart(11, '0')}\0`,
            136,
        );
        h.write('        ', 148);
        h.write('0', 156);
        h.write('ustar\0', 257);
        h.write('00', 263);
        let sum = 0;
        for (const b of h) sum += b;
        h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
        blocks.push(
            h,
            f.contents,
            Buffer.alloc((512 - (f.contents.length % 512)) % 512),
        );
    }
    blocks.push(Buffer.alloc(1024));
    return Buffer.concat(blocks);
};

class Handle implements SandboxHandle {
    readonly git;
    constructor(
        readonly sandboxId: string,
        private readonly pod: string,
        private readonly exec: k8s.Exec,
        private readonly cfg: GkeAgentSandboxConfig,
    ) {
        this.git = createGitOverCommands(this.commands, this.files);
    }

    private rawExec(
        argv: string[],
        opts: { stdin?: Buffer; timeoutMs?: number; maxBytes?: number },
    ): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number }> {
        return new Promise((resolve, reject) => {
            const out: Buffer[] = [];
            const err: Buffer[] = [];
            let bytes = 0;
            let done = false;
            let ws: { close(): void } | undefined;
            const finish = (fn: () => void) => {
                if (!done) {
                    done = true;
                    if (timer) clearTimeout(timer);
                    fn();
                }
            };
            const sink = (arr: Buffer[]) =>
                new Writable({
                    write: (chunk: Buffer, _e, cb) => {
                        bytes += chunk.length;
                        if (
                            opts.maxBytes !== undefined &&
                            bytes > opts.maxBytes
                        ) {
                            ws?.close();
                            finish(() =>
                                reject(
                                    new SandboxOutputLimitError(opts.maxBytes!),
                                ),
                            );
                        } else arr.push(chunk);
                        cb();
                    },
                });
            const timer = opts.timeoutMs
                ? setTimeout(() => {
                      ws?.close();
                      finish(() =>
                          reject(
                              new SandboxTimeoutError(
                                  `Command timed out after ${opts.timeoutMs}ms`,
                              ),
                          ),
                      );
                  }, opts.timeoutMs)
                : null;
            let stdin: Readable | null = null;
            if (opts.stdin) {
                const p = new PassThrough();
                p.end(opts.stdin);
                stdin = p;
            }
            this.exec
                .exec(
                    this.cfg.namespace,
                    this.pod,
                    this.cfg.container,
                    argv,
                    sink(out),
                    sink(err),
                    stdin,
                    false,
                    (status) => {
                        let exitCode = 0;
                        if (status.status !== 'Success') {
                            const c = status.details?.causes?.find(
                                (x) => x.reason === 'ExitCode',
                            );
                            exitCode = c?.message ? Number(c.message) : 1;
                        }
                        finish(() =>
                            resolve({
                                stdout: Buffer.concat(out),
                                stderr: Buffer.concat(err),
                                exitCode,
                            }),
                        );
                    },
                )
                .then(
                    (w) => {
                        ws = w as unknown as { close(): void };
                    },
                    (e) => finish(() => reject(e)),
                );
        });
    }

    readonly commands = {
        run: async (
            command: string,
            options?: RunOptions,
        ): Promise<CommandResult> => {
            const env = Object.entries(options?.envs ?? {})
                .map(([k, v]) => `${k}=${shQuote(v)}`)
                .join(' ');
            const line = `${options?.cwd ? `cd ${shQuote(options.cwd)} && ` : ''}${env ? `export ${env}; ` : ''}${command}`;
            const r = await this.rawExec(['/bin/sh', '-c', line], {
                timeoutMs: options?.timeoutMs,
                maxBytes: options?.maxOutputBytes,
            });
            const res = {
                stdout: r.stdout.toString('utf8'),
                stderr: r.stderr.toString('utf8'),
                exitCode: r.exitCode,
            };
            if (res.stdout) options?.onStdout?.(res.stdout);
            if (res.stderr) options?.onStderr?.(res.stderr);
            if (res.exitCode !== 0)
                throw new SandboxCommandError(
                    res.exitCode,
                    res.stderr,
                    res.stdout,
                );
            return res;
        },
    };

    readonly files = {
        read: async (path: string, options?: FileReadOptions) =>
            (await this.files.readBytes(path, options)).toString('utf8'),
        readBytes: async (
            path: string,
            options?: FileReadOptions,
        ): Promise<Buffer> => {
            const r = await this.rawExec(['cat', path], {
                maxBytes: options?.maxBytes,
                timeoutMs: 120_000,
            });
            if (r.exitCode !== 0)
                throw new SandboxCommandError(
                    r.exitCode,
                    r.stderr.toString(),
                    '',
                );
            return r.stdout;
        },
        write: async (path: string, contents: string | Uint8Array) =>
            this.files.writeMany([{ path, contents }]),
        writeMany: async (
            files: { path: string; contents: string | Uint8Array }[],
        ) => {
            const tar = tarOf(
                files.map((f) => ({
                    path: f.path,
                    contents:
                        typeof f.contents === 'string'
                            ? Buffer.from(f.contents, 'utf8')
                            : Buffer.from(f.contents),
                })),
            );
            const r = await this.rawExec(['tar', '-x', '-C', '/', '-f', '-'], {
                stdin: tar,
                timeoutMs: 120_000,
            });
            if (r.exitCode !== 0)
                throw new SandboxCommandError(
                    r.exitCode,
                    r.stderr.toString(),
                    '',
                );
        },
        remove: async (path: string) => {
            await this.rawExec(['rm', '-rf', path], { timeoutMs: 60_000 });
        },
    };
}

/**
 * GKE Agent Sandbox provider: claims a pre-warmed gVisor pod from a
 * SandboxWarmPool (`SandboxClaim`), then drives it over the Kubernetes exec
 * API, with multi-file writes sent as one tar stream.
 *
 * Benchmark-grade: it covers the one-shot python query path only. `connect`,
 * `persist` and `resume` are not implemented, and it is not yet selectable
 * through `SANDBOX_PROVIDER`. Claim readiness uses a watch, not polling:
 * polling every claim overloads the API server under concurrency. See
 * sandboxes/python-runner/gke/sandbox-template.yaml for the cluster side.
 */
export class GkeAgentSandboxProvider implements SandboxProvider {
    readonly capabilities: SandboxCapabilities = { pauseResume: false };
    private readonly kc = new k8s.KubeConfig();
    private readonly custom: k8s.CustomObjectsApi;
    private readonly exec: k8s.Exec;
    constructor(private readonly cfg: GkeAgentSandboxConfig) {
        this.kc.loadFromDefault();
        this.custom = this.kc.makeApiClient(k8s.CustomObjectsApi);
        this.exec = new k8s.Exec(this.kc);
    }

    async create(spec: SandboxSpec): Promise<SandboxHandle> {
        const name = `ld-${randomUUID()}`;
        const base = {
            group: GROUP,
            version: VERSION,
            namespace: this.cfg.namespace,
            plural: 'sandboxclaims',
        };
        await this.custom.createNamespacedCustomObject({
            ...base,
            body: {
                apiVersion: `${GROUP}/${VERSION}`,
                kind: 'SandboxClaim',
                metadata: { name },
                spec: {
                    warmPoolRef: { name: this.cfg.warmPool },
                    lifecycle: {
                        shutdownPolicy: 'Delete',
                        shutdownTime: new Date(
                            Date.now() + spec.timeoutMs,
                        ).toISOString(),
                    },
                },
            },
        });
        const isReady = (claim: {
            status?: {
                sandbox?: { name?: string };
                conditions?: { type: string; status: string }[];
            };
        }) =>
            claim.status?.conditions?.some(
                (c) => c.type === 'Ready' && c.status === 'True',
            )
                ? claim.status?.sandbox?.name
                : undefined;
        const pod = await new Promise<string>((resolve, reject) => {
            let settled = false;
            let req: { abort(): void } | undefined;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    req?.abort();
                    reject(
                        new SandboxTimeoutError(
                            `SandboxClaim ${name} not ready in 120s`,
                        ),
                    );
                }
            }, 120_000);
            new k8s.Watch(this.kc)
                .watch(
                    `/apis/${GROUP}/${VERSION}/namespaces/${this.cfg.namespace}/sandboxclaims`,
                    { fieldSelector: `metadata.name=${name}` },
                    (_type, obj) => {
                        const p = isReady(obj);
                        if (p && !settled) {
                            settled = true;
                            clearTimeout(timer);
                            req?.abort();
                            resolve(p);
                        }
                    },
                    (err) => {
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            reject(err ?? new Error('watch closed'));
                        }
                    },
                )
                .then(
                    (r) => {
                        req = r as unknown as { abort(): void };
                        if (settled) req.abort();
                    },
                    (e) => {
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            reject(e);
                        }
                    },
                );
        });
        return new Handle(name, pod, this.exec, this.cfg);
    }

    async connect(): Promise<SandboxHandle> {
        throw new Error('not implemented');
    }
    async destroy(sandboxId: string): Promise<void> {
        await this.custom
            .deleteNamespacedCustomObject({
                group: GROUP,
                version: VERSION,
                namespace: this.cfg.namespace,
                plural: 'sandboxclaims',
                name: sandboxId,
            })
            .catch(() => {});
    }
    async persist(_h: SandboxHandle, _o: PersistOptions): Promise<SnapshotRef> {
        throw new Error('not implemented');
    }
    async resume(): Promise<SandboxHandle> {
        throw new Error('not implemented');
    }
    async deleteSnapshot(): Promise<void> {}
}
