import {
    AgentActorSurface,
    AgentCapability,
    DbtProjectType,
    DimensionType,
    FeatureFlags,
    FieldType,
    MetricType,
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
    SupportedDbtAdapter,
    type AgentConnectionExecution,
    type Explore,
    type SessionUser,
} from '@lightdash/common';
import express, { type ErrorRequestHandler } from 'express';
import { type Knex } from 'knex';
import fetch, { type RequestInit } from 'node-fetch';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { type AddressInfo } from 'node:net';
import passport from 'passport';
import { fromSession } from '../../../../auth/account/account';
import { lightdashConfig } from '../../../../config/lightdashConfig';
import {
    AGENT_CONNECTION_REQUEST_PATH,
    parseAgentConnectionApprovalBody,
} from '../../../../controllers/authentication/agentConnectionApproval';
import { apiKeyPassportStrategy } from '../../../../controllers/authentication/strategies/apiKeyStrategy';
import { type DbOrganization } from '../../../../database/entities/organizations';
import { type DbProject } from '../../../../database/entities/projects';
import { RegisterRoutes } from '../../../../generated/routes';
import Logger from '../../../../logging/logger';
import { PatSessionCache } from '../../../../models/caches/PatSessionCache';
import { ModelRepository } from '../../../../models/ModelRepository';
import { AgentPermissionService } from '../../../../services/AgentPermissionService/AgentPermissionService';
import { createAgentExecutionContext } from '../../../../services/AiAccessService/agentExecutionContext';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { ServiceRepository } from '../../../../services/ServiceRepository';
import { UserService } from '../../../../services/UserService';
import { EncryptionUtil } from '../../../../utils/EncryptionUtil/EncryptionUtil';

export const capabilities = [
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.DeployUpload,
];
export const uuid = (name: string) => {
    const h = createHash('sha256').update(name).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const explore = (index: number): Explore => {
    const name = `model_${String(index).padStart(5, '0')}`;
    const dimensions = Object.fromEntries(
        Array.from(
            { length: Number(process.env.MEASURE_DIMENSIONS ?? 40) },
            (_, i) => {
                const field = `attribute_${String(i).padStart(3, '0')}`;
                return [
                    field,
                    {
                        name: field,
                        label: `Attribute ${i}`,
                        table: name,
                        tableLabel: name,
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        sql: `\${TABLE}.${field}`,
                        compiledSql: `"${name}"."${field}"`,
                        description: `Business attribute ${i} from the source relation. Used to filter and group results.`,
                        hidden: false,
                        tablesReferences: [name],
                    },
                ];
            },
        ),
    );
    const metrics = Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
            `metric_${i}`,
            {
                name: `metric_${i}`,
                label: `Metric ${i}`,
                table: name,
                tableLabel: name,
                fieldType: FieldType.METRIC,
                type: MetricType.COUNT_DISTINCT,
                sql: `\${TABLE}.attribute_00${i}`,
                compiledSql: `COUNT(DISTINCT "${name}"."attribute_00${i}")`,
                description:
                    'Number of distinct values in this business attribute.',
                hidden: false,
                tablesReferences: [name],
            },
        ]),
    );
    return {
        name,
        label: `Model ${index}`,
        tags: ['measurement'],
        baseTable: name,
        joinedTables: [],
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        tables: {
            [name]: {
                name,
                database: 'analytics',
                schema: 'public',
                label: `Model ${index}`,
                sqlTable: `"analytics"."${name}"`,
                dimensions,
                metrics,
                lineageGraph: {},
            },
        },
    } as Explore;
};

export const fixture = async (database: Knex) => {
    Logger.silent = true;
    const encryptionUtil = new EncryptionUtil({ lightdashConfig });
    const models = new ModelRepository({
        database,
        lightdashConfig,
        utils: { getEncryptionUtil: () => encryptionUtil } as never,
    });
    vi.spyOn(models.getFeatureFlagModel(), 'get').mockImplementation(
        async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: featureFlagId === FeatureFlags.AgentIdentity,
        }),
    );
    const [org] = await database<DbOrganization>('organizations')
        .insert({
            organization_uuid: uuid('organization'),
            organization_name: 'Measurement organization',
        })
        .returning('*');
    const [user] = await database('users')
        .insert({
            user_uuid: uuid('person'),
            first_name: 'Measurement',
            last_name: 'Person',
            is_marketing_opted_in: false,
            is_tracking_anonymized: true,
            is_setup_complete: true,
            is_active: true,
        })
        .returning('*');
    await database('organization_memberships').insert({
        organization_id: org.organization_id,
        user_id: user.user_id,
        role: OrganizationMemberRole.MEMBER,
    });
    await database('emails').insert({
        user_id: user.user_id,
        email: 'measurement@example.com',
        is_primary: true,
    });
    await database('emails')
        .where({ user_id: user.user_id })
        .update({ is_verified: true });
    const groupUuids: string[] = [];
    for await (const i of [0, 1, 2]) {
        const groupUuid = uuid(`group-${i}`);
        await database('groups').insert({
            group_uuid: groupUuid,
            organization_id: org.organization_id,
            name: `Group ${i}`,
            created_by_user_uuid: user.user_uuid,
            updated_by_user_uuid: user.user_uuid,
        });
        await database('group_memberships').insert({
            group_uuid: groupUuid,
            organization_id: org.organization_id,
            user_id: user.user_id,
        });
        groupUuids.push(groupUuid);
    }
    await database('oauth2_clients')
        .insert({
            client_id: 'lightdash-cli',
            client_name: 'Measurement CLI',
            redirect_uris: ['http://localhost:32123/callback'],
            grants: ['authorization_code', 'refresh_token'],
            scopes: ['read', 'write'],
        })
        .onConflict('client_id')
        .merge();
    const policy = await models.getAgentCapabilityPolicyModel().save({
        organizationUuid: org.organization_uuid,
        mode: 'managed',
        allowedCapabilities: Object.values(AgentCapability),
        allowedGroupUuids: groupUuids,
        systemRoleMatrix: {
            member: [],
            viewer: [],
            interactive_viewer: [],
            editor: [],
            developer: Object.values(AgentCapability),
            admin: Object.values(AgentCapability),
        },
        updatedByUserUuid: user.user_uuid,
    });
    const usageUpdates: Promise<void>[] = [];
    const grantModel = models.getAgentConnectionGrantModel();
    const touchLastUsed = grantModel.touchLastUsed.bind(grantModel);
    vi.spyOn(grantModel, 'touchLastUsed').mockImplementation((id) => {
        const pending = touchLastUsed(id);
        usageUpdates.push(pending);
        return pending;
    });
    const permissions = new AgentPermissionService({
        agentCapabilityPolicyModel: models.getAgentCapabilityPolicyModel(),
        groupsModel: models.getGroupsModel(),
        featureFlagModel: models.getFeatureFlagModel(),
        userModel: models.getUserModel(),
        projectModel: models.getProjectModel(),
        agentActionLogModel: models.getAgentActionLogModel(),
        resolveResourceProjectUuid: async () => {
            throw new Error('Unexpected resource lookup');
        },
        isCustomRolesLicensed: () => false,
        areGroupsAvailable: async () => true,
    });
    const users: UserService = Object.assign(
        Object.create(UserService.prototype),
        {
            userModel: models.getUserModel(),
            personalAccessTokenModel: models.getPersonalAccessTokenModel(),
            logger: Logger,
        },
    );
    const projectService: ProjectService = Object.assign(
        Object.create(ProjectService.prototype),
        {
            projectModel: models.getProjectModel(),
            preAggregateModel: models.getPreAggregateModel(),
            projectParametersModel: models.getProjectParametersModel(),
            projectDbtSourcesModel: models.getProjectDbtSourcesModel(),
            logger: Logger,
        },
    );
    const services = new ServiceRepository({
        context: { lightdashConfig } as never,
        models,
        clients: {} as never,
        utils: {} as never,
    });
    vi.spyOn(services, 'getUserService').mockReturnValue(users);
    vi.spyOn(services, 'getProjectService').mockReturnValue(projectService);
    vi.spyOn(services, 'getAgentPermissionService').mockReturnValue(
        permissions,
    );
    const pat = await models.getPersonalAccessTokenModel().save(
        { userId: user.user_id },
        {
            token: 'ldpat_measurement_fixture_token',
            description: 'Measurement',
            autoGenerated: false,
            expiresAt: new Date(Date.now() + 86400000),
        },
    );
    let person: SessionUser;
    const projectUuids: string[] = [];
    const grow = async (size: number) => {
        for await (const i of Array.from(
            { length: size - projectUuids.length },
            (_, index) => projectUuids.length + index,
        )) {
            const projectUuid = uuid(`project-${String(i).padStart(5, '0')}`);
            const [project] = await database<DbProject>('projects')
                .insert({
                    project_uuid: projectUuid,
                    organization_id: org.organization_id,
                    name: `Project ${String(i).padStart(5, '0')}`,
                    project_type: ProjectType.DEFAULT,
                    created_by_user_uuid: user.user_uuid,
                    dbt_connection: encryptionUtil.encrypt(
                        JSON.stringify({ type: DbtProjectType.NONE }),
                    ),
                    dbt_connection_type: DbtProjectType.NONE,
                    copied_from_project_uuid: null,
                    dbt_version: '1.7',
                    organization_warehouse_credentials_uuid: null,
                })
                .returning('*');
            await database('project_memberships').insert({
                project_id: project.project_id,
                user_id: user.user_id,
                role: ProjectMemberRole.DEVELOPER,
            });
            await database('cached_explore').insert(
                Array.from({ length: 10 }, (_, j) => ({
                    project_uuid: projectUuid,
                    name: explore(j).name,
                    table_names: [explore(j).name],
                    explore: explore(j),
                })),
            );
            projectUuids.push(projectUuid);
        }
        models.getUserModel().invalidateSessionUserCache(user.user_uuid);
        PatSessionCache.invalidate();
        person = await users.findSessionUser({
            id: user.user_uuid,
            organization: org.organization_uuid,
        });
    };
    const grant = (size: number) =>
        models.getAgentConnectionGrantModel().create({
            organizationUuid: org.organization_uuid,
            subjectUserUuid: user.user_uuid,
            clientId: 'lightdash-cli',
            name: 'measurement-connection',
            resource: lightdashConfig.siteUrl,
            approvedCapabilities: capabilities,
            approvedProjectUuids: projectUuids.slice(0, size),
            resourceConstraints: {
                version: 2,
                projectCapabilities: Object.fromEntries(
                    projectUuids.slice(0, size).map((id) => [id, capabilities]),
                ),
            },
            approvalPolicyVersion: policy.version,
            approvedByUserUuid: user.user_uuid,
            approvalRequestUuid: randomUUID(),
            expiresAt: new Date(Date.now() + 86400000),
        });
    const bearer = async (size: number) => {
        const connection = await grant(size);
        const familyUuid = randomUUID();
        await models.getAgentConnectionGrantModel().bindRefreshFamily({
            organizationUuid: org.organization_uuid,
            grantUuid: connection.grantUuid,
            familyUuid,
        });
        const token = randomUUID();
        await database('oauth2_access_tokens').insert({
            client_id: 'lightdash-cli',
            user_id: user.user_id,
            organization_uuid: org.organization_uuid,
            scope: ['read', 'write'],
            resource: connection.resource,
            family_uuid: familyUuid,
            agent_connection_grant_uuid: connection.grantUuid,
            expires_at: new Date(Date.now() + 3600000),
            access_token: token,
        });
        return { token, connection, familyUuid };
    };
    const context = () =>
        createAgentExecutionContext({
            account: fromSession(person, 'measurement'),
            surface: AgentActorSurface.CLI,
            clientId: 'lightdash-cli',
            agentUuid: null,
            agentIdentityEnabled: true,
            agentConnectionGrant: { grantUuid: uuid('scope'), revision: 1 },
            agentConnectionExecution: {
                grantUuid: uuid('scope'),
                revision: 1,
                subjectUserUuid: user.user_uuid,
                organizationUuid: org.organization_uuid,
                clientId: 'lightdash-cli',
                resource: lightdashConfig.siteUrl,
                refreshFamilyUuid: uuid('family'),
                scopes: ['read', 'write'],
                operation: {
                    kind: 'rest',
                    key: 'ProjectController.refresh',
                },
            } satisfies AgentConnectionExecution,
        });
    const app = express();
    passport.use(
        'headerapikey',
        apiKeyPassportStrategy({ userService: users }),
    );
    app.use(passport.initialize());
    app.post(AGENT_CONNECTION_REQUEST_PATH, parseAgentConnectionApprovalBody);
    app.post(
        `${AGENT_CONNECTION_REQUEST_PATH}/:requestUuid/decision`,
        parseAgentConnectionApprovalBody,
    );
    app.use(express.json());
    app.use(async (req, _res, next) => {
        try {
            req.services = services;
            if (!req.headers.authorization) {
                req.user = await users.findSessionUser({
                    id: user.user_uuid,
                    organization: org.organization_uuid,
                });
                req.sessionID = 'measurement';
                req.session = { passport: { user: user.user_uuid } } as never;
                req.account = fromSession(req.user, req.sessionID);
            }
            next();
        } catch (error) {
            next(error);
        }
    });
    RegisterRoutes(app);
    const errors: ErrorRequestHandler = (error, _req, res, _next) =>
        res
            .status(error.statusCode ?? 500)
            .json({ error: error.message, stack: error.stack });
    app.use(errors);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const call = async (path: string, init: RequestInit = {}) => {
        const response = await fetch(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
            {
                ...init,
                headers: {
                    origin: new URL(lightdashConfig.siteUrl).origin,
                    'content-type': 'application/json',
                    ...init.headers,
                },
            },
        );
        const text = await response.text();
        await Promise.all(usageUpdates.splice(0));
        if (response.status !== 200)
            throw new Error(`${response.status} ${path}: ${text}`);
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`Invalid response JSON: ${path}`);
        }
    };
    return {
        warmSession: () =>
            users.findSessionUser({
                id: user.user_uuid,
                organization: org.organization_uuid,
            }),
        models,
        services,
        projectService,
        grow,
        grant,
        bearer,
        projectUuids,
        pat,
        context,
        person: () => person,
        call,
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            }),
    };
};
