import { subject } from '@casl/ability';
import {
    AGENT_CLIENT_IDS,
    AgentActorSurface,
    AgentCapability,
    assertUnreachable,
    ForbiddenError,
    NotFoundError,
    QuerySourceType,
    type AgentConnectionExecution,
    type OAuthAgentConnectionGrant,
    type SessionUser,
} from '@lightdash/common';
import { type Token } from '@node-oauth/oauth2-server';
import { type Request } from 'express';
import { validate as isUuid } from 'uuid';
import { z } from 'zod';
import Logger from '../../logging/logger';
import { type AgentConnectionGrantModel } from '../../models/AgentConnectionGrantModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type UserModel } from '../../models/UserModel';
import { type AgentPermissionService } from '../../services/AgentPermissionService/AgentPermissionService';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../../services/AiAccessService/agentExecutionContext';
import { fromOauth } from '../account/account';
import { type OAuthTokenBinding } from '../oauthScopes/oauthTokenBinding';
import { OAuthBearerRefusalError } from '../oauthScopes/security';
import type { GrantResourceResolver } from './AgentConnectionGrantResourceResolver';
import { assertAgentConnectionGrantOperation } from './evaluateGrant';
import {
    agentConnectionGrantEnabled,
    matchesOAuthGrantBinding,
} from './oauthGrantBinding';
import {
    getGrantOperationContract,
    sourceEffectCapabilities,
    uploadEffectCapabilities,
} from './operationContracts';
import { grantAllowsCapabilities } from './resourceConstraints';

export type GrantRestRequest = Pick<
    Request,
    'account' | 'params' | 'body' | 'query' | 'method'
>;

export class AgentConnectionGrantService {
    constructor(
        private readonly deps: {
            model: Pick<
                AgentConnectionGrantModel,
                'findActive' | 'touchLastUsed'
            >;
            featureFlags: Pick<FeatureFlagModel, 'get'>;
            resourceResolver: GrantResourceResolver;
            userModel?: Pick<UserModel, 'findSessionUserAndOrgByUuid'>;
            getAgentPermissionService?: () => Pick<
                AgentPermissionService,
                'assertOperation'
            >;
        },
    ) {}

    async assertActiveExecution(
        execution: AgentConnectionExecution,
        {
            projectUuid,
            capabilities,
            recheckOperation,
        }: {
            projectUuid: string;
            capabilities: AgentCapability[];
            recheckOperation: boolean;
        },
    ) {
        const refuse = () =>
            new ForbiddenError(
                'This agent connection is no longer available for this operation.',
            );
        const grant = await this.deps.model.findActive(
            execution.grantUuid,
            new Date(),
        );
        if (
            !grant ||
            grant.grantUuid !== execution.grantUuid ||
            grant.revokedAt !== null ||
            grant.expiresAt.getTime() <= Date.now() ||
            grant.grantRevision !== execution.revision ||
            execution.clientId !== AGENT_CLIENT_IDS[AgentActorSurface.CLI] ||
            !matchesOAuthGrantBinding(grant, {
                ...execution,
                familyUuid: execution.refreshFamilyUuid,
            }) ||
            !(await agentConnectionGrantEnabled(this.deps.featureFlags, {
                userUuid: execution.subjectUserUuid,
                organizationUuid: execution.organizationUuid,
            })) ||
            !this.deps.userModel ||
            !this.deps.getAgentPermissionService
        )
            throw refuse();
        const user = await this.deps.userModel.findSessionUserAndOrgByUuid(
            execution.subjectUserUuid,
            execution.organizationUuid,
        );
        if (
            !user.isActive ||
            user.userUuid !== execution.subjectUserUuid ||
            user.organizationUuid !== execution.organizationUuid
        )
            throw refuse();
        const validatedGrant: OAuthAgentConnectionGrant = {
            grantUuid: grant.grantUuid,
            revision: grant.grantRevision,
            approvedProjectUuids: grant.approvedProjectUuids,
            approvedCapabilities: grant.approvedCapabilities,
            expiresAt: grant.expiresAt,
            clientId: grant.clientId,
            resource: grant.resource,
            resourceConstraints: grant.resourceConstraints,
            grantContractVersion: grant.grantContractVersion,
        };
        const account = fromOauth(
            user,
            {
                accessToken: '',
                client: { id: execution.clientId },
                scope: execution.scopes,
            },
            {
                mode: 'enforce',
                getRequest: () => ({ method: null, routeTemplate: null }),
            },
            validatedGrant,
        );
        if (
            !grant.approvedProjectUuids.includes(projectUuid) ||
            !grantAllowsCapabilities(grant, [projectUuid], capabilities) ||
            !account.user.ability.can(
                'view',
                subject('Project', {
                    projectUuid,
                    organizationUuid: execution.organizationUuid,
                }),
            )
        )
            throw refuse();
        if (recheckOperation)
            assertAgentConnectionGrantOperation(account, {
                ...execution.operation,
                projectUuids: [projectUuid],
                additionalCapabilities: capabilities,
            });
        const scope = createAgentExecutionContext({
            account,
            surface: AgentActorSurface.CLI,
            clientId: execution.clientId,
            agentUuid: null,
            agentIdentityEnabled: true,
            agentConnectionGrant: {
                grantUuid: execution.grantUuid,
                revision: execution.revision,
            },
            agentConnectionExecution: execution,
        });
        const permissions = this.deps.getAgentPermissionService();
        await agentExecutionContext.run(scope, async () => {
            if (recheckOperation)
                await permissions.assertOperation({
                    account,
                    organizationUuid: execution.organizationUuid,
                    projectUuid,
                    kind: 'rest_operation',
                    key: execution.operation.key,
                    surface: AgentActorSurface.CLI,
                });
            await [...new Set(capabilities)].reduce(
                async (previous, capability) => {
                    await previous;
                    await permissions.assertOperation({
                        account,
                        organizationUuid: execution.organizationUuid,
                        projectUuid,
                        kind: 'capability',
                        key: capability,
                        surface: AgentActorSurface.CLI,
                    });
                },
                Promise.resolve(),
            );
        });

        return { grant: validatedGrant, account, scope };
    }

    async loadSessionUser(
        userUuid: string,
        organizationUuid: string,
    ): Promise<SessionUser> {
        try {
            if (!this.deps.userModel) throw new OAuthBearerRefusalError();
            const user = await this.deps.userModel.findSessionUserAndOrgByUuid(
                userUuid,
                organizationUuid,
            );
            if (
                !user.isActive ||
                user.userUuid !== userUuid ||
                user.organizationUuid !== organizationUuid
            )
                throw new OAuthBearerRefusalError();
            return user;
        } catch {
            throw new OAuthBearerRefusalError();
        }
    }

    async authenticate(
        token: Token & Partial<OAuthTokenBinding>,
        user: SessionUser,
    ): Promise<OAuthAgentConnectionGrant | null> {
        if (token.agentConnectionGrantUuid == null) return null;
        if (
            !(await agentConnectionGrantEnabled(this.deps.featureFlags, {
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
            }))
        )
            throw new OAuthBearerRefusalError();
        const grant = await this.deps.model.findActive(
            token.agentConnectionGrantUuid,
            new Date(),
        );
        if (
            !grant ||
            !user.isActive ||
            !matchesOAuthGrantBinding(grant, {
                subjectUserUuid: user.userUuid,
                organizationUuid: user.organizationUuid!,
                clientId: token.client.id,
                resource: token.resource ?? null,
                familyUuid: token.familyUuid ?? null,
            }) ||
            token.user.userUuid !== user.userUuid ||
            token.user.organizationUuid !== user.organizationUuid
        )
            throw new OAuthBearerRefusalError();
        void this.deps.model
            .touchLastUsed(grant.grantUuid)
            .catch((error) =>
                Logger.error(
                    'Failed to update agent connection last use',
                    error,
                ),
            );
        return {
            grantUuid: grant.grantUuid,
            revision: grant.grantRevision,
            approvedProjectUuids: grant.approvedProjectUuids,
            approvedCapabilities: grant.approvedCapabilities,
            expiresAt: grant.expiresAt,
            clientId: grant.clientId,
            resource: grant.resource,
            resourceConstraints: grant.resourceConstraints,
            grantContractVersion: grant.grantContractVersion,
        };
    }

    async assertRestOperation(
        req: GrantRestRequest,
        operation: string | null,
    ): Promise<string[]> {
        if (
            req.account?.authentication.type !== 'oauth' ||
            !req.account.authentication.agentConnectionGrant
        )
            return [];
        const contract =
            operation === null ? null : getGrantOperationContract(operation);
        if (contract === null) {
            assertAgentConnectionGrantOperation(req.account, {
                kind: 'rest',
                key: operation ?? 'unknown',
                projectUuids: [],
            });
            throw new ForbiddenError(
                "This agent connection can't use this operation.",
            );
        }
        const organizationUuid = req.account.organization.organizationUuid!;
        const resolver = this.deps.resourceResolver;
        const projects: string[] = [];
        let additionalCapabilities: AgentCapability[] = [];
        let deploymentOverrides: {
            target?: unknown;
            sourceUuid?: unknown;
        } | null = null;
        const resolveProject = async (value: unknown) => {
            const id = z.string().min(1).safeParse(value);
            if (!id.success)
                throw new ForbiddenError(
                    "This agent connection can't use an unresolved project.",
                );
            return resolver.resolveProjectUuid(organizationUuid, id.data);
        };
        const parseBody = <T>(schema: z.ZodType<T>): T => {
            const body = schema.safeParse(req.body ?? {});
            if (!body.success)
                throw new ForbiddenError(
                    "This agent connection can't resolve this request body.",
                );
            return body.data;
        };
        switch (contract.kind) {
            case 'connection_lifecycle':
                if (req.method !== contract.method)
                    throw new ForbiddenError(
                        'This agent connection cannot use this operation.',
                    );
                if (
                    req.params.grantUuid !==
                    req.account.authentication.agentConnectionGrant.grantUuid
                )
                    throw new NotFoundError('Agent connection not found');
                return [];
            case 'org_discovery':
                if (req.method !== 'GET')
                    throw new ForbiddenError(
                        "This agent connection can't use this operation.",
                    );
                break;
            case 'resource': {
                let projectUuid: string | null = null;
                switch (contract.scope.kind) {
                    case 'none':
                        break;
                    case 'path':
                        projectUuid = await resolveProject(
                            req.params[contract.scope.param],
                        );
                        break;
                    case 'query':
                        if (req.query[contract.scope.param] !== undefined)
                            projectUuid = await resolveProject(
                                req.query[contract.scope.param],
                            );
                        break;
                    default:
                        assertUnreachable(
                            contract.scope,
                            'Unknown grant resource scope',
                        );
                }
                const resource = z
                    .string()
                    .min(1)
                    .safeParse(req.params[contract.param]);
                if (
                    !resource.success ||
                    (projectUuid === null && !isUuid(resource.data))
                )
                    throw new ForbiddenError(
                        "This agent connection can't use an unresolved project.",
                    );
                const actual = await resolver.resolveResourceProjectUuid({
                    type: contract.resourceType,
                    uuid: resource.data,
                    projectUuid,
                });
                if (actual === null)
                    throw new ForbiddenError(
                        "This agent connection can't use an unresolved project.",
                    );
                if (projectUuid !== null && actual !== projectUuid)
                    throw new ForbiddenError(
                        "This agent connection can't use this project.",
                    );
                projects.push(await resolveProject(actual));
                break;
            }
            case 'project_filter': {
                const raw = req.query[contract.query];
                const ids = z
                    .array(z.string().min(1))
                    .min(1)
                    .safeParse(typeof raw === 'string' ? raw.split(',') : raw);
                if (!ids.success)
                    throw new ForbiddenError(
                        "This agent connection can't use an unresolved project.",
                    );
                projects.push(
                    ...(await Promise.all(ids.data.map(resolveProject))),
                );
                break;
            }
            case 'path_project':
                projects.push(await resolveProject(req.params[contract.param]));
                break;
            case 'deployment_session': {
                const projectUuid = await resolveProject(
                    req.params[contract.param],
                );
                const sessionUuid = z
                    .string()
                    .min(1)
                    .safeParse(req.params[contract.sessionParam]);
                if (!sessionUuid.success)
                    throw new ForbiddenError(
                        "This agent connection can't resolve this deploy session.",
                    );
                const session = await resolver.resolveDeploySession(
                    sessionUuid.data,
                );
                if (
                    session.projectUuid !== projectUuid ||
                    session.userUuid !== req.account.user.id
                )
                    throw new ForbiddenError(
                        "This agent connection can't use this deploy session.",
                    );
                projects.push(await resolveProject(session.projectUuid));
                deploymentOverrides = z
                    .object({ target: z.unknown(), sourceUuid: z.unknown() })
                    .partial()
                    .parse(parseBody(contract.bodySchema));
                break;
            }
            case 'refresh':
                projects.push(await resolveProject(req.params[contract.param]));
                parseBody(contract.bodySchema);
                break;
            case 'deployment': {
                projects.push(await resolveProject(req.params[contract.param]));
                const body = parseBody(contract.bodySchema);
                if (contract.overrides === 'legacy_query') {
                    const overrides = z
                        .object({
                            sourceUuid: z.unknown(),
                            targetDatabase: z.unknown(),
                            targetRegion: z.unknown(),
                        })
                        .partial()
                        .parse(req.query);
                    deploymentOverrides = {
                        sourceUuid: overrides.sourceUuid,
                        target:
                            overrides.targetDatabase ?? overrides.targetRegion,
                    };
                } else {
                    const overrides = z
                        .object({
                            target: z.unknown(),
                            sourceUuid: z.unknown(),
                        })
                        .partial()
                        .parse(body);
                    deploymentOverrides = overrides;
                }
                break;
            }
            case 'content_upload': {
                projects.push(await resolveProject(req.params[contract.param]));
                const body = parseBody(contract.bodySchema);
                additionalCapabilities = [
                    AgentCapability.DeployUpload,
                    ...uploadEffectCapabilities(body),
                ];
                break;
            }
            case 'source_queries': {
                projects.push(await resolveProject(req.params[contract.param]));
                const body = parseBody(contract.bodySchema);
                additionalCapabilities = sourceEffectCapabilities(
                    body.queries.map(({ sourceType }) => sourceType),
                );
                break;
            }
            case 'source_schema': {
                projects.push(await resolveProject(req.params[contract.param]));
                const sourceType = z
                    .enum(QuerySourceType)
                    .safeParse(req.params[contract.sourceTypeParam]);
                if (!sourceType.success)
                    throw new ForbiddenError(
                        "This agent connection can't resolve this query source.",
                    );
                additionalCapabilities =
                    sourceType.data === QuerySourceType.SQL
                        ? [AgentCapability.RawSql]
                        : [];
                break;
            }
            default:
                assertUnreachable(contract, 'Unknown grant operation contract');
        }
        assertAgentConnectionGrantOperation(req.account, {
            kind: 'rest',
            key: operation!,
            projectUuids: projects,
            additionalCapabilities,
            deploymentOverrides,
        });
        return [...new Set(projects)];
    }
}
