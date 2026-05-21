import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    AuthTokenPrefix,
    CreateServiceAccount,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    ServiceAccount,
    ServiceAccountProjectGrant,
    ServiceAccountScope,
    ServiceAccountWithProjectAccessCount,
    ServiceAccountWithToken,
    SessionUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../../config/parseConfig';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import {
    ScimAccessTokenAuthenticationEvent,
    ScimAccessTokenEvent,
} from '../../analytics';
import { CommercialFeatureFlagModel } from '../../models/CommercialFeatureFlagModel';
import { ServiceAccountModel } from '../../models/ServiceAccountModel';

type ServiceAccountServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    serviceAccountModel: ServiceAccountModel;
    commercialFeatureFlagModel: CommercialFeatureFlagModel;
    projectModel: ProjectModel;
};

function isSameMinute(a: Date | null, b: Date): boolean {
    if (!a) return false;
    return Math.floor(a.getTime() / 60000) === Math.floor(b.getTime() / 60000);
}

export class ServiceAccountService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly serviceAccountModel: ServiceAccountModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    private readonly projectModel: ProjectModel;

    constructor({
        lightdashConfig,
        analytics,
        serviceAccountModel,
        commercialFeatureFlagModel,
        projectModel,
    }: ServiceAccountServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.serviceAccountModel = serviceAccountModel;
        this.commercialFeatureFlagModel = commercialFeatureFlagModel;
        this.projectModel = projectModel;
    }

    private throwForbiddenErrorOnNoPermission(user: SessionUser) {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid!,
                }),
            )
        ) {
            throw new ForbiddenError('You do not have permission');
        }
    }

    async create({
        user,
        tokenDetails,
        prefix = AuthTokenPrefix.SCIM,
    }: {
        user: SessionUser;
        tokenDetails: CreateServiceAccount;
        prefix?: string;
    }): Promise<ServiceAccount> {
        // Project-scope create: validate before touching the DB so a malformed
        // request can't half-create an SA. The invariant is "Member-scoped SA
        // must have ≥1 project from the moment it exists", so we refuse any
        // shape that doesn't fit.
        const projectAccess = tokenDetails.projectAccess ?? [];
        if (projectAccess.length > 0) {
            const scopes = tokenDetails.scopes ?? [];
            const isMemberOnly =
                scopes.length === 1 &&
                scopes[0] === ServiceAccountScope.SYSTEM_MEMBER;
            if (!isMemberOnly) {
                throw new ParameterError(
                    'projectAccess can only be set when scopes = [system:member]',
                );
            }
            // Each grant carries exactly one of `role` (system) or
            // `roleUuid` (custom). The TS discriminated union covers
            // compile-time callers, but request bodies arrive as JSON, so
            // we double-check at the boundary.
            for (const grant of projectAccess) {
                const hasRole = grant.role !== undefined;
                const hasRoleUuid = grant.roleUuid !== undefined;
                if (hasRole === hasRoleUuid) {
                    throw new ParameterError(
                        'Each projectAccess grant must specify exactly one of role or roleUuid',
                    );
                }
            }
            // Bulk-validate custom-role grants belong to the SA's org.
            // Doing this before the SA insert avoids creating an SA that
            // we'd then have to compensate-delete.
            const customRoleUuids = projectAccess
                .map((g) => g.roleUuid)
                .filter((u): u is string => u !== undefined);
            if (customRoleUuids.length > 0) {
                const invalid =
                    await this.projectModel.findInvalidCustomRoleUuids(
                        customRoleUuids,
                        tokenDetails.organizationUuid,
                    );
                if (invalid.length > 0) {
                    throw new ParameterError(
                        `Unknown role uuid(s) for this organization: ${invalid.join(
                            ', ',
                        )}`,
                    );
                }
            }
        }

        try {
            this.throwForbiddenErrorOnNoPermission(user);
            const token = await this.serviceAccountModel.create({
                user,
                data: {
                    organizationUuid: tokenDetails.organizationUuid,
                    expiresAt: tokenDetails.expiresAt,
                    description: tokenDetails.description,
                    scopes: tokenDetails.scopes,
                    roleUuid: tokenDetails.roleUuid,
                },
                prefix,
            });

            // Apply project grants if any were requested. Compensating-action
            // pattern: if any grant fails (cross-org, duplicate, missing
            // project) we delete the just-created SA and rethrow so a
            // Member-scoped SA is never left in a zero-project state.
            if (projectAccess.length > 0) {
                try {
                    for (const grant of projectAccess) {
                        // eslint-disable-next-line no-await-in-loop
                        await this.projectModel.createServiceAccountProjectAccess(
                            grant.projectUuid,
                            token.uuid,
                            { role: grant.role, roleUuid: grant.roleUuid },
                        );
                    }
                } catch (grantError) {
                    await this.serviceAccountModel
                        .delete(token.uuid)
                        .catch((cleanupError) => {
                            // Cleanup failed AFTER an SA was created. The SA
                            // now exists with no project grants, violating the
                            // "Member-scoped SA must have ≥1 project"
                            // invariant. Surface the original grantError to
                            // the caller, but log the orphan so an operator
                            // can find and remove it from the DB.
                            this.logger.error(
                                'Failed to clean up service account after projectAccess insert failed; orphaned Member SA may exist',
                                {
                                    serviceAccountUuid: token.uuid,
                                    grantError,
                                    cleanupError,
                                },
                            );
                        });
                    throw grantError;
                }
            }

            this.analytics.track<ScimAccessTokenEvent>({
                event: 'scim_access_token.created',
                userId: user.userUuid,
                properties: {
                    organizationId: token.organizationUuid,
                },
            });
            return token;
        } catch (error) {
            // Pass through recognised user-facing errors so the caller sees
            // the right HTTP code (400/404/409). Without this, errors from
            // the projectAccess loop (NotFoundError for a bogus project,
            // AlreadyExistsError for a duplicate grant) get re-wrapped as
            // UnexpectedDatabaseError → 500.
            if (
                error instanceof ForbiddenError ||
                error instanceof ParameterError ||
                error instanceof NotFoundError ||
                error instanceof AlreadyExistsError
            ) {
                throw error;
            }
            this.logger.error(
                `Failed to create organization access token: ${error}`,
            );

            throw new UnexpectedDatabaseError(
                'Failed to create organization access token',
            );
        }
    }

    async delete({
        user,
        tokenUuid,
    }: {
        user: SessionUser;
        tokenUuid: string;
    }): Promise<void> {
        try {
            this.throwForbiddenErrorOnNoPermission(user);
            const organizationUuid = user.organizationUuid as string;
            // get by uuid to check if token exists
            const token =
                await this.serviceAccountModel.getTokenbyUuid(tokenUuid);
            if (!token) {
                throw new NotFoundError(
                    `Token with UUID ${tokenUuid} not found`,
                );
            }
            // throw forbidden if token does not belong to organization
            if (token.organizationUuid !== organizationUuid) {
                throw new ForbiddenError(
                    "Token doesn't belong to organization",
                );
            }
            await this.serviceAccountModel.delete(tokenUuid);
            this.analytics.track<ScimAccessTokenEvent>({
                event: 'scim_access_token.deleted',
                userId: user.userUuid,
                properties: {
                    organizationId: token.organizationUuid,
                },
            });
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof ForbiddenError
            ) {
                throw error;
            }
            this.logger.error(
                `Failed to delete organization access token: ${error}`,
            );
            throw new UnexpectedDatabaseError(
                'Failed to delete organization access token',
            );
        }
    }

    async rotate({
        user,
        tokenUuid,
        update,
        prefix = AuthTokenPrefix.SCIM,
    }: {
        user: SessionUser;
        tokenUuid: string;
        update: { expiresAt: Date };
        prefix?: string;
    }): Promise<ServiceAccountWithToken> {
        this.throwForbiddenErrorOnNoPermission(user);

        if (update.expiresAt.getTime() < Date.now()) {
            throw new ParameterError('Expire time must be in the future');
        }

        // get by uuid to check if token exists
        const existingToken =
            await this.serviceAccountModel.getTokenbyUuid(tokenUuid);
        if (!existingToken) {
            throw new NotFoundError(`Token with UUID ${tokenUuid} not found`);
        }
        // throw forbidden if token does not belong to organization
        if (existingToken.organizationUuid !== user.organizationUuid) {
            throw new ForbiddenError("Token doesn't belong to organization");
        }

        // Business decision, we don't want to rotate tokens that don't expire. Rotation is a security feature that should be used with tokens that expire.
        if (!existingToken.expiresAt) {
            throw new ParameterError(
                'Token with no expiration date cannot be rotated',
            );
        }

        if (
            existingToken.rotatedAt &&
            existingToken.rotatedAt.getTime() > Date.now() - 3600000
        ) {
            throw new ParameterError('Token can only be rotated once per hour');
        }

        const newToken = await this.serviceAccountModel.rotate({
            serviceAccountUuid: tokenUuid,
            rotatedByUserUuid: user.userUuid,
            expiresAt: update.expiresAt,
            prefix,
        });
        this.analytics.track<ScimAccessTokenEvent>({
            event: 'scim_access_token.rotated',
            userId: user.userUuid,
            properties: {
                organizationId: existingToken.organizationUuid,
            },
        });
        return newToken;
    }

    async get({
        user,
        tokenUuid,
    }: {
        user: SessionUser;
        tokenUuid: string;
    }): Promise<ServiceAccount> {
        this.throwForbiddenErrorOnNoPermission(user);

        // get by uuid to check if token exists
        const existingToken =
            await this.serviceAccountModel.getTokenbyUuid(tokenUuid);
        if (!existingToken) {
            throw new NotFoundError(`Token with UUID ${tokenUuid} not found`);
        }
        // throw forbidden if token does not belong to organization
        if (existingToken.organizationUuid !== user.organizationUuid) {
            throw new ForbiddenError("Token doesn't belong to organization");
        }
        return existingToken;
    }

    async list(
        user: SessionUser,
        scopes: ServiceAccountScope[],
    ): Promise<ServiceAccountWithProjectAccessCount[]> {
        try {
            this.throwForbiddenErrorOnNoPermission(user);
            const organizationUuid = user.organizationUuid as string;
            const tokens = await this.serviceAccountModel.getAllForOrganization(
                organizationUuid,
                scopes,
            );
            // Project-grant counts are batched into one GROUP BY so the SA
            // list doesn't trigger an N+1. Zero for SAs with no grants
            // (the common case for Organization-scope SAs).
            const userUuids = tokens
                .map((t) => t.userUuid)
                .filter((u): u is string => typeof u === 'string');
            const counts =
                await this.projectModel.getProjectAccessCountsByServiceAccountUserUuids(
                    userUuids,
                );
            return tokens.map((t) => ({
                ...t,
                projectAccessCount: counts.get(t.userUuid) ?? 0,
            }));
        } catch (error) {
            if (error instanceof ForbiddenError) {
                throw error;
            }
            this.logger.error(
                `Failed to list organization access tokens: ${error}`,
            );

            throw new UnexpectedDatabaseError(
                'Failed to list organization access tokens',
            );
        }
    }

    /**
     * Per-SA list of project grants for the org SA list's expand panel.
     *
     * Same perm gate as the parent SA list (`manage:Organization`) — anyone
     * who can see the SA can see its grants. We validate the SA actually
     * belongs to the caller's org before reading so a cross-org UUID can't
     * be used to probe another org's SA layout (404, not 403, since the
     * resource is genuinely unreachable from this caller's POV).
     */
    async getProjectGrants(
        user: SessionUser,
        serviceAccountUuid: string,
    ): Promise<ServiceAccountProjectGrant[]> {
        this.throwForbiddenErrorOnNoPermission(user);
        const sa =
            await this.serviceAccountModel.getTokenbyUuid(serviceAccountUuid);
        if (!sa || sa.organizationUuid !== user.organizationUuid) {
            throw new NotFoundError(
                `Service account ${serviceAccountUuid} not found`,
            );
        }
        return this.projectModel.getServiceAccountProjectGrants(
            serviceAccountUuid,
        );
    }

    async authenticateScim(
        token: string,
        request: {
            method: string;
            path: string;
            routePath: string;
        },
    ): Promise<ServiceAccount | null> {
        // return null if token is empty
        if (token === '') return null;

        try {
            const dbToken = await this.serviceAccountModel.getByToken(token);
            if (dbToken) {
                // return null if expired
                if (dbToken.expiresAt && dbToken.expiresAt < new Date()) {
                    return null;
                }

                this.logger.info('SCIM: access token authenticated', {
                    serviceAccountUuid: dbToken.uuid,
                    organizationUuid: dbToken.organizationUuid,
                    description: dbToken.description,
                    requestMethod: request.method,
                    requestRoutePath: request.routePath,
                });
                this.analytics.track<ScimAccessTokenAuthenticationEvent>({
                    event: 'scim_access_token.authenticated',
                    anonymousId: LightdashAnalytics.anonymousId,
                    properties: {
                        organizationId: dbToken.organizationUuid,
                        requestMethod: request.method,
                        requestPath: request.path,
                        requestRoutePath: request.routePath,
                    },
                });
                // Update last used date (throttled to once per minute)
                if (!isSameMinute(dbToken.lastUsedAt, new Date())) {
                    await this.serviceAccountModel.updateUsedDate(dbToken.uuid);
                }
                return dbToken;
            }
        } catch (error) {
            return null;
        }
        return null;
    }

    async authenticateServiceAccount(
        token: string,
    ): Promise<ServiceAccount | null> {
        // return null if token is empty
        if (token === '') return null;

        try {
            const dbToken = await this.serviceAccountModel.getByToken(token);
            if (dbToken) {
                // return null if expired
                if (dbToken.expiresAt && dbToken.expiresAt < new Date()) {
                    return null;
                }

                // TODO add analytics

                // Update last used date (throttled to once per minute)
                if (!isSameMinute(dbToken.lastUsedAt, new Date())) {
                    await this.serviceAccountModel.updateUsedDate(dbToken.uuid);
                }
                // finally return organization uuid
                return dbToken;
            }
        } catch (error) {
            return null;
        }
        return null;
    }
}
