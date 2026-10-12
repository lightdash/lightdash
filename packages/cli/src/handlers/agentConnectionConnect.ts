import { AGENT_CAPABILITY_DEFINITIONS } from '@lightdash/common';
import { createHash, randomBytes } from 'crypto';
import { type Response } from 'node-fetch';
import { validate as isUuid } from 'uuid';
import {
    agentConnectionApiUrl,
    createAgentConnectionFetch,
} from '../agentConnections/apiUrl';
import {
    connectionConnectInputs,
    type ConnectionConnectOptions,
} from '../agentConnections/connectInputs';
import {
    ConnectionProofError,
    exchangeInitialConnectionToken,
    unboundConnection,
} from '../agentConnections/initialToken';
import { settingsUrl } from '../agentConnections/lifecycle';
import {
    capturePersonalBootstrap,
    PersonalRecoveryError,
} from '../agentConnections/personalRecovery';
import { validateSlot } from '../agentConnections/schema';
import {
    connectionResponse,
    publicTextIsSafe,
    responseRecord,
} from '../agentConnections/statusResponse';
import { AgentConnectionStore } from '../agentConnections/store';
import { readWarehouseStatus } from '../agentConnections/warehouseStatus';
import { getConfig } from '../config';
import { refuseAgentConnection } from '../credentials';
import GlobalState from '../globalState';
import { openConnectionBrowser } from './login/connectionBrowser';
import {
    ConnectionCallbackError,
    createConnectionLoopback,
} from './login/loopback';

const couldNotStart =
    'Could not start agent connection approval. No credential was saved. Try again when the server is available.';
const existingConnection =
    'The server returned the existing agent connection instead of a new one. No credential was saved.';
const unchanged =
    'No agent connection credential was saved. Your personal CLI login is unchanged.';
class ApprovalStartError extends Error {}
const approvalAvailabilityError = (
    code: unknown,
): ApprovalStartError | null => {
    if (code === 'agent_connections_unavailable')
        return new ApprovalStartError(
            'Agent connections are not available on this server yet.',
        );
    if (code === 'agent_identity_disabled')
        return new ApprovalStartError(
            'Agent connections are disabled on this server. Ask an administrator to enable agent identity.',
        );
    return null;
};
const requestResults = async (
    response: Response,
): Promise<Record<string, unknown>> => {
    if ([404, 405].includes(response.status))
        throw new ApprovalStartError(
            'Agent connections are not available on this server yet.',
        );
    if (response.status === 401)
        throw new ApprovalStartError(
            'Your personal CLI login was rejected. Run lightdash login for this instance, then try again.',
        );
    let envelope: Record<string, unknown>;
    try {
        const value: unknown = await response.json();
        envelope = responseRecord(value);
    } catch {
        throw new ApprovalStartError(couldNotStart);
    }
    if (!response.ok) {
        const error =
            typeof envelope.error === 'object' && envelope.error !== null
                ? responseRecord(envelope.error)
                : {};
        const availabilityError = approvalAvailabilityError(error.code);
        if (availabilityError !== null) throw availabilityError;
        if (response.status === 403)
            throw new ApprovalStartError(
                'The server refused agent connection approval. Check your permissions with an administrator.',
            );
        throw new ApprovalStartError(couldNotStart);
    }
    if (envelope.status !== 'ok') throw new ApprovalStartError(couldNotStart);
    return responseRecord(envelope.results);
};
const personIdentity = (person: Record<string, unknown>) => {
    if (
        typeof person.userUuid !== 'string' ||
        !isUuid(person.userUuid) ||
        typeof person.organizationUuid !== 'string' ||
        !isUuid(person.organizationUuid) ||
        person.isServiceAccount === true
    )
        throw new ConnectionProofError();
    return {
        personUuid: person.userUuid,
        organizationUuid: person.organizationUuid,
    };
};
const proofResults = async (
    response: Response,
): Promise<Record<string, unknown>> => {
    if (!response.ok) throw new ConnectionProofError();
    const value: unknown = await response.json();
    const envelope = responseRecord(value);
    if (envelope.status !== 'ok') throw new ConnectionProofError();
    return responseRecord(envelope.results);
};
export const agentConnectionConnectHandler = async (
    options: ConnectionConnectOptions,
    dependencies: { launchBrowser: (url: string) => Promise<boolean> } = {
        launchBrowser: openConnectionBrowser,
    },
): Promise<void> => {
    refuseAgentConnection(true);
    const input = connectionConnectInputs(options);
    const deadline = Date.now() + input.timeout * 1000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeout * 1000);
    const cancel = () => controller.abort();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    let listener: Awaited<ReturnType<typeof createConnectionLoopback>> | null =
        null;
    let spinner: ReturnType<typeof GlobalState.startSpinner> | null = null;
    let countdown: ReturnType<typeof setInterval> | null = null;
    const stopWaiting = () => {
        spinner?.stop();
        if (countdown !== null) clearInterval(countdown);
        spinner = null;
        countdown = null;
    };
    let phase: 'start' | 'callback' | 'proof' | 'save' = 'start';
    let instance: string | null = null;
    let saved = false;
    const secrets: (string | null | undefined)[] = [];
    const safeText = (value: string) =>
        publicTextIsSafe(value, secrets) ? value : 'Name unavailable';
    try {
        const config = await getConfig({ readOnly: true });
        const bootstrap = capturePersonalBootstrap(config);
        instance = bootstrap.instanceUrl;
        secrets.push(...bootstrap.publicSecrets);
        const { signal } = controller;
        const person = personIdentity(
            await requestResults(
                await bootstrap.fetch({
                    method: 'GET',
                    url: '/api/v1/user',
                    body: undefined,
                    signal,
                }),
            ),
        );
        const key = { ...person, instanceUrl: instance, name: input.name };
        const store = new AgentConnectionStore();
        const previous = await store.readSlot(key);
        if (previous)
            console.error(
                `Replacing agent connection slot ${safeText(input.name)}. The old credential stays until the new approval is verified. The old connection will not be revoked.`,
            );
        const state = randomBytes(32).toString('base64url');
        const verifier = randomBytes(32).toString('base64url');
        const codeChallenge = createHash('sha256')
            .update(verifier)
            .digest('base64url');
        listener = await createConnectionLoopback({
            port: input.port,
            state,
            issuer: instance,
            signal,
        });
        const approval = await requestResults(
            await bootstrap.fetch({
                method: 'POST',
                url: '/api/v2/user/agent-connections/requests',
                signal,
                body: JSON.stringify({
                    clientId: 'lightdash-cli',
                    name: input.name,
                    projects: input.projects,
                    capabilities: input.capabilities,
                    expiresInSeconds: input.expiresInSeconds,
                    redirectUri: listener.redirectUri,
                    state,
                    codeChallenge,
                    codeChallengeMethod: 'S256',
                    resource: instance,
                }),
            }),
        );
        if (
            typeof approval.authorizationUrl !== 'string' ||
            !bootstrap.publicTextIsSafe(approval.authorizationUrl) ||
            !/^https?:\/\//.test(approval.authorizationUrl) ||
            approval.issuer !== instance ||
            approval.resource !== instance ||
            typeof approval.expiresAt !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
                approval.expiresAt,
            ) ||
            !Number.isFinite(Date.parse(approval.expiresAt)) ||
            Date.parse(approval.expiresAt) <= Date.now()
        )
            throw new ApprovalStartError(couldNotStart);
        const approvalDeadline = Date.parse(approval.expiresAt);
        const authorizationUrl = agentConnectionApiUrl(
            instance,
            approval.authorizationUrl,
        );
        const destination = new URL(authorizationUrl);
        if (
            !bootstrap.publicTextIsSafe(authorizationUrl) ||
            destination.pathname !==
                new URL(`${instance}/api/v1/oauth/authorize`).pathname ||
            destination.hash
        )
            throw new ApprovalStartError(couldNotStart);
        console.error(
            `Open this page to approve the agent connection:\n${authorizationUrl}`,
        );
        console.error('Waiting for browser approval and warehouse setup...');
        phase = 'callback';
        if (process.stderr.isTTY && !GlobalState.isNonInteractive()) {
            const waitingText = () => {
                const seconds = Math.max(
                    0,
                    Math.ceil(
                        (Math.min(deadline, approvalDeadline) - Date.now()) /
                            1000,
                    ),
                );
                return `Waiting for browser approval… (${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} remaining)`;
            };
            spinner = GlobalState.startSpinner({
                text: waitingText(),
                stream: process.stderr,
                isEnabled: true,
            });
            countdown = setInterval(() => {
                if (spinner !== null) spinner.text = waitingText();
            }, 1000);
        }
        if (!GlobalState.isNonInteractive())
            await dependencies
                .launchBrowser(authorizationUrl)
                .catch(() => false);
        const callback = await listener.result;
        stopWaiting();
        if (approvalDeadline <= Date.now()) {
            controller.abort();
            throw new Error('The approval transaction expired.');
        }
        phase = 'proof';
        const exchanged = await exchangeInitialConnectionToken({
            instanceUrl: instance,
            ...callback,
            verifier,
            redirectUri: listener.redirectUri,
            signal,
            proxyAuthorization: bootstrap.proxyAuthorization,
        });
        secrets.push(
            exchanged.tokens.accessToken,
            exchanged.tokens.refreshToken,
        );
        if (previous?.grantUuid === exchanged.grantUuid)
            throw new ConnectionProofError(existingConnection);
        const fetch = createAgentConnectionFetch(instance);
        const headers = {
            Authorization: `Bearer ${exchanged.tokens.accessToken}`,
            ...(bootstrap.proxyAuthorization === null
                ? {}
                : { 'Proxy-Authorization': bootstrap.proxyAuthorization }),
        };
        const statusResponse = await fetch(
            `/api/v2/user/agent-connections/${exchanged.grantUuid}/status`,
            { headers, signal, redirect: 'error' },
        );
        if (!statusResponse.ok) throw new ConnectionProofError();
        const statusValue: unknown = await statusResponse.json();
        const statusEnvelope = responseRecord(statusValue);
        const status = responseRecord(statusEnvelope.results);
        const grantDeadline =
            typeof status.expiresAt === 'string'
                ? Date.parse(status.expiresAt)
                : NaN;
        if (!Number.isFinite(grantDeadline)) throw new ConnectionProofError();
        const clipDeadline = (value: string) =>
            new Date(Math.min(Date.parse(value), grantDeadline)).toISOString();
        const slot = validateSlot(
            {
                ...key,
                ...exchanged,
                tokens: {
                    ...exchanged.tokens,
                    accessTokenExpiresAt: clipDeadline(
                        exchanged.tokens.accessTokenExpiresAt,
                    ),
                    refreshTokenExpiresAt:
                        exchanged.tokens.refreshTokenExpiresAt === null
                            ? null
                            : clipDeadline(
                                  exchanged.tokens.refreshTokenExpiresAt,
                              ),
                },
                clientId: 'lightdash-cli',
                resource: instance,
                approvedAt: status.approvedAt,
                grantExpiresAt: status.expiresAt,
                lastReported: {
                    checkedAt: new Date().toISOString(),
                    limitsStatus: status.limitsStatus,
                    approvedProjects: status.approvedProjects,
                    effectiveProjects: status.effectiveProjects,
                    status: status.status,
                    lastUsedAt: status.lastUsedAt,
                    revokedAt: status.revokedAt,
                },
                refreshState: { kind: 'idle' },
                revokeState: { kind: 'none' },
            },
            key,
        );
        const verified = connectionResponse(statusValue, slot, true, secrets);
        if (
            verified.lastReported.status !== 'active' ||
            verified.lastReported.limitsStatus !== 'ok' ||
            verified.lastReported.revokedAt !== null ||
            Date.parse(verified.grantExpiresAt) <= Date.now() ||
            Date.parse(verified.grantExpiresAt) >
                Date.parse(verified.approvedAt) +
                    input.expiresInSeconds * 1000 ||
            Date.parse(verified.approvedAt) > Date.now() ||
            verified.lastReported.approvedProjects.some((project) =>
                project.approvedCapabilities.some(
                    (capability) => !input.capabilities.includes(capability),
                ),
            )
        )
            throw new ConnectionProofError();
        if (input.projects !== null) {
            const requestedProjects = input.projects;
            const projectMatches = await Promise.all(
                verified.lastReported.approvedProjects.map(async (project) => {
                    if (requestedProjects.includes(project.projectUuid))
                        return project.projectUuid;
                    const details = await proofResults(
                        await fetch(`/api/v1/projects/${project.projectUuid}`, {
                            headers,
                            signal,
                            redirect: 'error',
                        }),
                    );
                    if (
                        details.projectUuid !== project.projectUuid ||
                        typeof details.slug !== 'string' ||
                        !requestedProjects.includes(details.slug)
                    )
                        throw new ConnectionProofError();
                    return details.slug;
                }),
            );
            if (new Set(projectMatches).size !== projectMatches.length)
                throw new ConnectionProofError();
        }
        const subject = personIdentity(
            await proofResults(
                await fetch('/api/v1/user', {
                    headers,
                    signal,
                    redirect: 'error',
                }),
            ),
        );
        if (
            subject.personUuid !== person.personUuid ||
            subject.organizationUuid !== person.organizationUuid ||
            signal.aborted
        )
            throw new ConnectionProofError();
        phase = 'save';
        const outcome = await store.saveSlot(verified, (current) => {
            if (signal.aborted || deadline <= Date.now())
                throw new ConnectionProofError(
                    'Agent connection approval timed out or was cancelled. No credential was saved.',
                );
            if (Date.parse(verified.grantExpiresAt) <= Date.now())
                throw new ConnectionProofError(
                    'The agent connection expired. No credential was saved.',
                );
            if (
                Date.parse(verified.tokens.accessTokenExpiresAt) <=
                    Date.now() ||
                (verified.tokens.refreshTokenExpiresAt !== null &&
                    Date.parse(verified.tokens.refreshTokenExpiresAt) <=
                        Date.now())
            )
                throw new ConnectionProofError(
                    'The agent connection token expired before it could be saved. No credential was saved.',
                );
            if (approvalDeadline <= Date.now())
                throw new ConnectionProofError(
                    'The approval transaction expired. No credential was saved.',
                );
            if (current?.grantUuid === verified.grantUuid)
                throw new ConnectionProofError(existingConnection);
        });
        saved = true;
        console.error(`Agent connection saved: ${safeText(verified.name)}`);
        if (outcome.cleanupIncomplete)
            console.error(
                `The credential was saved, but local clean-up did not finish. Run lightdash agent status --name ${safeText(verified.name)} to check it.`,
            );
        console.error(
            `Projects: ${verified.lastReported.approvedProjects.map((project) => safeText(project.name ?? 'Name unavailable')).join(', ') || 'None'}`,
        );
        const actions = [
            ...new Set(
                verified.lastReported.approvedProjects.flatMap(
                    (project) => project.approvedCapabilities,
                ),
            ),
        ];
        console.error(
            `Approved actions: ${actions.map((capability) => AGENT_CAPABILITY_DEFINITIONS[capability].name).join(', ') || 'None'}`,
        );
        console.error(`Expires: ${safeText(verified.grantExpiresAt)}`);
        const warehouse = await readWarehouseStatus(
            verified,
            async ({ url, method, signal: warehouseSignal }) =>
                fetch(url, {
                    method,
                    headers,
                    signal: AbortSignal.any([
                        signal,
                        warehouseSignal ?? signal,
                    ]),
                    redirect: 'error',
                }),
        ).catch(() => null);
        console.error(
            warehouse !== null && warehouse.state !== 'unknown'
                ? `Warehouse sign-ins: ${warehouse.state}`
                : 'Warehouse sign-ins: unknown; review them in the app.',
        );
        if (warehouse?.projects.some((project) => project.source === 'server'))
            console.error(
                'Default warehouse connection checked; review additional connections in the app.',
            );
        console.error(
            `Use: lightdash --agent-connection ${safeText(verified.name)} <command>`,
        );
        console.error(`Settings: ${safeText(settingsUrl(instance))}`);
        process.exitCode = 0;
    } catch (error) {
        stopWaiting();
        if (saved) {
            process.exitCode = 0;
            return;
        }
        let message = couldNotStart;
        const availabilityError =
            error instanceof ConnectionCallbackError
                ? approvalAvailabilityError(error.code)
                : null;
        if (availabilityError !== null) message = availabilityError.message;
        else if (
            error instanceof ApprovalStartError ||
            error instanceof PersonalRecoveryError ||
            error instanceof ConnectionProofError
        )
            message = error.message;
        else if (phase === 'proof') message = unboundConnection;
        else if (phase === 'callback')
            message = controller.signal.aborted
                ? 'Agent connection approval timed out or was cancelled. No credential was saved.'
                : 'Agent connection approval was denied. No credential was saved.';
        else if (phase === 'save')
            message =
                'Could not save the agent connection credential. Your personal CLI login is unchanged.';
        console.error(safeText(message));
        console.error(unchanged);
        if (instance !== null)
            console.error(
                `Manage warehouse agent sign-ins in the app:\n${safeText(settingsUrl(instance))}`,
            );
        process.exitCode = 1;
    } finally {
        stopWaiting();
        controller.abort();
        clearTimeout(timer);
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
        await listener?.close();
    }
};
