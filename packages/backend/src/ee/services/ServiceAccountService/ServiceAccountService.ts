import { subject } from '@casl/ability';
import {
    AuthTokenPrefix,
    CreateServiceAccount,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    ServiceAccount,
    ServiceAccountScope,
    ServiceAccountWithToken,
    SessionServiceAccount,
    SessionUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';

import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../../config/parseConfig';
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
};

export class ServiceAccountService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly serviceAccountModel: ServiceAccountModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    constructor({
        lightdashConfig,
        analytics,
        serviceAccountModel,
        commercialFeatureFlagModel,
    }: ServiceAccountServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.serviceAccountModel = serviceAccountModel;
        this.commercialFeatureFlagModel = commercialFeatureFlagModel;
    }

    private static throwForbiddenErrorOnNoPermission(user: SessionUser) {
        if (
            user.ability.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
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
        try {
            ServiceAccountService.throwForbiddenErrorOnNoPermission(user);
            const token = await this.serviceAccountModel.create({
                user,
                data: {
                    organizationUuid: tokenDetails.organizationUuid,
                    expiresAt: tokenDetails.expiresAt,
                    description: tokenDetails.description,
                    scopes: tokenDetails.scopes,
                },
                prefix,
            });
            this.analytics.track<ScimAccessTokenEvent>({
                event: 'scim_access_token.created',
                userId: user.userUuid,
                properties: {
                    organizationId: token.organizationUuid,
                },
            });
            return token;
        } catch (error) {
            if (error instanceof ForbiddenError) {
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
            ServiceAccountService.throwForbiddenErrorOnNoPermission(user);
            const organizationUuid = user.organizationUuid as string;
            // get by uuid to check if token exists
            const token = await this.serviceAccountModel.getTokenbyUuid(
                tokenUuid,
            );
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
        ServiceAccountService.throwForbiddenErrorOnNoPermission(user);

        if (update.expiresAt.getTime() < Date.now()) {
            throw new ParameterError('Expire time must be in the future');
        }

        // get by uuid to check if token exists
        const existingToken = await this.serviceAccountModel.getTokenbyUuid(
            tokenUuid,
        );
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
        ServiceAccountService.throwForbiddenErrorOnNoPermission(user);

        // get by uuid to check if token exists
        const existingToken = await this.serviceAccountModel.getTokenbyUuid(
            tokenUuid,
        );
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
    ): Promise<ServiceAccount[]> {
        try {
            ServiceAccountService.throwForbiddenErrorOnNoPermission(user);
            const organizationUuid = user.organizationUuid as string;
            const tokens = await this.serviceAccountModel.getAllForOrganization(
                organizationUuid,
                scopes,
            );
            return tokens;
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

    async authenticateScim(
        token: string,
        request: {
            method: string;
            path: string;
            routePath: string;
        },
    ): Promise<SessionServiceAccount | null> {
        // return null if token is empty
        if (token === '') return null;

        try {
            const dbToken = await this.serviceAccountModel.getByToken(token);
            if (dbToken) {
                // return null if expired
                if (dbToken.expiresAt && dbToken.expiresAt < new Date()) {
                    return null;
                }

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
                // Update last used date
                await this.serviceAccountModel.updateUsedDate(dbToken.uuid);
                // finally return organization uuid
                return {
                    organizationUuid: dbToken.organizationUuid,
                };
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

                // Update last used date
                await this.serviceAccountModel.updateUsedDate(dbToken.uuid);
                // finally return organization uuid
                return dbToken;
            }
        } catch (error) {
            return null;
        }
        return null;
    }
}
