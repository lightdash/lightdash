#!/usr/bin/env node
/*
 * In-microVM exec agent for the Lightdash Lambda MicroVMs sandbox provider.
 *
 * Lambda MicroVMs ship no native exec SDK, so the backend's `LambdaExecChannel`
 * (packages/backend/src/ee/services/SandboxRuntime/LambdaExecChannel.ts) drives
 * this agent over the microVM's HTTPS proxy endpoint. The AWS inbound connector
 * terminates the JWE bearer (`X-aws-proxy-auth`) and forwards here on port 8080,
 * so the agent trusts inbound traffic.
 *
 * Dependency-free (Node stdlib only) — it is baked into the sandbox images via a
 * thin `FROM <ecr-image>` Dockerfile, with no npm install in the microVM build
 * env. Runs as the image's default user (root in the microVM), so it can exec
 * any tooling the image carries (git, dbt, claude, lightdash).
 *
 * It also answers Lambda's lifecycle/build hooks (the `/ready` build hook gates
 * image creation; the runtime hooks are no-ops we ack so traffic is never held).
 * AWS posts these to `/aws/lambda-microvms/runtime/v1/<hook>` on the hook port.
 *
 * Contract (kept in lock-step with LambdaExecChannel):
 *   POST /aws/lambda-microvms/runtime/v1/{ready,validate,run,resume,suspend,terminate}
 *                                -> 200 (ready gates the image build; rest are acked no-ops)
 *   GET  /ready                  -> 200 (local smoke-test convenience)
 *   POST /exec   {cmd,cwd?,envs?,timeoutMs?}
 *                                -> 200, newline-delimited JSON event stream:
 *                                   {"stream":"stdout"|"stderr","data":<base64>} chunks,
 *                                   then a terminal {"exitCode":<n>} or {"timeout":true}
 *   GET    /files?path=<abs>     -> 200 raw bytes | 404
 *   POST   /files?path=<abs>     -> 204 (writes body, creating parent dirs)
 *   DELETE /files?path=<abs>     -> 204 (idempotent)
 */

'use strict';

const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.LD_AGENT_PORT || 8080);

/** Write one newline-delimited JSON event to the response stream. */
const writeEvent = (res, event) => {
    res.write(`${JSON.stringify(event)}\n`);
};

const readBody = (req) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });

/**
 * Run a shell command, streaming demuxed stdout/stderr as base64 ndjson chunks
 * and a terminal exit/timeout event. The child runs in its own process group so
 * a timeout kills the whole tree (e.g. `dbt` spawning subprocesses).
 */
const handleExec = async (req, res) => {
    let payload;
    try {
        payload = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    } catch (error) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end(`invalid JSON body: ${error.message}`);
        return;
    }
    const { cmd, cwd, envs, timeoutMs } = payload;
    if (typeof cmd !== 'string') {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('missing "cmd"');
        return;
    }

    res.writeHead(200, { 'content-type': 'application/x-ndjson' });

    const child = spawn('/bin/sh', ['-c', cmd], {
        cwd: cwd || '/',
        env: { ...process.env, ...(envs || {}) },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    let timer = null;
    const killGroup = () => {
        try {
            process.kill(-child.pid, 'SIGKILL');
        } catch {
            // already gone
        }
    };

    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            killGroup();
            writeEvent(res, { timeout: true });
            res.end();
        }, timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
        writeEvent(res, { stream: 'stdout', data: chunk.toString('base64') });
    });
    child.stderr.on('data', (chunk) => {
        writeEvent(res, { stream: 'stderr', data: chunk.toString('base64') });
    });
    child.on('error', (error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        writeEvent(res, {
            stream: 'stderr',
            data: Buffer.from(`agent: failed to spawn: ${error.message}`).toString(
                'base64',
            ),
        });
        writeEvent(res, { exitCode: 127 });
        res.end();
    });
    child.on('close', (code, signal) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        // A signal kill with no code maps to the conventional 128+signal code.
        const exitCode =
            code === null ? 128 + (signal ? 1 : 0) : code;
        writeEvent(res, { exitCode });
        res.end();
    });

    // If the client disconnects mid-run, don't leak the child.
    res.on('close', () => {
        if (!settled) killGroup();
    });
};

const handleFiles = async (req, res, url) => {
    const filePath = url.searchParams.get('path');
    if (!filePath) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('missing "path"');
        return;
    }

    if (req.method === 'GET') {
        fs.readFile(filePath, (error, data) => {
            if (error) {
                res.writeHead(error.code === 'ENOENT' ? 404 : 500, {
                    'content-type': 'text/plain',
                });
                res.end(error.message);
                return;
            }
            res.writeHead(200, { 'content-type': 'application/octet-stream' });
            res.end(data);
        });
        return;
    }

    if (req.method === 'POST') {
        const body = await readBody(req);
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, body);
            res.writeHead(204);
            res.end();
        } catch (error) {
            res.writeHead(500, { 'content-type': 'text/plain' });
            res.end(error.message);
        }
        return;
    }

    if (req.method === 'DELETE') {
        try {
            fs.unlinkSync(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                res.writeHead(500, { 'content-type': 'text/plain' });
                res.end(error.message);
                return;
            }
        }
        res.writeHead(204);
        res.end();
        return;
    }

    res.writeHead(405, { 'content-type': 'text/plain' });
    res.end('method not allowed');
};

// Lambda posts lifecycle/build hooks here (the /ready build hook gates image
// creation; runtime hooks are acked so inbound traffic is never withheld).
const HOOK_PREFIX = '/aws/lambda-microvms/runtime/v1/';

const requestHandler = (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    // Log every request so the CloudWatch build log shows exactly what path/port
    // Lambda's lifecycle hooks hit (the hook delivery port has been buggy).
    // eslint-disable-next-line no-console
    console.log(`agent request: ${req.method} ${req.url}`);
    if (url.pathname.startsWith(HOOK_PREFIX) || url.pathname === '/ready') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
        return;
    }
    if (url.pathname === '/exec' && req.method === 'POST') {
        handleExec(req, res).catch((error) => {
            if (!res.headersSent) res.writeHead(500);
            res.end(`agent error: ${error.message}`);
        });
        return;
    }
    if (url.pathname === '/files') {
        handleFiles(req, res, url).catch((error) => {
            if (!res.headersSent) res.writeHead(500);
            res.end(`agent error: ${error.message}`);
        });
        return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
};

// Listen on the data-plane/hook port (8080) and also 9000 — lifecycle hooks have
// been observed delivering on 9000 regardless of the configured hook port, so
// answering both makes the /ready build hook robust to that quirk.
const HOOK_FALLBACK_PORT = Number(process.env.LD_AGENT_HOOK_PORT || 9000);
const listenPorts =
    HOOK_FALLBACK_PORT === PORT ? [PORT] : [PORT, HOOK_FALLBACK_PORT];
for (const port of listenPorts) {
    http.createServer(requestHandler).listen(port, '0.0.0.0', () => {
        // eslint-disable-next-line no-console
        console.log(`lightdash microvm agent listening on :${port}`);
    });
}
