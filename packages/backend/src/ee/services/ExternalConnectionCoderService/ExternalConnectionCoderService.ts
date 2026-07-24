import { subject } from '@casl/ability';
import {
    CONTENT_AS_CODE_VERSIONS,
    ContentAsCodeType,
    EXTERNAL_CONNECTION_METHODS,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    PromotionAction,
    type CreateExternalConnection,
    type ExternalConnection,
    type ExternalConnectionAsCode,
    type ExternalConnectionMethod,
    type RegisteredAccount,
    type UpdateExternalConnection,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { type LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import { paginateAsCode } from '../../../services/CoderService/pagination';
import { type ExternalConnectionModel } from '../../models/ExternalConnectionModel';
import { type ExternalConnectionService } from '../ExternalConnectionService/ExternalConnectionService';

const EXTERNAL_CONNECTION_AS_CODE_VERSION =
    CONTENT_AS_CODE_VERSIONS.external_connection;
const EXTERNAL_CONNECTION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const sortMethods = (
    methods: ExternalConnectionMethod[],
): ExternalConnectionMethod[] =>
    [...methods].sort(
        (left, right) =>
            EXTERNAL_CONNECTION_METHODS.indexOf(left) -
            EXTERNAL_CONNECTION_METHODS.indexOf(right),
    );

const sortHeaders = (
    headers: Record<string, string> | null,
): Record<string, string> | null => {
    if (headers === null || Object.keys(headers).length === 0) return null;
    return Object.fromEntries(
        Object.entries(headers).sort(([left], [right]) =>
            left.localeCompare(right),
        ),
    );
};

/**
 * Collections are sorted for clean diffs on repeated downloads; empty
 * oauthScopes/customHeaders normalize to null to match what the model
 * persists, so a round-tripped document compares as unchanged.
 */
const toExternalConnectionAsCode = (
    connection: ExternalConnection,
): ExternalConnectionAsCode => ({
    contentType: ContentAsCodeType.EXTERNAL_CONNECTION,
    version: EXTERNAL_CONNECTION_AS_CODE_VERSION,
    slug: connection.slug,
    name: connection.name,
    type: connection.type,
    origin: connection.origin,
    instructions: connection.instructions,
    allowedPathPrefixes: [...connection.allowedPathPrefixes].sort(),
    allowedMethods: sortMethods(connection.allowedMethods),
    allowedContentTypes: [...connection.allowedContentTypes].sort(),
    responseMaxBytes: connection.responseMaxBytes,
    requestMaxBytes: connection.requestMaxBytes,
    timeoutMs: connection.timeoutMs,
    rateLimitPerMinute: connection.rateLimitPerMinute,
    apiKeyName: connection.apiKeyName,
    apiKeyLocation: connection.apiKeyLocation,
    oauthScopes: connection.oauthScopes?.length
        ? [...connection.oauthScopes].sort()
        : null,
    customHeaders: sortHeaders(connection.customHeaders),
});

const getComparableConnection = (document: ExternalConnectionAsCode) => ({
    slug: document.slug,
    name: document.name,
    type: document.type,
    origin: document.origin,
    instructions: document.instructions,
    allowedPathPrefixes: [...document.allowedPathPrefixes].sort(),
    allowedMethods: sortMethods(document.allowedMethods),
    allowedContentTypes: [...document.allowedContentTypes].sort(),
    responseMaxBytes: document.responseMaxBytes,
    requestMaxBytes: document.requestMaxBytes,
    timeoutMs: document.timeoutMs,
    rateLimitPerMinute: document.rateLimitPerMinute,
    apiKeyName: document.apiKeyName,
    apiKeyLocation: document.apiKeyLocation,
    oauthScopes: document.oauthScopes?.length
        ? [...document.oauthScopes].sort()
        : null,
    customHeaders: sortHeaders(document.customHeaders),
});

type Dependencies = {
    externalConnectionModel: ExternalConnectionModel;
    externalConnectionService: ExternalConnectionService;
    lightdashConfig: LightdashConfig;
};

export class ExternalConnectionCoderService extends BaseService {
    private readonly externalConnectionModel: ExternalConnectionModel;

    private readonly externalConnectionService: ExternalConnectionService;

    private readonly lightdashConfig: LightdashConfig;

    constructor({
        externalConnectionModel,
        externalConnectionService,
        lightdashConfig,
    }: Dependencies) {
        super({ serviceName: 'ExternalConnectionCoderService' });
        this.externalConnectionModel = externalConnectionModel;
        this.externalConnectionService = externalConnectionService;
        this.lightdashConfig = lightdashConfig;
    }

    /** Derive the org from the project — never trust the caller's org. */
    private async getProjectOrganizationUuid(
        projectUuid: string,
    ): Promise<string> {
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        return organizationUuid;
    }

    private async assertCanDownload(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<string> {
        const organizationUuid =
            await this.getProjectOrganizationUuid(projectUuid);
        const ability = this.createAuditedAbility(account);

        // Downloads require connection-manage (not just view): as-code files
        // exist to be edited and re-uploaded, which is a manage activity.
        if (
            ability.cannot(
                'view',
                subject('ContentAsCode', { organizationUuid, projectUuid }),
            ) ||
            ability.cannot(
                'manage',
                subject('ExternalConnection', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download external connections as code',
            );
        }

        return organizationUuid;
    }

    private async assertCanUpload(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<string> {
        const organizationUuid =
            await this.getProjectOrganizationUuid(projectUuid);
        const ability = this.createAuditedAbility(account);

        if (
            ability.cannot(
                'manage',
                subject('ContentAsCode', { organizationUuid, projectUuid }),
            ) ||
            ability.cannot(
                'manage',
                subject('ExternalConnection', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to upload external connections as code',
            );
        }

        return organizationUuid;
    }

    async downloadExternalConnections(
        account: RegisteredAccount,
        projectUuid: string,
        slugs?: string[],
        offset?: number,
    ): Promise<{
        externalConnections: ExternalConnectionAsCode[];
        missingSlugs: string[];
        total: number;
        offset: number;
    }> {
        const organizationUuid = await this.assertCanDownload(
            account,
            projectUuid,
        );

        const connections = await this.externalConnectionModel.list(
            projectUuid,
            organizationUuid,
        );
        const filtered =
            slugs === undefined
                ? connections
                : connections.filter(({ slug }) => slugs.includes(slug));
        const missingSlugs =
            slugs?.filter(
                (slug) =>
                    !connections.some((connection) => connection.slug === slug),
            ) ?? [];

        const sorted = [...filtered].sort((left, right) =>
            left.slug.localeCompare(right.slug),
        );
        const page = paginateAsCode({
            items: sorted,
            offset,
            pageSize: this.lightdashConfig.contentAsCode.maxDownloads,
        });

        return {
            externalConnections: page.page.map(toExternalConnectionAsCode),
            missingSlugs,
            total: page.total,
            offset: page.offset,
        };
    }

    async upsertExternalConnection(
        account: RegisteredAccount,
        projectUuid: string,
        slug: string,
        connection: ExternalConnectionAsCode,
        secret?: string,
        force = false,
    ): Promise<{
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    }> {
        const organizationUuid = await this.assertCanUpload(
            account,
            projectUuid,
        );

        if (connection.contentType !== ContentAsCodeType.EXTERNAL_CONNECTION) {
            throw new ParameterError(
                `Invalid content type for external connection '${slug}'`,
            );
        }
        if (connection.version !== EXTERNAL_CONNECTION_AS_CODE_VERSION) {
            throw new ParameterError(
                `Unsupported external connection as-code version ${connection.version}`,
            );
        }
        if (connection.slug !== slug) {
            throw new ParameterError(
                `External connection slug '${connection.slug}' does not match the request path '${slug}'`,
            );
        }
        if (!EXTERNAL_CONNECTION_SLUG_PATTERN.test(slug)) {
            throw new ParameterError(
                `Invalid external connection slug '${slug}'`,
            );
        }

        const existing = await this.externalConnectionModel.findBySlug(
            projectUuid,
            organizationUuid,
            slug,
        );

        if (!existing) {
            const createData: CreateExternalConnection = {
                name: connection.name,
                type: connection.type,
                origin: connection.origin,
                instructions: connection.instructions,
                allowedPathPrefixes: connection.allowedPathPrefixes,
                allowedMethods: connection.allowedMethods,
                allowedContentTypes: connection.allowedContentTypes,
                responseMaxBytes: connection.responseMaxBytes,
                requestMaxBytes: connection.requestMaxBytes,
                timeoutMs: connection.timeoutMs,
                rateLimitPerMinute: connection.rateLimitPerMinute,
                apiKeyName: connection.apiKeyName,
                apiKeyLocation: connection.apiKeyLocation,
                oauthScopes: connection.oauthScopes,
                customHeaders: connection.customHeaders,
                ...(secret !== undefined ? { secret } : {}),
            };
            // Domain validation (secret requirements, origin/method/header
            // rules) runs in the delegated service — the single write path.
            await this.externalConnectionService.create(
                account,
                projectUuid,
                createData,
                { slug },
            );
            return { action: PromotionAction.CREATE };
        }

        const configUnchanged = isEqual(
            getComparableConnection(toExternalConnectionAsCode(existing)),
            getComparableConnection(connection),
        );

        if (configUnchanged && !force) {
            if (secret === undefined) {
                return { action: PromotionAction.NO_CHANGES };
            }
            // Secret idempotency: comparing against the stored plaintext keeps
            // repeated CI uploads (env var always set) at NO_CHANGES. Nothing
            // secret-derived leaves this method — only the action enum.
            const storedSecret =
                await this.externalConnectionModel.getDecryptedSecret(
                    existing.externalConnectionUuid,
                );
            if (storedSecret === secret) {
                return { action: PromotionAction.NO_CHANGES };
            }
            await this.externalConnectionService.update(
                account,
                projectUuid,
                existing.externalConnectionUuid,
                { secret },
            );
            return { action: PromotionAction.UPDATE };
        }

        const updateData: UpdateExternalConnection = {
            name: connection.name,
            type: connection.type,
            origin: connection.origin,
            instructions: connection.instructions,
            allowedPathPrefixes: connection.allowedPathPrefixes,
            allowedMethods: connection.allowedMethods,
            allowedContentTypes: connection.allowedContentTypes,
            responseMaxBytes: connection.responseMaxBytes,
            requestMaxBytes: connection.requestMaxBytes,
            timeoutMs: connection.timeoutMs,
            rateLimitPerMinute: connection.rateLimitPerMinute,
            apiKeyName: connection.apiKeyName,
            apiKeyLocation: connection.apiKeyLocation,
            oauthScopes: connection.oauthScopes,
            customHeaders: connection.customHeaders,
            ...(secret !== undefined ? { secret } : {}),
        };
        // Full-field patch so the service's merged validation sees the
        // complete post-write config; its tri-state secret semantics apply
        // (a type change without a new secret fails loudly there).
        await this.externalConnectionService.update(
            account,
            projectUuid,
            existing.externalConnectionUuid,
            updateData,
        );
        return { action: PromotionAction.UPDATE };
    }
}
