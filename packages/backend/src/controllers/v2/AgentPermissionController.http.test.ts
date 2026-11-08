import { Ability } from '@casl/ability';
import {
    AGENT_CAPABILITY_LIMIT_DEFAULTS,
    AgentCapability,
    OrganizationMemberRole,
    type PossibleAbilities,
} from '@lightdash/common';
import express, {
    type ErrorRequestHandler,
    type RequestHandler,
} from 'express';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { buildAccount } from '../../auth/account/account.mock';
import { RegisterRoutes } from '../../generated/routes';
import { AgentCapabilityPolicyModel } from '../../models/AgentCapabilityPolicyModel';
import { AgentPermissionService } from '../../services/AgentPermissionService/AgentPermissionService';
import { type ServiceRepository } from '../../services/ServiceRepository';

vi.mock('../authentication', async (importOriginal) => {
    const original = await importOriginal<typeof import('../authentication')>();
    const pass: RequestHandler = (_request, _response, next) => next();
    return {
        ...original,
        allowApiKeyAuthentication: pass,
        isAuthenticated: pass,
        unauthorisedInDemo: pass,
    };
});

const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
beforeEach(() => tracker.reset());
afterAll(async () => database.destroy());

const setup = () => {
    const account = buildAccount();
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    const row = {
        mode: 'managed' as 'managed' | 'legacy',
        version: 2,
        allowed_capabilities: [AgentCapability.Query] as
            | AgentCapability[]
            | null,
        allowed_group_uuids: ['saved-group'] as string[] | null,
        allowed_user_uuids: ['old-person'] as string[] | null,
        allowed_project_uuids: ['old-project'] as string[] | null,
    };
    tracker.on.select('organization_agent_capability_policies').response(() => [
        {
            ...row,
            system_role: 'viewer',
            capability: AgentCapability.Query,
        },
    ]);
    tracker.on.select('groups').response([{ group_uuid: 'saved-group' }]);
    tracker.on
        .insert('organization_agent_capability_policies')
        .response((query) => {
            const columns = query.sql
                .match(/\(([^)]+)\) values/)![1]
                .split(',')
                .map((column) => column.trim().replaceAll('"', ''));
            const values = Object.fromEntries(
                columns.map((column, index) => [column, query.bindings[index]]),
            );
            const version = query.bindings.at(-1);
            if (query.sql.includes('where') && version !== row.version)
                return [];
            row.mode = values.mode;
            row.allowed_capabilities = query.sql.includes('COALESCE')
                ? (row.allowed_capabilities ?? Object.values(AgentCapability))
                : values.allowed_capabilities;
            row.allowed_user_uuids = values.allowed_user_uuids;
            row.allowed_project_uuids = values.allowed_project_uuids;
            row.version += 1;
            return [{ ...row }];
        });
    const service = new AgentPermissionService({
        agentCapabilityPolicyModel: new AgentCapabilityPolicyModel({
            database,
        }),
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        groupsModel: { findUserInGroups: vi.fn() },
        userModel: { getAgentRoleAssignments: vi.fn() },
        projectModel: { getSummary: vi.fn() },
        resolveResourceProjectUuid: vi.fn(),
        areGroupsAvailable: vi.fn().mockResolvedValue(true),
        isCustomRolesLicensed: () => false,
        agentActionLogModel: { insert: vi.fn() },
    });
    const app = express();
    app.use((request, response, next) => {
        request.account = account;
        request.services = {
            getAgentPermissionService: () => service,
        } as ServiceRepository;
        next();
    });
    RegisterRoutes(app);
    const errors: ErrorRequestHandler = (error, _request, response, _next) => {
        response
            .status(error.status ?? error.statusCode ?? 500)
            .json({ error: error.message });
    };
    app.use(errors);
    const call = (method: string, path: string, body?: unknown) =>
        new Promise<{ status: number; body: Record<string, unknown> }>(
            (resolve) => {
                const request = new IncomingMessage(new Socket());
                request.method = method;
                request.url = path;
                Object.assign(request, { body });
                const response = new ServerResponse(request);
                const capture: RequestHandler = (_request, res, next) => {
                    res.json = (result) => {
                        resolve({ status: res.statusCode, body: result });
                        return res;
                    };
                    next();
                };
                const dispatch = express();
                dispatch.use(capture);
                dispatch.use(app);
                dispatch(request, response);
            },
        );
    return { call, row };
};

const path = '/api/v2/org/agent-permissions';

const everyCapabilityForEveryRole = Object.fromEntries(
    Object.values(OrganizationMemberRole).map((role) => [
        role,
        [...AGENT_CAPABILITY_LIMIT_DEFAULTS],
    ]),
);

const legacyMatrix = {
    [OrganizationMemberRole.MEMBER]: [],
    [OrganizationMemberRole.VIEWER]: [AgentCapability.Query],
    [OrganizationMemberRole.INTERACTIVE_VIEWER]: [AgentCapability.Query],
    [OrganizationMemberRole.EDITOR]: [
        AgentCapability.Query,
        AgentCapability.ContentWrite,
    ],
    [OrganizationMemberRole.DEVELOPER]: [
        AgentCapability.Query,
        AgentCapability.RawSql,
    ],
    [OrganizationMemberRole.ADMIN]: Object.values(AgentCapability),
};

test('generated PUT accepts old extras, drops their choices and retains a stored capability list', async () => {
    const h = setup();
    const result = await h.call('PUT', path, {
        version: 2,
        allowedUserUuids: ['old-person'],
        allowedProjectUuids: ['old-project'],
        systemRoleMatrix: legacyMatrix,
    });
    expect(result.status).toBe(200);
    expect(result.body.results).toMatchObject({
        allowedCapabilities: [AgentCapability.Query],
    });
    expect(result.body.results).not.toHaveProperty('allowedUserUuids');
    expect(result.body.results).not.toHaveProperty('allowedProjectUuids');
    expect(result.body.results.systemRoleMatrix).toEqual(
        everyCapabilityForEveryRole,
    );
    expect(tracker.history.insert).toHaveLength(1);
    expect(tracker.history.delete).toHaveLength(0);
    expect(h.row).toMatchObject({
        allowed_user_uuids: null,
        allowed_project_uuids: null,
        allowed_group_uuids: ['saved-group'],
    });
});

test('generated GET, new PUT and reset return the deprecated constants', async () => {
    const h = setup();
    const get = await h.call('GET', path);
    expect(get.status).toBe(200);
    expect(get.body.results).not.toHaveProperty('allowedUserUuids');
    expect(get.body.results).not.toHaveProperty('allowedProjectUuids');
    expect(get.body.results.systemRoleMatrix).toEqual(
        everyCapabilityForEveryRole,
    );
    expect(get.body.results.defaults).toEqual(everyCapabilityForEveryRole);
    const saved = await h.call('PUT', path, {
        mode: 'managed',
        version: 2,
        allowedCapabilities: [],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.results.systemRoleMatrix).toEqual(
        everyCapabilityForEveryRole,
    );
    expect(h.row.allowed_capabilities).toEqual([]);
    const reset = await h.call('POST', `${path}/reset`, { version: 3 });
    expect(reset.status).toBe(200);
    expect(reset.body.results).toMatchObject({
        mode: 'legacy',
        allowedCapabilities: null,
        allowedGroupUuids: ['saved-group'],
        systemRoleMatrix: everyCapabilityForEveryRole,
    });
    expect((await h.call('POST', `${path}/reset`)).status).toBe(200);
});

test.each([
    { allowedCapabilities: null },
    { allowedCapabilities: ['unknown'] },
    { mode: 'invalid' },
    { version: -1 },
    { version: 1.5 },
])(
    'generated PUT rejects invalid values %j without a write',
    async (invalid) => {
        const h = setup();
        const result = await h.call('PUT', path, {
            mode: 'managed',
            version: 2,
            ...invalid,
        });
        expect(result.status).toBeGreaterThanOrEqual(400);
        expect(tracker.history.insert).toHaveLength(0);
        expect(h.row.version).toBe(2);
    },
);

test('a stale HTTP save is refused and keeps the stored policy', async () => {
    const h = setup();
    const result = await h.call('PUT', path, {
        mode: 'managed',
        version: 1,
        allowedCapabilities: [],
    });
    expect(result.status).toBe(400);
    expect(h.row.allowed_capabilities).toEqual([AgentCapability.Query]);
    expect(h.row.version).toBe(2);
});
