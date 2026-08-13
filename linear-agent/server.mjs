#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import {
    chmod,
    mkdir,
    readFile,
    readdir,
    rename,
    rm,
    writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
    branchName,
    evidenceFileName,
    extractParentIssueIdentifier,
    extractPrompt,
    githubIssueNumbersFromUrls,
    parseJson,
    pullRequestReferenceLines,
    semanticPullRequestTitle,
    sessionIdToJobId,
    sessionIdToVmName,
    shellQuote,
    validateTemplateVmName,
    validateVmName,
    verifyLinearWebhook,
} from './core.mjs';

const APP_ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = process.env.DATA_ROOT || join(APP_ROOT, 'data');
const TOKENS_FILE = join(DATA_ROOT, 'tokens.json');
const JOBS_FILE = join(DATA_ROOT, 'jobs.json');
const RUNNER_FILE = join(APP_ROOT, 'runner.sh');
const CAPTURE_FILE = join(APP_ROOT, 'capture-evidence.cjs');
const EVENT_STREAM_FILE = join(APP_ROOT, 'stream-codex-events.cjs');
const ARTIFACTS_ROOT = join(DATA_ROOT, 'artifacts');
const PUBLISH_ROOT = join(DATA_ROOT, 'publish');
const GRAPHQL_URL = 'https://api.linear.app/graphql';
const TOKEN_URL = 'https://api.linear.app/oauth/token';
const EXE_API_URL = 'https://exe.dev/exec';

function required(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const config = {
    port: Number(process.env.PORT || 8787),
    publicUrl: required('PUBLIC_URL').replace(/\/$/, ''),
    linearClientId: required('LINEAR_CLIENT_ID'),
    linearClientSecret: required('LINEAR_CLIENT_SECRET'),
    linearWebhookSecret: required('LINEAR_WEBHOOK_SECRET'),
    exeApiKey: required('EXE_API_KEY'),
    runnerBootstrapToken: process.env.EXE_RUNNER_BOOTSTRAP_TOKEN || '',
    codexApiKey: required('CODEX_API_KEY'),
    githubToken: process.env.GITHUB_TOKEN || '',
    repository: process.env.GITHUB_REPOSITORY || 'lightdash/lightdash',
    baseRef: process.env.GITHUB_BASE_REF || 'main',
    runnerTemplate: process.env.EXE_RUNNER_TEMPLATE || 'ld-linear-agent-template',
    runnerCpu: process.env.EXE_RUNNER_CPU || '4',
    runnerMemory: process.env.EXE_RUNNER_MEMORY || '16GB',
    runnerDisk: process.env.EXE_RUNNER_DISK || '25GB',
    runnerTtlSeconds: Number(process.env.EXE_RUNNER_TTL_SECONDS || 86400),
    runnerPublicPreview: process.env.EXE_RUNNER_PUBLIC_PREVIEW === 'true',
    runnerPreviewPort: Number(process.env.EXE_RUNNER_PREVIEW_PORT || 3000),
};

validateTemplateVmName(config.runnerTemplate);

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be a valid TCP port');
}
if (!Number.isInteger(config.runnerTtlSeconds) || config.runnerTtlSeconds < 60) {
    throw new Error('EXE_RUNNER_TTL_SECONDS must be at least 60');
}
if (
    !Number.isInteger(config.runnerPreviewPort) ||
    config.runnerPreviewPort < 3000 ||
    config.runnerPreviewPort > 9999
) {
    throw new Error('EXE_RUNNER_PREVIEW_PORT must be between 3000 and 9999');
}

await mkdir(DATA_ROOT, { recursive: true, mode: 0o700 });
await mkdir(ARTIFACTS_ROOT, { recursive: true, mode: 0o700 });
await mkdir(PUBLISH_ROOT, { recursive: true, mode: 0o700 });

async function loadObject(path) {
    try {
        return parseJson(await readFile(path, 'utf8'), path);
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

async function saveObject(path, value) {
    const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    try {
        await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
            mode: 0o600,
        });
        await rename(temporary, path);
        await chmod(path, 0o600);
    } finally {
        await rm(temporary, { force: true }).catch(() => {});
    }
}

async function cleanupPublishWorkspace(jobRoot) {
    await Promise.all([
        rm(join(jobRoot, 'repository'), { recursive: true, force: true }),
        rm(join(jobRoot, 'github-token'), { force: true }),
        rm(join(jobRoot, 'git-askpass.sh'), { force: true }),
    ]);
}

async function cleanupPublishWorkspaces() {
    const entries = await readdir(PUBLISH_ROOT, { withFileTypes: true });
    await Promise.all(
        entries
            .filter((entry) => entry.isDirectory() && /^[a-f0-9]{16}$/.test(entry.name))
            .map((entry) => cleanupPublishWorkspace(join(PUBLISH_ROOT, entry.name))),
    );
}

const tokens = await loadObject(TOKENS_FILE);
const jobs = await loadObject(JOBS_FILE);
const oauthStates = new Map();
const deliveries = new Map();
const runnerSource = await readFile(RUNNER_FILE, 'utf8');
const captureSource = await readFile(CAPTURE_FILE, 'utf8');
const eventStreamSource = await readFile(EVENT_STREAM_FILE, 'utf8');
const requestTimeout = 30_000;

function log(message, details = {}) {
    process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), message, ...details })}\n`);
}

async function readBody(request, maximumBytes = 10 * 1024 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > maximumBytes) throw new Error('Request body is too large');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function send(response, status, body, headers = {}) {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    response.writeHead(status, {
        'content-length': payload.length,
        'content-type': 'text/plain; charset=utf-8',
        ...headers,
    });
    response.end(payload);
}

function sendJson(response, status, value) {
    send(response, status, JSON.stringify(value), {
        'content-type': 'application/json; charset=utf-8',
    });
}

async function graphql(accessToken, query, variables = {}) {
    const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(requestTimeout),
        headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });
    const body = parseJson(await response.text(), 'Linear GraphQL response');
    if (!response.ok || body.errors?.length) {
        throw new Error(`Linear GraphQL error: ${JSON.stringify(body.errors || body)}`);
    }
    return body.data;
}

async function refreshToken(organizationId, token) {
    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(requestTimeout),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: config.linearClientId,
            client_secret: config.linearClientSecret,
            refresh_token: token.refreshToken,
        }),
    });
    const body = parseJson(await response.text(), 'Linear token response');
    if (!response.ok) throw new Error(`Linear token refresh failed: ${JSON.stringify(body)}`);
    tokens[organizationId] = {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: Date.now() + body.expires_in * 1000,
    };
    await saveObject(TOKENS_FILE, tokens);
    return tokens[organizationId].accessToken;
}

async function accessTokenFor(organizationId) {
    const token = tokens[organizationId];
    if (!token) throw new Error(`No Linear installation for workspace ${organizationId}`);
    if (Date.now() < token.expiresAt - 5 * 60 * 1000) return token.accessToken;
    return refreshToken(organizationId, token);
}

async function enrichIssueReferences(job) {
    const accessToken = await accessTokenFor(job.organizationId);
    const data = await graphql(
        accessToken,
        `query AgentIssueReferences($issueIdentifier: String!) {
            issue(id: $issueIdentifier) {
                identifier
                attachments { nodes { url } }
                parent {
                    identifier
                    attachments { nodes { url } }
                }
            }
        }`,
        { issueIdentifier: job.issueIdentifier },
    );
    const issue = data.issue;
    if (!issue) throw new Error(`Linear issue ${job.issueIdentifier} was not found`);
    const urls = (connection) => (connection?.nodes || []).map((item) => item.url);
    job.githubIssueNumbers = githubIssueNumbersFromUrls(
        urls(issue.attachments),
        config.repository,
    );
    job.parentIssueIdentifier = issue.parent?.identifier || job.parentIssueIdentifier || null;
    job.parentGithubIssueNumbers = githubIssueNumbersFromUrls(
        urls(issue.parent?.attachments),
        config.repository,
    );
    job.referencesLoadedAt = Date.now();
    await saveObject(JOBS_FILE, jobs);
}

async function emitActivity(job, content) {
    const accessToken = await accessTokenFor(job.organizationId);
    await graphql(
        accessToken,
        `mutation AgentActivityCreate($input: AgentActivityCreateInput!) {
            agentActivityCreate(input: $input) { success }
        }`,
        { input: { agentSessionId: job.sessionId, content } },
    );
}

function normalizeCodexActivity(content) {
    if (content?.type === 'thought') {
        const body = String(content.body || '').trim().slice(0, 4000);
        return body ? { type: 'thought', body } : null;
    }
    if (content?.type === 'action') {
        const action = String(content.action || '').trim().slice(0, 120);
        const parameter = String(content.parameter || '').trim().slice(0, 4000);
        const result = String(content.result || '').trim().slice(0, 4000);
        if (!action || !parameter) return null;
        return {
            type: 'action',
            action,
            parameter,
            ...(result ? { result } : {}),
        };
    }
    return null;
}

async function setExternalUrls(job, externalUrls) {
    const accessToken = await accessTokenFor(job.organizationId);
    await graphql(
        accessToken,
        `mutation AgentSessionUpdate($id: String!, $input: AgentSessionUpdateInput!) {
            agentSessionUpdate(id: $id, input: $input) { success }
        }`,
        { id: job.sessionId, input: { externalUrls } },
    );
}

function externalUrlsFor(job) {
    return [
        { label: 'Agent run', url: `${config.publicUrl}/runs/${job.id}` },
        ...(job.previewUrl
            ? [{ label: 'Lightdash preview', url: job.previewUrl }]
            : []),
        ...(job.prUrl ? [{ label: 'Pull request', url: job.prUrl }] : []),
    ];
}

async function syncExternalUrls(job) {
    await setExternalUrls(job, externalUrlsFor(job));
}

async function exeCommand(command) {
    const response = await fetch(EXE_API_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(requestTimeout),
        headers: { authorization: `Bearer ${config.exeApiKey}` },
        body: command,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`exe.dev command failed (${response.status}): ${body}`);
    if (!body) return {};
    return command === 'ls' ? parseJson(body, 'exe.dev response') : { body };
}

function runnerSetupScript(job) {
    const bootstrapUrl = `${config.publicUrl}/jobs/${job.id}/bootstrap`;
    return `#!/usr/bin/env bash\nset -euo pipefail\ncurl --fail --silent --show-error --retry 20 --retry-delay 2 -H ${shellQuote(`Authorization: Bearer ${job.callbackToken}`)} ${shellQuote(bootstrapUrl)} | bash\n`;
}

async function runnerTemplateExists() {
    const result = await exeCommand('ls');
    return (result.vms || []).some(
        (vm) => (vm.vm_name || vm.name) === config.runnerTemplate,
    );
}

async function createRunnerVm(job) {
    validateVmName(job.vmName);
    validateTemplateVmName(config.runnerTemplate);
    const retrying = job.status === 'provisioning-error';
    job.status = 'provisioning';
    await saveObject(JOBS_FILE, jobs);
    try {
        if (await runnerTemplateExists()) {
            if (!config.runnerBootstrapToken) {
                throw new Error('EXE_RUNNER_BOOTSTRAP_TOKEN is required for copied runners');
            }
            if (retrying) {
                const result = await exeCommand('ls');
                const exists = (result.vms || []).some(
                    (vm) => (vm.vm_name || vm.name) === job.vmName,
                );
                if (exists) await exeCommand(`rm ${job.vmName}`);
            }
            const command = [
                'cp',
                config.runnerTemplate,
                job.vmName,
                `--cpu=${config.runnerCpu}`,
                `--memory=${config.runnerMemory}`,
                `--disk=${config.runnerDisk}`,
                '--copy-tags=false',
            ].join(' ');
            await exeCommand(command);
            await exeCommand(`tag ${job.vmName} linear-agent-runner`);
        } else {
            const command = [
                'new',
                `--name=${job.vmName}`,
                `--cpu=${config.runnerCpu}`,
                `--memory=${config.runnerMemory}`,
                `--disk=${config.runnerDisk}`,
                '--tag=linear-agent-runner',
                '--no-email',
                `--setup-script=${shellQuote(runnerSetupScript(job))}`,
            ].join(' ');
            await exeCommand(command);
        }
    } catch (error) {
        job.status = 'provisioning-error';
        await saveObject(JOBS_FILE, jobs);
        throw error;
    }
}

async function destroyRunnerVm(job) {
    validateVmName(job.vmName);
    await exeCommand(`rm ${job.vmName}`);
    job.status = 'expired';
    await saveObject(JOBS_FILE, jobs);
}

function makeJob(payload, prompt) {
    const sessionId = payload.agentSession.id;
    const id = sessionIdToJobId(sessionId);
    return {
        id,
        sessionId,
        organizationId: payload.organizationId,
        vmName: sessionIdToVmName(sessionId),
        callbackToken: randomBytes(32).toString('hex'),
        issueIdentifier: payload.agentSession.issue?.identifier || 'linear',
        issueTitle: payload.agentSession.issue?.title || 'Linear agent task',
        parentIssueIdentifier: extractParentIssueIdentifier(payload.promptContext),
        githubIssueNumbers: [],
        parentGithubIssueNumbers: [],
        referencesLoadedAt: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + config.runnerTtlSeconds * 1000,
        status: 'pending',
        nextPromptId: 1,
        prompts: [{ id: 1, body: prompt }],
        deliveredPromptIds: [],
        prUrl: null,
        prNumber: null,
        prTitle: null,
        summary: null,
        evidence: [],
        previewUrl: null,
        previewError: null,
    };
}

async function handleAgentSessionEvent(payload) {
    const prompt = extractPrompt(payload);
    if (!payload.agentSession?.id || !payload.organizationId || !prompt) {
        throw new Error('AgentSessionEvent is missing its session, workspace, or prompt');
    }

    const id = sessionIdToJobId(payload.agentSession.id);
    if (payload.action === 'created') {
        if (jobs[id]) return;
        const job = makeJob(payload, prompt);
        jobs[id] = job;
        await saveObject(JOBS_FILE, jobs);
        await emitActivity(job, {
            type: 'thought',
            body: 'Starting an isolated exe.dev coding VM for this session.',
        });
        await syncExternalUrls(job);
        await createRunnerVm(job);
        return;
    }

    if (payload.action === 'prompted') {
        const job = jobs[id];
        if (!job) throw new Error(`No exe.dev runner for session ${payload.agentSession.id}`);
        job.nextPromptId += 1;
        job.prompts.push({ id: job.nextPromptId, body: prompt });
        job.expiresAt = Date.now() + config.runnerTtlSeconds * 1000;
        await saveObject(JOBS_FILE, jobs);
        if (['pending', 'provisioning-error'].includes(job.status)) {
            await createRunnerVm(job);
        }
    }
}

async function recoverPendingJobs() {
    for (const job of Object.values(jobs)) {
        if (
            job.expiresAt > Date.now() &&
            ['pending', 'provisioning-error'].includes(job.status)
        ) {
            try {
                await emitActivity(job, {
                    type: 'thought',
                    body: 'Retrying exe.dev runner provisioning after controller restart.',
                });
                await createRunnerVm(job);
            } catch (error) {
                log('Runner recovery failed', { jobId: job.id, error: error.message });
            }
        }
    }
}

function authorizeJob(request, job) {
    return request.headers.authorization === `Bearer ${job.callbackToken}`;
}

function bootstrapScript(job) {
    const values = {
        LINEAR_AGENT_CALLBACK_URL: config.publicUrl,
        LINEAR_AGENT_JOB_ID: job.id,
        LINEAR_AGENT_JOB_TOKEN: job.callbackToken,
        GITHUB_REPOSITORY: config.repository,
        GITHUB_BASE_REF: config.baseRef,
        EXE_RUNNER_VM_NAME: job.vmName,
        EXE_RUNNER_TTL_SECONDS: String(config.runnerTtlSeconds),
        EXE_RUNNER_PUBLIC_PREVIEW: String(config.runnerPublicPreview),
        EXE_RUNNER_PREVIEW_PORT: String(config.runnerPreviewPort),
    };
    const exports = Object.entries(values)
        .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
        .join('\n');
    return `#!/usr/bin/env bash\nset -euo pipefail\n${exports}\nmkdir -p /home/exedev/linear-agent\ncat > /home/exedev/linear-agent/capture-evidence.cjs <<'LINEAR_AGENT_EVIDENCE'\n${captureSource}\nLINEAR_AGENT_EVIDENCE\ncat > /home/exedev/linear-agent/stream-codex-events.cjs <<'LINEAR_AGENT_EVENT_STREAM'\n${eventStreamSource}\nLINEAR_AGENT_EVENT_STREAM\n${runnerSource}`;
}

async function publishRunnerPreview(job) {
    if (!config.runnerPublicPreview) return null;
    validateVmName(job.vmName);
    await exeCommand(`share port ${job.vmName} ${config.runnerPreviewPort}`);
    await exeCommand(`share set-public ${job.vmName}`);
    job.previewUrl = `https://${job.vmName}.exe.xyz`;
    job.previewError = null;
    await saveObject(JOBS_FILE, jobs);
    await syncExternalUrls(job).catch((error) => {
        log('External URL sync failed', { jobId: job.id, error: error.message });
    });
    await emitActivity(job, {
        type: 'action',
        action: 'Published Lightdash preview',
        parameter: job.previewUrl,
        result: 'Login with demo@lightdash.com / demo_password!. Public signup is disabled.',
    }).catch((error) => {
        log('Preview activity failed', { jobId: job.id, error: error.message });
    });
    return job.previewUrl;
}

async function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            ...options,
        });
        const stdout = [];
        const stderr = [];
        child.stdout?.on('data', (chunk) => stdout.push(chunk));
        child.stderr?.on('data', (chunk) => stderr.push(chunk));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve(Buffer.concat(stdout).toString('utf8'));
                return;
            }
            reject(
                new Error(
                    `${command} exited ${code}: ${Buffer.concat(stderr).toString('utf8').slice(-4000)}`,
                ),
            );
        });
    });
}

async function githubRequest(path, options = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
        ...options,
        signal: options.signal || AbortSignal.timeout(requestTimeout),
        headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${config.githubToken}`,
            'content-type': 'application/json',
            'x-github-api-version': '2022-11-28',
            ...options.headers,
        },
    });
    const text = await response.text();
    const body = text ? parseJson(text, 'GitHub response') : {};
    if (!response.ok) throw new Error(`GitHub API error (${response.status}): ${JSON.stringify(body)}`);
    return body;
}

async function persistEvidence(job, event) {
    const promptId = Number(event.promptId);
    if (!Number.isInteger(promptId) || promptId < 1) return [];
    const artifactRoot = join(ARTIFACTS_ROOT, job.id, String(promptId));
    await mkdir(artifactRoot, { recursive: true, mode: 0o700 });
    const stored = [];
    const items = Array.isArray(event.evidence) ? event.evidence : [];
    for (const [index, item] of items.slice(0, 3).entries()) {
        if (item.mimeType !== 'image/jpeg' || typeof item.dataBase64 !== 'string') continue;
        if (item.dataBase64.length > 3 * 1024 * 1024) continue;
        const image = Buffer.from(item.dataBase64, 'base64');
        if (
            image.length > 2 * 1024 * 1024 ||
            image.length < 3 ||
            image[0] !== 0xff ||
            image[1] !== 0xd8 ||
            image[2] !== 0xff
        ) {
            continue;
        }
        const fileName = evidenceFileName(`${index + 1}-${item.name}`, index + 1);
        await writeFile(join(artifactRoot, fileName), image, { mode: 0o600 });
        stored.push({
            description: String(item.description || item.name || `Screenshot ${index + 1}`)
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 300),
            url: `${config.publicUrl}/artifacts/${job.id}/${promptId}/${fileName}`,
        });
    }
    return stored;
}

function pullRequestBody(job, event, evidence) {
    const summary = String(event.summary || 'Implementation complete.')
        .trim()
        .slice(0, 3000);
    const sections = [
        `## What changed\n\n${summary}`,
    ];
    if (evidence.length) {
        const images = evidence.map((item) => {
            const description = item.description.replace(/[\[\]]/g, '');
            return `![${description}](${item.url})\n\n_${description}_`;
        });
        sections.push(`## Visual evidence\n\n${images.join('\n\n')}`);
    } else {
        const detail = event.evidenceError
            ? ' The automated capture step failed.'
            : '';
        sections.push(`## Visual evidence\n\n_No screenshot was captured.${detail}_`);
    }
    if (job.previewUrl) {
        sections.push(
            `## Preview\n\n[Open the Lightdash preview](${job.previewUrl})\n\n` +
            'Login: `demo@lightdash.com` / `demo_password!`',
        );
    }
    sections.push(
        `## References\n\n${pullRequestReferenceLines({
            linearIssueIdentifier: job.issueIdentifier,
            githubIssueNumbers: job.githubIssueNumbers,
            parentGithubIssueNumbers: job.parentGithubIssueNumbers,
            parentIssueIdentifier: job.parentIssueIdentifier,
        }).join('\n')}`,
        '> Generated by the Lightdash Linear agent. Review and test all changes before merging.',
    );
    return sections.join('\n\n');
}

function linearResponseBody(job, event, evidence, prUrl, previewUrl) {
    const response = String(event.body || event.summary || 'Implementation complete.').trim();
    const sections = [/^#{1,6}\s/m.test(response) ? response : `## Result\n\n${response}`];
    if (evidence.length) {
        sections.push(`## Visual evidence\n\n${evidence.map((item) => {
            const description = item.description.replace(/[\[\]]/g, '');
            return `![${description}](${item.url})\n\n_${description}_`;
        }).join('\n\n')}`);
    } else if (event.evidenceError) {
        sections.push(
            `## Visual evidence\n\n> Screenshot capture failed: ${String(event.evidenceError).trim().slice(0, 1000)}`,
        );
    }
    const links = [];
    if (prUrl) links.push(`- [Review the draft pull request](${prUrl})`);
    if (previewUrl) {
        links.push(
            `- [Open the Lightdash preview](${previewUrl})`,
            '- Login: `demo@lightdash.com` / `demo_password!`',
        );
    } else if (job.previewError) {
        links.push(`- Preview failed: ${job.previewError.slice(0, 1000)}`);
    }
    if (links.length) sections.push(`## Links\n\n${links.join('\n')}`);
    return sections.join('\n\n');
}

async function publishPatch(job, event, evidence) {
    const patch = Buffer.from(event.patchBase64 || '', 'base64');
    const jobRoot = join(PUBLISH_ROOT, job.id);
    await mkdir(jobRoot, { recursive: true, mode: 0o700 });
    await cleanupPublishWorkspace(jobRoot);
    await writeFile(join(jobRoot, 'change.patch'), patch, { mode: 0o600 });
    if (!patch.length || !config.githubToken) return null;

    await enrichIssueReferences(job).catch((error) => {
        log('Linear issue reference lookup failed', { jobId: job.id, error: error.message });
    });
    const prTitle = semanticPullRequestTitle(event.prTitle, 'implement Linear request');
    const prBody = pullRequestBody(job, event, evidence);

    try {
        const checkout = join(jobRoot, 'repository');
        await run('git', ['clone', '--quiet', '--no-checkout', `https://github.com/${config.repository}.git`, checkout]);
        await run('git', ['checkout', '--quiet', '--detach', event.baseCommit], { cwd: checkout });
        await run('git', ['apply', '--binary', join(jobRoot, 'change.patch')], { cwd: checkout });
        await run('git', ['add', '--all'], { cwd: checkout });

        const branch = branchName(job.issueIdentifier, job.id);
        await run('git', ['checkout', '--quiet', '-B', branch], { cwd: checkout });
        await run('git', ['-c', 'user.name=Lightdash Linear Agent', '-c', 'user.email=linear-agent@lightdash.com', 'commit', '--quiet', '-m', prTitle], { cwd: checkout });

        const tokenFile = join(jobRoot, 'github-token');
        const askpassFile = join(jobRoot, 'git-askpass.sh');
        await writeFile(tokenFile, `${config.githubToken}\n`, { mode: 0o600 });
        await writeFile(
            askpassFile,
            `#!/bin/sh\ncase "$1" in *Username*) echo x-access-token ;; *) cat ${shellQuote(tokenFile)} ;; esac\n`,
            { mode: 0o700 },
        );
        await run(
            'git',
            ['push', '--force', `https://github.com/${config.repository}.git`, `HEAD:refs/heads/${branch}`],
            {
                cwd: checkout,
                env: {
                    ...process.env,
                    GIT_ASKPASS: askpassFile,
                    GIT_TERMINAL_PROMPT: '0',
                },
            },
        );

        if (!job.prUrl) {
            const pull = await githubRequest(`/repos/${config.repository}/pulls`, {
                method: 'POST',
                body: JSON.stringify({
                    title: prTitle,
                    head: branch,
                    base: config.baseRef,
                    body: prBody,
                    draft: true,
                }),
            });
            job.prUrl = pull.html_url;
            job.prNumber = pull.number;
            job.prTitle = prTitle;
            await saveObject(JOBS_FILE, jobs);
            await syncExternalUrls(job).catch((error) => {
                log('External URL sync failed', { jobId: job.id, error: error.message });
            });
        } else {
            const prNumber = job.prNumber || Number(job.prUrl.match(/\/pull\/(\d+)$/)?.[1]);
            if (!Number.isInteger(prNumber) || prNumber < 1) {
                throw new Error(`Could not determine pull request number from ${job.prUrl}`);
            }
            await githubRequest(`/repos/${config.repository}/pulls/${prNumber}`, {
                method: 'PATCH',
                body: JSON.stringify({ title: prTitle, body: prBody }),
            });
            job.prNumber = prNumber;
            job.prTitle = prTitle;
            await saveObject(JOBS_FILE, jobs);
        }
        return job.prUrl;
    } finally {
        await cleanupPublishWorkspace(jobRoot).catch((error) => {
            log('Publish workspace cleanup failed', { jobId: job.id, error: error.message });
        });
    }
}

async function handleRunnerEvent(job, event) {
    if (event.type === 'codex-activity') {
        const content = normalizeCodexActivity(event.content);
        if (content) await emitActivity(job, content);
        return;
    }
    if (event.type === 'ready') {
        job.status = 'ready';
        await saveObject(JOBS_FILE, jobs);
        await emitActivity(job, {
            type: 'action',
            action: 'Provisioned exe.dev VM',
            parameter: job.vmName,
            result: 'Repository cloned and Codex is ready.',
        });
        return;
    }
    if (event.type === 'started') {
        job.status = 'running';
        await saveObject(JOBS_FILE, jobs);
        await emitActivity(job, {
            type: 'thought',
            body: 'Codex is implementing and validating the requested change.',
        });
        return;
    }
    if (event.type === 'preview-started') {
        job.status = 'starting-preview';
        await saveObject(JOBS_FILE, jobs);
        await emitActivity(job, {
            type: 'thought',
            body: 'Starting Lightdash and preparing a public preview.',
        });
        return;
    }
    if (event.type === 'evidence-started') {
        job.status = 'capturing-evidence';
        await saveObject(JOBS_FILE, jobs);
        await emitActivity(job, {
            type: 'thought',
            body: event.body || 'Capturing visual evidence for the draft pull request.',
        });
        return;
    }
    if (event.type === 'error') {
        job.status = 'error';
        await saveObject(JOBS_FILE, jobs);
        await emitActivity(job, { type: 'error', body: event.body || 'Runner failed.' });
        return;
    }
    if (event.type === 'result') {
        const evidence = await persistEvidence(job, event);
        job.evidence = evidence;
        job.summary = String(event.summary || event.body || 'Implementation complete.')
            .trim()
            .slice(0, 3000);
        let previewUrl = null;
        if (event.previewReady) {
            try {
                previewUrl = await publishRunnerPreview(job);
            } catch (error) {
                job.previewError = error.message;
                await saveObject(JOBS_FILE, jobs);
                log('Preview publishing failed', { jobId: job.id, error: error.message });
            }
        } else if (event.previewError) {
            job.previewError = event.previewError;
            await saveObject(JOBS_FILE, jobs);
        }
        const prUrl = await publishPatch(job, event, evidence);
        job.status = 'complete';
        await saveObject(JOBS_FILE, jobs);
        if (!prUrl && !config.githubToken) {
            event.body = `${event.body || 'Implementation complete.'}\n\n> No GitHub token is configured; the patch is retained by the controller.`;
        }
        await emitActivity(job, {
            type: 'response',
            body: linearResponseBody(job, event, evidence, prUrl, previewUrl),
        });
    }
}

async function handleOAuthCallback(requestUrl, response) {
    const error = requestUrl.searchParams.get('error');
    if (error) return send(response, 400, `Linear OAuth error: ${error}`);
    const state = requestUrl.searchParams.get('state');
    const expiresAt = oauthStates.get(state);
    oauthStates.delete(state);
    if (!state || !expiresAt || expiresAt < Date.now()) return send(response, 400, 'Invalid OAuth state');
    const code = requestUrl.searchParams.get('code');
    if (!code) return send(response, 400, 'Missing OAuth code');

    const tokenResponse = await fetch(TOKEN_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(requestTimeout),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.linearClientId,
            client_secret: config.linearClientSecret,
            redirect_uri: `${config.publicUrl}/oauth/callback`,
            code,
        }),
    });
    const tokenBody = parseJson(await tokenResponse.text(), 'Linear token response');
    if (!tokenResponse.ok) return send(response, 400, `Token exchange failed: ${JSON.stringify(tokenBody)}`);

    const workspace = await graphql(
        tokenBody.access_token,
        'query Workspace { viewer { organization { id name } } }',
    );
    const organization = workspace.viewer.organization;
    tokens[organization.id] = {
        accessToken: tokenBody.access_token,
        refreshToken: tokenBody.refresh_token,
        expiresAt: Date.now() + tokenBody.expires_in * 1000,
    };
    await saveObject(TOKENS_FILE, tokens);
    send(response, 200, `Installed Linear agent for ${organization.name}.`);
}

function renderRun(job) {
    const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(job.issueIdentifier)}</title></head><body><main><h1>${escape(job.issueIdentifier)}: ${escape(job.issueTitle)}</h1><dl><dt>Status</dt><dd>${escape(job.status)}</dd><dt>Runner</dt><dd>${escape(job.vmName)}</dd><dt>Expires</dt><dd>${escape(new Date(job.expiresAt).toISOString())}</dd>${job.previewUrl ? `<dt>Preview</dt><dd><a href="${escape(job.previewUrl)}">${escape(job.previewUrl)}</a> — demo@lightdash.com / demo_password!</dd>` : ''}${job.previewError ? `<dt>Preview error</dt><dd>${escape(job.previewError)}</dd>` : ''}${job.prUrl ? `<dt>Pull request</dt><dd><a href="${escape(job.prUrl)}">${escape(job.prUrl)}</a></dd>` : ''}</dl></main></body></html>`;
}

async function route(request, response) {
    const url = new URL(request.url, config.publicUrl);
    if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && url.pathname === '/oauth/authorize') {
        const state = randomBytes(24).toString('hex');
        oauthStates.set(state, Date.now() + 10 * 60 * 1000);
        const authorize = new URL('https://linear.app/oauth/authorize');
        authorize.search = new URLSearchParams({
            client_id: config.linearClientId,
            redirect_uri: `${config.publicUrl}/oauth/callback`,
            response_type: 'code',
            scope: 'read,write,app:assignable,app:mentionable',
            actor: 'app',
            state,
        });
        return send(response, 302, '', { location: authorize.toString() });
    }
    if (request.method === 'GET' && url.pathname === '/oauth/callback') {
        return handleOAuthCallback(url, response);
    }
    if (request.method === 'POST' && url.pathname === '/webhooks/linear') {
        const rawBody = await readBody(request, 2 * 1024 * 1024);
        const verified = verifyLinearWebhook({
            body: rawBody,
            signature: request.headers['linear-signature'],
            timestamp: request.headers['linear-timestamp'],
            secret: config.linearWebhookSecret,
        });
        if (!verified) return send(response, 401, 'Invalid webhook signature');
        const delivery = request.headers['linear-delivery'];
        if (delivery && deliveries.has(delivery)) return send(response, 200, 'Duplicate ignored');
        if (delivery) deliveries.set(delivery, Date.now());
        const payload = parseJson(rawBody.toString('utf8'), 'Linear webhook');
        send(response, 200, 'Accepted');
        setImmediate(() => {
            if (payload.type !== 'AgentSessionEvent') return;
            handleAgentSessionEvent(payload).catch(async (error) => {
                log('Agent session event failed', { error: error.message });
                const job = payload.agentSession?.id
                    ? jobs[sessionIdToJobId(payload.agentSession.id)]
                    : null;
                if (job) await emitActivity(job, { type: 'error', body: error.message }).catch(() => {});
            });
        });
        return;
    }

    const bootstrapMatch = url.pathname.match(/^\/jobs\/([a-f0-9]{16})\/bootstrap$/);
    if (request.method === 'GET' && bootstrapMatch) {
        const job = jobs[bootstrapMatch[1]];
        if (!job || !authorizeJob(request, job)) return send(response, 401, 'Unauthorized');
        return send(response, 200, bootstrapScript(job), { 'content-type': 'text/x-shellscript' });
    }

    const copiedRunnerMatch = url.pathname.match(/^\/runner-bootstrap\/(ldlin-[a-f0-9]{12})$/);
    if (request.method === 'GET' && copiedRunnerMatch) {
        if (
            !config.runnerBootstrapToken ||
            request.headers.authorization !== `Bearer ${config.runnerBootstrapToken}`
        ) {
            return send(response, 401, 'Unauthorized');
        }
        const job = Object.values(jobs).find((candidate) => candidate.vmName === copiedRunnerMatch[1]);
        if (!job || job.status !== 'provisioning') return send(response, 404, 'Runner not found');
        return send(response, 200, bootstrapScript(job), { 'content-type': 'text/x-shellscript' });
    }

    const codexKeyMatch = url.pathname.match(/^\/jobs\/([a-f0-9]{16})\/codex-key$/);
    if (request.method === 'GET' && codexKeyMatch) {
        const job = jobs[codexKeyMatch[1]];
        if (!job || !authorizeJob(request, job)) return send(response, 401, 'Unauthorized');
        return send(response, 200, config.codexApiKey, {
            'cache-control': 'no-store',
        });
    }

    const nextMatch = url.pathname.match(/^\/jobs\/([a-f0-9]{16})\/next$/);
    if (request.method === 'GET' && nextMatch) {
        const job = jobs[nextMatch[1]];
        if (!job || !authorizeJob(request, job)) return send(response, 401, 'Unauthorized');
        const prompt = job.prompts.find((item) => !job.deliveredPromptIds.includes(item.id));
        if (!prompt) return send(response, 204, '');
        job.deliveredPromptIds.push(prompt.id);
        await saveObject(JOBS_FILE, jobs);
        return send(response, 200, prompt.body, { 'x-prompt-id': String(prompt.id) });
    }

    const eventMatch = url.pathname.match(/^\/jobs\/([a-f0-9]{16})\/events$/);
    if (request.method === 'POST' && eventMatch) {
        const job = jobs[eventMatch[1]];
        if (!job || !authorizeJob(request, job)) return send(response, 401, 'Unauthorized');
        const event = parseJson((await readBody(request)).toString('utf8'), 'runner event');
        send(response, 202, 'Accepted');
        setImmediate(() => handleRunnerEvent(job, event).catch((error) => {
            log('Runner event failed', { jobId: job.id, error: error.message });
            emitActivity(job, { type: 'error', body: error.message }).catch(() => {});
        }));
        return;
    }

    const artifactMatch = url.pathname.match(
        /^\/artifacts\/([a-f0-9]{16})\/([1-9][0-9]*)\/([a-z0-9-]+\.jpg)$/,
    );
    if (request.method === 'GET' && artifactMatch) {
        const [, jobId, promptId, fileName] = artifactMatch;
        if (!jobs[jobId]) return send(response, 404, 'Artifact not found');
        try {
            const image = await readFile(join(ARTIFACTS_ROOT, jobId, promptId, fileName));
            return send(response, 200, image, {
                'cache-control': 'public, max-age=86400',
                'content-type': 'image/jpeg',
                'x-content-type-options': 'nosniff',
            });
        } catch (error) {
            if (error.code === 'ENOENT') return send(response, 404, 'Artifact not found');
            throw error;
        }
    }

    const runMatch = url.pathname.match(/^\/runs\/([a-f0-9]{16})$/);
    if (request.method === 'GET' && runMatch) {
        const job = jobs[runMatch[1]];
        if (!job) return send(response, 404, 'Run not found');
        return send(response, 200, renderRun(job), { 'content-type': 'text/html; charset=utf-8' });
    }
    send(response, 404, 'Not found');
}

setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [delivery, createdAt] of deliveries) {
        if (createdAt < cutoff) deliveries.delete(delivery);
    }
    for (const job of Object.values(jobs)) {
        if (job.expiresAt <= Date.now() && !['expired', 'deleting'].includes(job.status)) {
            job.status = 'deleting';
            saveObject(JOBS_FILE, jobs)
                .then(() => destroyRunnerVm(job))
                .catch(async (error) => {
                    job.status = 'cleanup-error';
                    await saveObject(JOBS_FILE, jobs);
                    log('Runner cleanup failed', { jobId: job.id, error: error.message });
                });
        }
    }
}, 60_000).unref();

const server = createServer((request, response) => {
    route(request, response).catch((error) => {
        log('Request failed', { path: request.url, error: error.message });
        if (!response.headersSent) send(response, 500, 'Internal server error');
        else response.end();
    });
});

server.listen(config.port, '0.0.0.0', () => {
    log('Linear exe.dev agent listening', { port: config.port, publicUrl: config.publicUrl });
    setImmediate(() => {
        cleanupPublishWorkspaces()
            .catch((error) => log('Publish workspace cleanup failed', { error: error.message }))
            .then(() => recoverPendingJobs());
    });
});
