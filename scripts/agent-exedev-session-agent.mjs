#!/usr/bin/env node
// VM-side session agent for the agent exe.dev HTTPS transport.
//
// exe.dev forwards a single VM port to the public 443 endpoint, and the agent
// client (Claude's cloud container) can reach the VM over that 443 endpoint
// only — non-443 ports and raw SSH are blocked. So this process is the VM's
// front door: it serves its own `/__agent/*` control endpoints and reverse
// proxies everything else — including Vite HMR WebSockets — to the preview app.
//
// Transport is HTTPS end to end; no SSH. See docs/agent-exedev.md.
//
// Endpoints (all under /__agent, authorized):
//   GET  /__agent/health          liveness + resolved app port (unauthorized)
//   POST /__agent/exec            run a command; see handleExec
//   ALL  /__agent/git/<repo>/...  git smart-HTTP backend (enables `git push`)
// Everything else is reverse proxied to the preview app.
//
// Config (environment):
//   LD_AGENT_PORT      port this server listens on; exe.dev maps 443 here (default 8090)
//   LD_AGENT_SECRET    shared secret required on `/__agent/*` requests
//   LD_AGENT_REPO      repository checkout served for git + used as default cwd
//   LD_AGENT_APP_PORT  preview app port to proxy to; overrides FE_PORT discovery
//   LD_AGENT_ALLOW_UID exe.dev user id allowed via proxy-injected header (optional)
//
// Zero dependencies: Node core only.

import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.LD_AGENT_PORT || 8090);
const SECRET = process.env.LD_AGENT_SECRET || '';
const REPO = process.env.LD_AGENT_REPO || '/opt/linear-agent-template/repository';
const ALLOW_UID = process.env.LD_AGENT_ALLOW_UID || '';
const APP_PORT_OVERRIDE = process.env.LD_AGENT_APP_PORT ? Number(process.env.LD_AGENT_APP_PORT) : null;
const ENV_FILE = path.join(REPO, '.env.development.local');
const EXIT_MARKER = '__LD_AGENT_EXIT__:'; // trailer the exec stream ends with

// Resolve the preview app port lazily so the agent can start before the
// bootstrap has claimed ports. Cache on the env file's mtime.
let appPortCache = { mtimeMs: 0, port: 3000 };
function appPort() {
    if (APP_PORT_OVERRIDE) return APP_PORT_OVERRIDE;
    try {
        const { mtimeMs } = statSync(ENV_FILE);
        if (mtimeMs !== appPortCache.mtimeMs) {
            const match = readFileSync(ENV_FILE, 'utf8').match(/^FE_PORT=(\d+)/m);
            appPortCache = { mtimeMs, port: match ? Number(match[1]) : 3000 };
        }
    } catch {
        /* env file not written yet; keep last known / default */
    }
    return appPortCache.port;
}

// A request is authorized when it carries the shared secret, or when exe.dev's
// proxy injected a verified user id (only possible for a private port reached
// with a valid exe.dev token). The secret path is what works once the port is
// public, where the proxy injects nothing.
function authorized(req) {
    if (SECRET && req.headers['x-ld-agent-secret'] === SECRET) return true;
    const uid = req.headers['x-exedev-userid'];
    if (uid && (!ALLOW_UID || uid === ALLOW_UID)) return true;
    return false;
}

function sendJson(res, code, body) {
    const text = JSON.stringify(body);
    res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
}

// POST /__agent/exec — run a shell command. The command is base64 in the
// `x-agent-cmd` header (base64 avoids header-encoding limits and keeps
// newlines/quotes intact); the request body, if any, is piped to the process
// stdin, so `git apply`, `tar -x`, and `rm` all reuse this one primitive.
// Output (stdout+stderr interleaved) streams back as it is produced and ends
// with `\n__LD_AGENT_EXIT__:<code>\n` so the client learns the exit status
// without a second request. Query: `?cwd=` and `?timeout=` (seconds).
function handleExec(req, res, url) {
    const encoded = req.headers['x-agent-cmd'];
    if (!encoded) return sendJson(res, 400, { error: 'missing x-agent-cmd' });
    let cmd;
    try {
        cmd = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
        return sendJson(res, 400, { error: 'bad x-agent-cmd encoding' });
    }
    const cwd = url.searchParams.get('cwd') || REPO;
    const timeoutSec = Number(url.searchParams.get('timeout') || 3600);

    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    const child = spawn('bash', ['-lc', cmd], { cwd });
    const killer = setTimeout(() => child.kill('SIGKILL'), timeoutSec * 1000);
    child.stdout.on('data', (d) => res.write(d));
    child.stderr.on('data', (d) => res.write(d));
    child.on('error', (err) => {
        clearTimeout(killer);
        res.end(`\n${EXIT_MARKER}127 (${err.message})\n`);
    });
    child.on('close', (code, signal) => {
        clearTimeout(killer);
        res.end(`\n${EXIT_MARKER}${code === null ? `signal:${signal}` : code}\n`);
    });
    req.on('aborted', () => child.kill('SIGKILL'));
    req.pipe(child.stdin);
    child.stdin.on('error', () => {}); // ignore EPIPE when a command reads no stdin
}

// /__agent/git/<repo>/... — git's smart HTTP backend as CGI, so the client can
// `git push https://<vm>/__agent/git/<repo>`, preserving the delta-push model
// the SSH transport used.
function handleGit(req, res, url) {
    const env = {
        ...process.env,
        GIT_PROJECT_ROOT: path.dirname(REPO),
        GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: url.pathname.slice('/__agent/git'.length) || '/',
        REQUEST_METHOD: req.method,
        QUERY_STRING: url.search.replace(/^\?/, ''),
        CONTENT_TYPE: req.headers['content-type'] || '',
        REMOTE_USER: req.headers['x-exedev-userid'] || 'agent',
    };
    const cgi = spawn('git', ['http-backend'], { env });
    req.pipe(cgi.stdin);
    cgi.stdin.on('error', () => {});

    // Parse the CGI header block, then stream the body straight through.
    let head = Buffer.alloc(0);
    let headersSent = false;
    cgi.stdout.on('data', (chunk) => {
        if (headersSent) return res.write(chunk);
        head = Buffer.concat([head, chunk]);
        const sep = head.indexOf('\r\n\r\n');
        if (sep === -1) return;
        let status = 200;
        const headers = {};
        for (const line of head.slice(0, sep).toString('utf8').split('\r\n')) {
            const idx = line.indexOf(':');
            if (idx === -1) continue;
            const key = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            if (key.toLowerCase() === 'status') status = parseInt(value, 10) || 200;
            else headers[key] = value;
        }
        res.writeHead(status, headers);
        headersSent = true;
        const rest = head.slice(sep + 4);
        if (rest.length) res.write(rest);
    });
    cgi.stderr.on('data', (d) => process.stderr.write(d));
    const finish = () => {
        if (!headersSent) res.writeHead(500);
        res.end();
    };
    cgi.on('close', finish);
    cgi.on('error', finish);
}

// Reverse proxy any non-agent request to the preview app.
function proxyToApp(req, res) {
    const proxyReq = http.request(
        { host: '127.0.0.1', port: appPort(), method: req.method, path: req.url, headers: req.headers },
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
        },
    );
    proxyReq.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('preview app not ready');
    });
    req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
    let url;
    try {
        url = new URL(req.url, 'http://localhost');
    } catch {
        return sendJson(res, 400, { error: 'bad url' });
    }

    if (url.pathname === '/__agent/health') return sendJson(res, 200, { ok: true, appPort: appPort() });
    if (url.pathname.startsWith('/__agent/')) {
        if (!authorized(req)) return sendJson(res, 401, { error: 'unauthorized' });
        if (url.pathname === '/__agent/exec' && req.method === 'POST') return handleExec(req, res, url);
        if (url.pathname.startsWith('/__agent/git')) return handleGit(req, res, url);
        return sendJson(res, 404, { error: 'unknown agent route' });
    }
    return proxyToApp(req, res);
});

// WebSocket / Upgrade passthrough (Vite HMR). Agent paths never upgrade.
server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/__agent/')) return socket.destroy();
    const upstream = net.connect(appPort(), '127.0.0.1', () => {
        upstream.write(
            `${req.method} ${req.url} HTTP/1.1\r\n` +
                Object.entries(req.headers)
                    .map(([k, v]) => `${k}: ${v}\r\n`)
                    .join('') +
                '\r\n',
        );
        if (head && head.length) upstream.write(head);
        socket.pipe(upstream);
        upstream.pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
});

server.listen(PORT, '0.0.0.0', () => {
    process.stdout.write(`session-agent listening on :${PORT} (app -> :${appPort()})\n`);
});
