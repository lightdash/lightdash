import {
    ChartSourceType,
    ContentType,
    ForbiddenError,
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
import { type OAuthRouteResource } from '../oauthScopes/routeOperation';
import { OAuthBearerRefusalError } from '../oauthScopes/security';
import { assertAgentConnectionGrantOperation } from './evaluateGrant';
import {
    agentConnectionGrantEnabled,
    matchesOAuthGrantBinding,
} from './oauthGrantBinding';

export type OAuthGrantRouteResource = {
    type: OAuthRouteResource['type'] | 'sql_chart' | 'document' | 'data_app';
    uuid: string;
    projectUuid: string | null;
};

const UPSTREAM_OPERATIONS: ReadonlySet<string> = new Set([
    'DashboardController.promoteDashboard',
    'DashboardController.promoteDashboardDiff',
    'SavedChartController.promoteChart',
    'SavedChartController.promoteChartDiff',
    'SqlRunnerController.promoteSqlChart',
    'SqlRunnerController.promoteSqlChartDiff',
    'DocumentController.promote',
    'AppGenerateController.promoteApp',
]);

const contentItemSchema = z.object({
    uuid: z.string(),
    contentType: z.enum(ContentType),
    source: z.enum(ChartSourceType).optional(),
});
const contentActionSchema = z.object({
    item: contentItemSchema.optional(),
    content: z.array(contentItemSchema).optional(),
    action: z
        .object({ targetSpaceUuid: z.string().nullable().optional() })
        .optional(),
});
const CONTENT_ACTION_OPERATIONS: ReadonlySet<string> = new Set([
    'ContentController.moveContent',
    'ContentController.bulkMoveContent',
    'ContentController.deleteContent',
    'ContentController.bulkDeleteContent',
    'ContentController.restoreContent',
    'ContentController.permanentlyDeleteContent',
]);

export class AgentConnectionGrantService {
    constructor(
        private readonly deps: {
            model: Pick<
                AgentConnectionGrantModel,
                'findActive' | 'touchLastUsed'
            >;
            featureFlags: Pick<FeatureFlagModel, 'get'>;
            resolveProjectUuid: (
                organizationUuid: string,
                uuidOrSlug: string,
            ) => Promise<string>;
            resolveResourceProjectUuid: (
                resource: OAuthGrantRouteResource,
            ) => Promise<string | null>;
            resolveUpstreamProjectUuid: (
                projectUuid: string,
            ) => Promise<string | null>;
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
        req: Pick<Request, 'account' | 'params' | 'body'> &
            Partial<Pick<Request, 'query' | 'method'>>,
        operation: string | null,
    ): Promise<string[]> {
        if (
            req.account?.authentication.type !== 'oauth' ||
            !req.account.authentication.agentConnectionGrant
        )
            return [];
        const organizationUuid = req.account.organization.organizationUuid!;
        const parsedBody = z
            .record(z.string(), z.unknown())
            .safeParse(req.method === 'GET' ? {} : (req.body ?? {}));
        if (!parsedBody.success)
            throw new ForbiddenError(
                "This agent connection can't resolve this request body.",
            );
        const body = parsedBody.data;
        const ids = new Set<string>();
        const listing =
            operation === 'ContentController.listContent' ||
            operation === 'ContentController.listDeletedContent';
        const projectSources = listing
            ? [{ projectUuids: req.query?.projectUuids }]
            : [req.params, body, req.query ?? {}];
        for (const values of projectSources) {
            for (const key of [
                'projectUuid',
                'projectUuidOrSlug',
                'sourceProjectUuid',
                'targetProjectUuid',
                'destinationProjectUuid',
            ]) {
                const value: unknown = (values as Record<string, unknown>)[key];
                if (typeof value === 'string') ids.add(value);
            }
            const projectIds =
                typeof values.projectUuids === 'string'
                    ? values.projectUuids.split(',')
                    : values.projectUuids;
            if (Array.isArray(projectIds)) {
                for (const value of projectIds)
                    if (typeof value === 'string') ids.add(value);
            }
        }
        const projectUuids = await Promise.all(
            [...ids].map((id) =>
                this.deps.resolveProjectUuid(organizationUuid, id),
            ),
        );
        const explicitScope =
            req.params.projectUuid ??
            req.params.projectUuidOrSlug ??
            req.query?.projectUuid;
        const slugProjectUuid =
            typeof explicitScope === 'string'
                ? await this.deps.resolveProjectUuid(
                      organizationUuid,
                      explicitScope,
                  )
                : null;
        const resources: readonly [string, OAuthGrantRouteResource['type']][] =
            [
                ['dashboardUuid', 'dashboard'],
                ['dashboardUuidOrSlug', 'dashboard'],
                ['sourceDashboardUuid', 'dashboard'],
                ['chartUuid', 'saved_chart'],
                ['savedQueryUuid', 'saved_chart'],
                ['savedQueryUuidOrSlug', 'saved_chart'],
                ['spaceUuid', 'space'],
                ['sourceSpaceUuid', 'space'],
                ['targetSpaceUuid', 'space'],
                ['destinationSpaceUuid', 'space'],
                ['queryUuid', 'query'],
                ['savedSqlUuid', 'sql_chart'],
            ];
        const references = [req.params, body].flatMap((values) =>
            resources.flatMap(([parameter, type]) => {
                const uuid = values[parameter];
                return typeof uuid === 'string'
                    ? [{ type, uuid, projectUuid: slugProjectUuid }]
                    : [];
            }),
        );
        const referenceProjects = await Promise.all(
            references.map(async (resource) => {
                if (!isUuid(resource.uuid) && slugProjectUuid === null)
                    throw new ForbiddenError(
                        "This agent connection can't use an unresolved project.",
                    );
                const project =
                    await this.deps.resolveResourceProjectUuid(resource);
                if (project === null)
                    throw new ForbiddenError(
                        "This agent connection can't use an unresolved project.",
                    );
                return project;
            }),
        );
        projectUuids.push(...referenceProjects);
        if (operation !== null && CONTENT_ACTION_OPERATIONS.has(operation)) {
            const action = contentActionSchema.safeParse(body);
            if (!action.success)
                throw new ForbiddenError(
                    "This agent connection can't resolve this content action.",
                );
            const items = [
                ...(action.data.content ?? []),
                ...(action.data.item ? [action.data.item] : []),
            ];
            const itemProjects = await Promise.all(
                items.map(async (item) => {
                    const types: Record<
                        ContentType,
                        OAuthGrantRouteResource['type']
                    > = {
                        [ContentType.CHART]:
                            item.source === ChartSourceType.SQL
                                ? 'sql_chart'
                                : 'saved_chart',
                        [ContentType.DASHBOARD]: 'dashboard',
                        [ContentType.SPACE]: 'space',
                        [ContentType.DOCUMENT]: 'document',
                        [ContentType.DATA_APP]: 'data_app',
                    };
                    const project = await this.deps.resolveResourceProjectUuid({
                        type: types[item.contentType],
                        uuid: item.uuid,
                        projectUuid: slugProjectUuid,
                    });
                    if (project === null)
                        throw new ForbiddenError(
                            "This agent connection can't use an unresolved project.",
                        );
                    return project;
                }),
            );
            projectUuids.push(...itemProjects);
            if (action.data.action?.targetSpaceUuid) {
                const project = await this.deps.resolveResourceProjectUuid({
                    type: 'space',
                    uuid: action.data.action.targetSpaceUuid,
                    projectUuid: slugProjectUuid,
                });
                if (project === null)
                    throw new ForbiddenError(
                        "This agent connection can't use an unresolved project.",
                    );
                projectUuids.push(project);
            }
        }
        if (operation !== null && UPSTREAM_OPERATIONS.has(operation)) {
            const upstreamProjects = await Promise.all(
                [...new Set(projectUuids)].map(async (projectUuid) => {
                    const upstream =
                        await this.deps.resolveUpstreamProjectUuid(projectUuid);
                    if (upstream === null)
                        throw new ForbiddenError(
                            "This agent connection can't use an unresolved project.",
                        );
                    return upstream;
                }),
            );
            projectUuids.push(...upstreamProjects);
        }
        assertAgentConnectionGrantOperation(req.account, {
            kind: 'rest',
            key: operation ?? 'unknown',
            projectUuids,
            deploymentOverrides: body,
        });
        return [...new Set(projectUuids)];
    }
}
