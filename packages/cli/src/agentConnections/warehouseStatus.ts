import { AgentCapability, AiAccessRefusalReason } from '@lightdash/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import pLimit from 'p-limit';
import { lightdashRawApi } from '../handlers/dbt/apiClient';
import { settingsUrl } from './lifecycle';
import { type AgentConnectionSlot } from './schema';
import { responseRecord } from './statusResponse';

type WarehouseAccess = {
    projectUuid: string;
    warehouseConnectionUuid: string | null;
    identity:
        | 'connected_person'
        | 'ai_service_account'
        | 'marked_person'
        | null;
    requirementSource: 'organization' | null;
    expiresAt: string | null;
    refusal: {
        reason: string;
        settingsUrl: string | null;
        connectUrl: string | null;
    } | null;
};
const createValidator = () => {
    const ajv = new Ajv();
    addFormats(ajv);
    return ajv.compile<WarehouseAccess>({
        type: 'object',
        required: [
            'projectUuid',
            'warehouseConnectionUuid',
            'identity',
            'requirementSource',
            'expiresAt',
            'refusal',
        ],
        properties: {
            projectUuid: { type: 'string', format: 'uuid' },
            warehouseConnectionUuid: {
                anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }],
            },
            identity: {
                enum: [
                    'connected_person',
                    'ai_service_account',
                    'marked_person',
                    null,
                ],
            },
            requirementSource: { enum: ['organization', null] },
            expiresAt: {
                anyOf: [
                    { type: 'string', format: 'date-time' },
                    { type: 'null' },
                ],
            },
            refusal: {
                anyOf: [
                    { type: 'null' },
                    {
                        type: 'object',
                        required: ['reason', 'settingsUrl', 'connectUrl'],
                        properties: {
                            reason: {
                                enum: Object.values(AiAccessRefusalReason),
                            },
                            settingsUrl: { type: ['string', 'null'] },
                            connectUrl: { type: ['string', 'null'] },
                        },
                    },
                ],
            },
        },
    });
};
let validator: ReturnType<typeof createValidator> | null = null;
export type WarehouseRow = {
    projectUuid: string;
    state: 'ready' | 'needs_setup' | 'unknown';
    reason: string | null;
    source: 'server' | 'local';
    identity: WarehouseAccess['identity'];
    expiresAt: string | null;
    settingsUrl: string | null;
};
export type WarehouseStatus = {
    state: 'ready' | 'partial' | 'needs_setup' | 'unknown';
    projects: WarehouseRow[];
};
const safeLink = (
    link: string | null,
    slot: AgentConnectionSlot,
): string | null => {
    const instance = slot.instanceUrl;
    if (
        link !== null &&
        [slot.tokens.accessToken, slot.tokens.refreshToken].some(
            (secret) =>
                link.includes(secret) ||
                link.includes(encodeURIComponent(secret)),
        )
    )
        return null;
    if (link === null) return null;
    try {
        const url = new URL(link, `${instance}/`);
        return url.origin === new URL(instance).origin &&
            !url.username &&
            !url.password
            ? url.href
            : null;
    } catch {
        return null;
    }
};
export const readWarehouseStatus = async (
    slot: AgentConnectionSlot,
): Promise<WarehouseStatus> => {
    const limit = pLimit(4);
    const projects = await Promise.all(
        slot.lastReported.approvedProjects.map((project) =>
            limit(async (): Promise<WarehouseRow> => {
                const unknown: WarehouseRow = {
                    projectUuid: project.projectUuid,
                    state: 'unknown',
                    reason: 'This connection cannot read warehouse readiness.',
                    source: 'local',
                    identity: null,
                    expiresAt: null,
                    settingsUrl: settingsUrl(slot.instanceUrl),
                };
                const canRead = slot.lastReported.effectiveProjects
                    .find((p) => p.projectUuid === project.projectUuid)
                    ?.capabilities.some(
                        (c) =>
                            c.capability === AgentCapability.ReadDiscover &&
                            c.allowed,
                    );
                if (!canRead) return unknown;
                try {
                    const { projectUuid } = project;
                    const response = await lightdashRawApi({
                        method: 'GET',
                        url: `/api/v2/projects/${projectUuid}/ai-access/me`,
                        body: undefined,
                        signal: AbortSignal.timeout(15_000),
                        lifecycle: {
                            kind: 'status',
                            grantUuid: slot.grantUuid,
                            generation: slot.tokens.generation,
                        },
                    });
                    const value: unknown = await response.json();
                    const envelope = responseRecord(value);
                    validator ??= createValidator();
                    const access = envelope.results;
                    if (
                        envelope.status !== 'ok' ||
                        !validator(access) ||
                        access.projectUuid !== projectUuid
                    )
                        return {
                            ...unknown,
                            reason: 'The server returned invalid warehouse readiness.',
                        };
                    if (access.refusal !== null)
                        return {
                            ...unknown,
                            state: 'needs_setup',
                            source: 'server',
                            reason: access.refusal.reason,
                            identity: access.identity,
                            expiresAt: access.expiresAt,
                            settingsUrl:
                                safeLink(access.refusal.connectUrl, slot) ??
                                safeLink(access.refusal.settingsUrl, slot) ??
                                unknown.settingsUrl,
                        };
                    if (
                        access.expiresAt !== null &&
                        Date.parse(access.expiresAt) <= Date.now()
                    )
                        return {
                            ...unknown,
                            state: 'needs_setup',
                            source: 'server',
                            reason: 'Warehouse sign-in expired.',
                            expiresAt: access.expiresAt,
                        };
                    const ready =
                        access.identity === 'connected_person' ||
                        access.identity === 'ai_service_account' ||
                        access.requirementSource === null;
                    let reason = ready
                        ? null
                        : 'Warehouse readiness is unknown.';
                    if (access.identity === 'ai_service_account')
                        reason = 'Shared account ready.';
                    else if (access.requirementSource === null)
                        reason = 'No extra sign-in needed.';
                    return {
                        ...unknown,
                        state: ready ? 'ready' : 'unknown',
                        source: 'server',
                        identity: access.identity,
                        expiresAt: access.expiresAt,
                        reason,
                    };
                } catch {
                    return {
                        ...unknown,
                        reason: 'Could not check warehouse readiness.',
                    };
                }
            }),
        ),
    );
    const ready = projects.filter(
        (project) => project.state === 'ready',
    ).length;
    let state: WarehouseStatus['state'] = 'unknown';
    if (projects.length > 0 && ready === projects.length) state = 'ready';
    else if (ready > 0) state = 'partial';
    else if (projects.some((p) => p.state === 'needs_setup'))
        state = 'needs_setup';
    return { state, projects };
};
