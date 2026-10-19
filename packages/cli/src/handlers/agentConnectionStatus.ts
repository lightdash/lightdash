import { AgentCapability, getAgentCapabilityName } from '@lightdash/common';
import {
    AgentConnectionRequestError,
    connectionKey,
    sameGeneration,
    selectLifecycleSlot,
    settingsUrl,
} from '../agentConnections/lifecycle';
import { type AgentConnectionSlot } from '../agentConnections/schema';
import {
    checkConnectionErrorEnvelope,
    ConnectionServerError,
} from '../agentConnections/serverError';
import {
    ConnectionMismatchError,
    connectionResponse,
    publicConnectionReport,
    statusReasonMessage,
} from '../agentConnections/statusResponse';
import { AgentConnectionStore } from '../agentConnections/store';
import {
    readWarehouseStatus,
    type WarehouseStatus,
} from '../agentConnections/warehouseStatus';
import { getConfig } from '../config';
import {
    humanCredential,
    runWithAgentConnectionSelection,
} from '../credentials';
import { type AgentOptions } from './agentAccess';
import { lightdashRawApi } from './dbt/apiClient';

export type ConnectionStatusOptions = AgentOptions & {
    name?: string;
    json?: boolean;
};
type ConnectionState =
    | 'missing'
    | 'active'
    | 'expired'
    | 'revoked'
    | 'invalid'
    | 'mismatched'
    | 'reconnect_required'
    | 'unreachable'
    | 'rejected';
const localState = (slot: AgentConnectionSlot): ConnectionState | null => {
    if (
        slot.lastReported.status === 'revoked' ||
        slot.lastReported.revokedAt !== null
    )
        return 'revoked';
    if (
        Date.parse(slot.grantExpiresAt) <= Date.now() ||
        slot.lastReported.status === 'expired'
    )
        return 'expired';
    if (slot.lastReported.limitsStatus === 'invalid') return 'invalid';
    if (slot.refreshState.kind !== 'idle' || slot.revokeState.kind !== 'none')
        return 'reconnect_required';
    return null;
};
const messages: Record<Exclude<ConnectionState, 'active'>, string> = {
    missing: 'No agent connection credential. Run lightdash agent connect.',
    expired: 'This connection expired.',
    revoked: 'This connection was revoked.',
    invalid: 'Connection limits are invalid. Reconnect before using this slot.',
    mismatched:
        'This agent connection does not match this instance, organisation and person. No personal credential was used.',
    reconnect_required:
        'The connection refresh or revocation was not confirmed. Reconnect before using this slot.',
    unreachable:
        'Could not reach the server. Connection status is unconfirmed.',
    rejected:
        'The server rejected this connection credential. Reconnect or check its status in the app.',
};
export const agentConnectionStatusHandler = async (
    options: ConnectionStatusOptions,
): Promise<void> => {
    const selection = selectLifecycleSlot(options.name);
    return runWithAgentConnectionSelection(selection, async () => {
        const config = await getConfig({ readOnly: true });
        const key = connectionKey(config, selection);
        const store = new AgentConnectionStore();
        let slot: AgentConnectionSlot | null = null;
        let state: ConnectionState = key === null ? 'mismatched' : 'missing';
        let source: 'server' | 'local' = 'local';
        let warehouse: WarehouseStatus = { state: 'unknown', projects: [] };
        let error: string | null = null;
        try {
            slot = key === null ? null : await store.readSlot(key);
            if (slot !== null) {
                const local = localState(slot);
                state = local ?? 'active';
                if (local === null) {
                    const response = await lightdashRawApi({
                        method: 'GET',
                        url: `/api/v2/user/agent-connections/${slot.grantUuid}/status`,
                        body: undefined,
                        safeToRetry: true,
                        signal: AbortSignal.timeout(15_000),
                        lifecycle: {
                            kind: 'status',
                            grantUuid: slot.grantUuid,
                            generation: slot.tokens.generation,
                        },
                    });
                    const value: unknown = await response.json();
                    checkConnectionErrorEnvelope(response.status, value);
                    const requestedSlot = slot;
                    const latest = await store.readSlot(slot);
                    if (!latest || latest.grantUuid !== slot.grantUuid)
                        throw new Error('The local connection changed.');
                    const checked = connectionResponse(value, latest, true);
                    await store.withLock(async (locked) => {
                        const current = await locked.readSlot(checked);
                        if (
                            !sameGeneration(current, checked) ||
                            current.revokeState.kind !==
                                requestedSlot.revokeState.kind
                        )
                            throw new Error('The local connection changed.');
                        await locked.saveSlot({
                            ...current,
                            lastReported: checked.lastReported,
                        });
                    });
                    slot = checked;
                    source = 'server';
                    state =
                        checked.lastReported.limitsStatus === 'invalid'
                            ? 'invalid'
                            : checked.lastReported.status;
                    if (state === 'active')
                        warehouse = await readWarehouseStatus(checked);
                }
            }
        } catch (failure) {
            state = 'invalid';
            if (failure instanceof AgentConnectionRequestError)
                state = failure.state;
            else if (failure instanceof ConnectionMismatchError)
                state = 'mismatched';
            if (failure instanceof ConnectionServerError)
                error = `Connection status is unconfirmed. ${failure.message}`;
            else if (state === 'invalid')
                error =
                    slot === null
                        ? 'Invalid agent connection data. Reconnect before using this slot.'
                        : 'The server returned invalid connection data. Connection status is unconfirmed.';
            if (slot !== null) {
                const latest = await store.readSlot(slot).catch(() => null);
                if (
                    latest &&
                    sameGeneration(latest, slot) &&
                    localState(latest) === 'reconnect_required'
                ) {
                    slot = latest;
                    state = 'reconnect_required';
                    error = messages.reconnect_required;
                }
            }
        }
        if (state !== 'active') error ??= messages[state];
        const reported = slot === null ? null : publicConnectionReport(slot);
        let revokeState: AgentConnectionSlot['revokeState'] | null = null;
        if (slot !== null)
            revokeState =
                slot.revokeState.kind === 'none'
                    ? { kind: 'none' }
                    : {
                          kind: 'unconfirmed',
                          attemptedAt: slot.revokeState.attemptedAt,
                      };
        const result = {
            version: 1,
            slot: selection,
            instanceUrl:
                slot?.instanceUrl ??
                key?.instanceUrl ??
                config.context?.serverUrl ??
                null,
            personUuid: slot?.personUuid ?? key?.personUuid ?? null,
            organizationUuid:
                slot?.organizationUuid ?? key?.organizationUuid ?? null,
            grantUuid: slot?.grantUuid ?? null,
            clientId: slot?.clientId ?? null,
            connectionState: state,
            connectionValid: source === 'server' ? state === 'active' : null,
            serverState:
                source === 'server'
                    ? (slot?.lastReported.status ?? null)
                    : null,
            source,
            checkedAt:
                source === 'server'
                    ? (slot?.lastReported.checkedAt ?? null)
                    : null,
            lastReportedAt: slot?.lastReported.checkedAt ?? null,
            approvedAt: slot?.approvedAt ?? null,
            grantExpiresAt: slot?.grantExpiresAt ?? null,
            lastUsedAt: slot?.lastReported.lastUsedAt ?? null,
            limitsStatus: slot?.lastReported.limitsStatus ?? null,
            approvedProjects: reported?.approvedProjects ?? [],
            effectiveProjects: reported?.effectiveProjects ?? [],
            warehouse,
            revokeState,
            settingsUrl: config.context?.serverUrl
                ? settingsUrl(slot?.instanceUrl ?? config.context.serverUrl)
                : null,
            error,
        };
        if (options.json) console.log(JSON.stringify(result));
        else {
            if (error) console.error(error);
            if (state === 'missing' && config.context?.apiKey) {
                const credentialLabel =
                    humanCredential(config.context.apiKey).kind ===
                    'service_account'
                        ? 'Service account credential'
                        : 'Personal CLI login';
                console.error(
                    `${credentialLabel}: available (not used). Warehouse status: unknown (not checked).`,
                );
            }
            let label = state.charAt(0).toUpperCase() + state.slice(1);
            if (state === 'expired' && source === 'local')
                label = 'Expired (local)';
            else if (state === 'revoked' && source === 'local')
                label = 'Revoked (last reported)';
            console.error(`Connection: ${selection} | ${label} | CLI`);
            console.error(`Instance: ${result.instanceUrl ?? 'unknown'}`);
            console.error(
                `Person: ${result.personUuid ?? 'unknown'} | Organisation: ${result.organizationUuid ?? 'unknown'}`,
            );
            if (source === 'local' && slot) {
                console.error(
                    `Last reported ${slot.lastReported.status} at ${slot.lastReported.checkedAt}`,
                );
                console.error(
                    'Approved projects and actions below are cached.',
                );
            }
            console.error(`Approved: ${result.approvedAt ?? 'unknown'}`);
            for (const project of result.approvedProjects) {
                console.error(
                    `Project: ${project.name ?? `${project.projectUuid} (Name unavailable)`}`,
                );
                console.error(
                    `Approved actions: ${project.approvedCapabilities.map(getAgentCapabilityName).join(', ') || 'none'}`,
                );
                for (const capability of result.effectiveProjects.find(
                    (p) => p.projectUuid === project.projectUuid,
                )?.capabilities ?? [])
                    console.error(
                        `${getAgentCapabilityName(capability.capability)}: ${statusReasonMessage(capability.reason) ?? 'Allowed'}`,
                    );
            }
            console.error(
                'Allowed actions can still have resource, destination or recurring-refresh restrictions.',
            );
            console.error(`Expires: ${result.grantExpiresAt ?? 'unknown'}`);
            console.error(`Last used: ${result.lastUsedAt ?? 'not reported'}`);
            if (
                warehouse.projects.length > 0 &&
                warehouse.projects.every(
                    (project) =>
                        project.reason ===
                        'This connection cannot read warehouse readiness.',
                )
            )
                console.error(
                    'Warehouse sign-ins: unknown (this connection cannot read warehouse readiness).',
                );
            else console.error(`Warehouse sign-ins: ${warehouse.state}`);
            for (const project of warehouse.projects) {
                console.error(
                    `Warehouse sign-ins: ${project.projectUuid} ${project.state}${project.reason ? ` (${project.reason})` : ''}`,
                );
                if (project.settingsUrl && project.state !== 'ready')
                    console.error(project.settingsUrl);
            }
            if (
                warehouse.projects.some(
                    (project) => project.source === 'server',
                )
            )
                console.error(
                    'Default warehouse connection checked; review additional connections in the app.',
                );
            else
                console.error(
                    'Default warehouse connection readiness could not be checked; review connections in the app.',
                );
            if (result.settingsUrl)
                console.error(`Settings: ${result.settingsUrl}`);
        }
        const dataCapabilities = [
            AgentCapability.ReadDiscover,
            AgentCapability.Query,
            AgentCapability.RawSql,
            AgentCapability.Export,
        ];
        const approvedData = result.approvedProjects.some((p) =>
            p.approvedCapabilities.some((c) => dataCapabilities.includes(c)),
        );
        const effectiveData = result.effectiveProjects.some((p) =>
            p.capabilities.some(
                (c) => c.allowed && dataCapabilities.includes(c.capability),
            ),
        );
        process.exitCode =
            state === 'active' &&
            warehouse.state === 'ready' &&
            (!approvedData || effectiveData)
                ? 0
                : 1;
    });
};
