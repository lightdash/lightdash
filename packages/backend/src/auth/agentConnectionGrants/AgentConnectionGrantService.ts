import {
    AgentCapability,
    assertUnreachable,
    ForbiddenError,
    QuerySourceType,
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
} from './operationContracts';

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
        },
    ) {}

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
            case 'content_upload':
                projects.push(await resolveProject(req.params[contract.param]));
                parseBody(contract.bodySchema);
                additionalCapabilities = [AgentCapability.DeployUpload];
                break;
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
