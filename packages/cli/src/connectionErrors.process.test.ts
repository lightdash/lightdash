import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { createServer, type Server } from 'http';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import { slotFixture } from './agentConnections/fixtures';
import { AgentConnectionStore } from './agentConnections/store';

const pat = 'process-pat+/secret';
const unseen = 'process-never-held-token';
let directory: string;
let server: Server;
let instance: string;
let calls: string[];
let verifyConnection: boolean;
const slot = slotFixture();
const run = (args: string[]) =>
    new Promise<{ code: number | null; stdout: string; stderr: string }>(
        (resolve, reject) => {
            const env: NodeJS.ProcessEnv = {
                ...process.env,
                HOME: directory,
                LIGHTDASH_URL: instance,
                LIGHTDASH_API_KEY: pat,
                FORCE_COLOR: '0',
                NO_COLOR: '1',
            };
            delete env.LIGHTDASH_AGENT_CONNECTION;
            delete env.LIGHTDASH_PROXY_AUTHORIZATION;
            const child = spawn(
                process.execPath,
                [
                    '--import',
                    'tsx',
                    path.join(__dirname, 'connectionErrors.fixture.ts'),
                    ...args,
                ],
                { env, stdio: ['ignore', 'pipe', 'pipe'] },
            );
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (data) => {
                stdout += String(data);
            });
            child.stderr.on('data', (data) => {
                stderr += String(data);
            });
            child.on('error', reject);
            child.on('close', (code) => resolve({ code, stdout, stderr }));
        },
    );
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'cli-connection-errors-'));
    calls = [];
    verifyConnection = false;
    server = createServer((req, res) => {
        calls.push(req.url!);
        res.setHeader('Content-Type', 'application/json');
        if (verifyConnection && calls.length <= 2) {
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results:
                        req.url === '/api/v1/user'
                            ? {
                                  userUuid: slot.personUuid,
                                  organizationUuid: slot.organizationUuid,
                              }
                            : {
                                  ...slot.lastReported,
                                  grantUuid: slot.grantUuid,
                                  clientId: slot.clientId,
                                  approvedAt: slot.approvedAt,
                                  expiresAt: slot.grantExpiresAt,
                              },
                }),
            );
            return;
        }
        res.end(
            JSON.stringify({
                status: 'error',
                error: {
                    name: 'GateError',
                    statusCode: 400,
                    message: `server-authored ${pat} ${slot.tokens.accessToken} ${slot.tokens.refreshToken} ${unseen}`,
                },
            }),
        );
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');
    instance = `http://127.0.0.1:${address.port}`;
    const configPath = path.join(directory, '.config/lightdash/config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
        configPath,
        yaml.dump({
            user: {
                anonymousUuid: 'test',
                userUuid: slot.personUuid,
                organizationUuid: slot.organizationUuid,
            },
            context: { serverUrl: instance, apiKey: pat },
        }),
    );
    await new AgentConnectionStore(
        path.join(path.dirname(configPath), 'agent-connections.yaml'),
    ).saveSlot({ ...slot, instanceUrl: instance, resource: instance });
});
afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
    await fs.rm(directory, { recursive: true, force: true });
});
it.each(['status', 'revoke', 'connect', 'request'])(
    'captures real stdout/stderr for agent %s with a token-echoing 200 error',
    async (command) => {
        verifyConnection = command === 'request';
        const result = await run(['command', command]);
        expect(result.code).toBe(1);
        expect(calls.length).toBeGreaterThan(0);
        expect(result.stdout + result.stderr).not.toMatch(
            /server-authored|process-never-held-token|private-access|private-refresh/,
        );
        expect(result.stdout + result.stderr).not.toContain(pat);
        expect(result.stderr).toContain('status 200');
        if (command === 'request') {
            expect(calls).toHaveLength(3);
            expect(result.stderr).toContain('status 200');
        }
    },
    30_000,
);
