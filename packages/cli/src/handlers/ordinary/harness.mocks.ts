import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'http';
import * as yaml from 'js-yaml';
import path from 'path';
import type { Config } from '../../config';

export type RecordedRequest = {
    method: string;
    path: string;
    authorization: string | undefined;
    body: string;
};
export type Reply = {
    method: string;
    path: string;
    results?: unknown;
    status?: number;
    error?: string;
    body?: string;
    disconnect?: boolean;
    raw?: string;
};
export class OrdinaryServer {
    readonly requests: RecordedRequest[] = [];
    readonly headers: IncomingHttpHeaders[] = [];
    readonly unexpected: RecordedRequest[] = [];
    readonly replies: Reply[] = [];
    readonly server: Server;
    url = '';
    onRequest: (() => void) | null = null;
    constructor() {
        this.server = createServer((req, res) => {
            let body = '';
            req.on('data', (chunk) => {
                body += String(chunk);
            });
            req.on('end', () => {
                const request = {
                    method: req.method!,
                    path: req.url!,
                    authorization: req.headers.authorization,
                    body,
                };
                this.requests.push(request);
                this.headers.push(req.headers);
                this.onRequest?.();
                const reply = this.replies.shift();
                if (
                    !reply ||
                    reply.method !== req.method ||
                    reply.path !== req.url ||
                    (reply.body !== undefined && reply.body !== body)
                ) {
                    this.unexpected.push(request);
                    res.writeHead(500, { 'content-type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            status: 'error',
                            error: {
                                name: 'Unexpected',
                                message: 'Unexpected request',
                            },
                        }),
                    );
                    return;
                }
                if (reply.disconnect) {
                    req.socket.destroy();
                    return;
                }
                res.writeHead(reply.status ?? 200, {
                    'content-type':
                        reply.raw === undefined
                            ? 'application/json'
                            : 'text/plain',
                });
                res.end(
                    reply.raw ??
                        JSON.stringify(
                            reply.error
                                ? {
                                      status: 'error',
                                      error: {
                                          name: 'Fixture',
                                          message: reply.error,
                                          statusCode: reply.status,
                                      },
                                  }
                                : { status: 'ok', results: reply.results },
                        ),
                );
            });
        });
    }
    async start() {
        await new Promise<void>((resolve) => {
            this.server.listen(0, '127.0.0.1', resolve);
        });
        const address = this.server.address();
        if (!address || typeof address === 'string')
            throw new Error('Missing server');
        this.url = `http://127.0.0.1:${address.port}`;
    }
    async close() {
        this.server.closeAllConnections();
        await new Promise<void>((resolve) => {
            this.server.close(() => resolve());
        });
    }
    expectComplete() {
        expect(this.unexpected).toEqual([]);
        expect(this.replies).toEqual([]);
    }
}
export const personalConfig = (serverUrl: string): Config => ({
    user: {
        anonymousUuid: 'fixed',
        userUuid: 'person',
        organizationUuid: 'org',
    },
    context: {
        serverUrl,
        apiKey: 'ldpat_pin',
        project: '11111111-1111-4111-8111-111111111111',
        projectName: 'Main',
        source: 'finance',
    },
    answers: { permissionToStoreWarehouseCredentials: false },
});
export const saveConfig = async (home: string, config: Config) => {
    const file = path.join(home, '.config/lightdash/config.yaml');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, yaml.dump(config));
    return file;
};
export const request = (
    method: string,
    url: string,
    body = '',
): RecordedRequest => ({
    method,
    path: url,
    body,
    authorization: 'ApiKey ldpat_pin',
});

export const runOrdinaryCli = async (home: string, args: string[]) => {
    const entry = path.join(home, 'ordinary-entry.cjs');
    const analytics = path.resolve(__dirname, '../../analytics/analytics.ts');
    const index = path.resolve(__dirname, '../../index.ts');
    await fs.writeFile(
        entry,
        `const { LightdashAnalytics } = require(${JSON.stringify(analytics)}); LightdashAnalytics.track = async () => {}; LightdashAnalytics.identify = async () => {}; require(${JSON.stringify(index)});`,
    );
    const env = {
        ...process.env,
        HOME: home,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        CI: 'true',
    };
    return new Promise<{ code: number | null; stdout: string; stderr: string }>(
        (resolve, reject) => {
            const child = spawn(
                process.execPath,
                ['--import', 'tsx', entry, ...args],
                { env, stdio: ['ignore', 'pipe', 'pipe'] },
            );
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (chunk) => {
                stdout += String(chunk);
            });
            child.stderr.on('data', (chunk) => {
                stderr += String(chunk);
            });
            child.on('error', reject);
            child.on('close', (code) => resolve({ code, stdout, stderr }));
        },
    );
};
