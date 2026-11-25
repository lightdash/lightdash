import { subject } from '@casl/ability';
import {
    Account,
    CreatePersonalAccessToken,
    ForbiddenError,
    ParameterError,
    PersonalAccessToken,
    PersonalAccessTokenWithToken,
    RequestMethod,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import {
    assertOAuthCredentialOperationAllowed,
    CLI_OAUTH_PAT_COMPAT_MAX_DAYS,
    isCliOAuthPatCompatCandidate,
    logCliOAuthPatCompatUsed,
} from '../auth/oauthScopes/credentials';
import { resolveOAuthSecurityStrict } from '../auth/oauthScopes/security';
import { LightdashConfig } from '../config/parseConfig';
import { PersonalAccessTokenModel } from '../models/DashboardModel/PersonalAccessTokenModel';
import { type FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from './BaseService';

const DAY_MS = 24 * 60 * 60 * 1000;

type PersonalAccessTokenServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    personalAccessTokenModel: PersonalAccessTokenModel;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
};

export class PersonalAccessTokenService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly personalAccessTokenModel: PersonalAccessTokenModel;

    private readonly featureFlagModel: Pick<FeatureFlagModel, 'get'>;

    constructor(args: PersonalAccessTokenServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.personalAccessTokenModel = args.personalAccessTokenModel;
        this.featureFlagModel = args.featureFlagModel;
    }

    private async isCliOAuthPatCompat(account: Account): Promise<boolean> {
        if (!isCliOAuthPatCompatCandidate(account) || !this.featureFlagModel)
            return false;
        const strict = await resolveOAuthSecurityStrict(this.featureFlagModel, {
            userUuid: account.user.id,
            organizationUuid: account.organization.organizationUuid,
        });
        return !strict;
    }

    private capCliOAuthPatExpiry(expiresAt: Date | string | null): Date {
        const now = Date.now();
        const { maxExpirationTimeInDays } = this.lightdashConfig.auth.pat;
        const requested = expiresAt ? new Date(expiresAt).getTime() : NaN;
        return new Date(
            Math.min(
                now + CLI_OAUTH_PAT_COMPAT_MAX_DAYS * DAY_MS,
                ...(maxExpirationTimeInDays
                    ? [now + maxExpirationTimeInDays * DAY_MS]
                    : []),
                ...(Number.isNaN(requested) ? [] : [requested]),
            ),
        );
    }

    private throwIfExpirationTimeIsInvalid(expiresAt: string | Date | null) {
        const expiresAtDate = expiresAt ? new Date(expiresAt) : null;

        if (expiresAtDate && expiresAtDate.getTime() < Date.now()) {
            throw new ParameterError('Expire time must be in the future');
        }

        const { maxExpirationTimeInDays } = this.lightdashConfig.auth.pat;
        if (maxExpirationTimeInDays) {
            // Use calendar days to avoid DST issues
            const maxDate = new Date();
            maxDate.setDate(maxDate.getDate() + maxExpirationTimeInDays);
            maxDate.setHours(23, 59, 59, 999); // End of day to be more lenient

            if (!expiresAtDate || expiresAtDate.getTime() > maxDate.getTime()) {
                throw new ParameterError(
                    `Expiration time can't be greater than ${maxExpirationTimeInDays} days`,
                );
            }
        }
    }

    async createPersonalAccessToken(
        account: Account,
        data: CreatePersonalAccessToken,
        method: RequestMethod,
    ): Promise<PersonalAccessTokenWithToken> {
        const cliPatCompat = await this.isCliOAuthPatCompat(account);
        if (!cliPatCompat)
            assertOAuthCredentialOperationAllowed(
                account,
                'createPersonalAccessToken',
            );
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'create',
                subject('PersonalAccessToken', {
                    organizationUuid: account.organization.organizationUuid!,
                    metadata: { userUuid: account.user.id },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to create a personal access token',
            );
        }

        const tokenData = cliPatCompat
            ? { ...data, expiresAt: this.capCliOAuthPatExpiry(data.expiresAt) }
            : data;
        // validate expiration time
        this.throwIfExpirationTimeIsInvalid(tokenData.expiresAt);

        if (account.user.type !== 'registered') {
            throw new ForbiddenError(
                'Anonymous accounts cannot create personal access tokens',
            );
        }
        const result = await this.personalAccessTokenModel.create(
            { userId: account.user.userId },
            tokenData,
        );
        if (cliPatCompat && tokenData.expiresAt)
            logCliOAuthPatCompatUsed(account, tokenData.expiresAt);
        this.analytics.track({
            userId: account.user.id,
            event: 'personal_access_token.created',
            properties: {
                userId: account.user.id,
                autoGenerated: data.autoGenerated,
                method,
            },
        });
        return result;
    }

    async deletePersonalAccessToken(
        account: Account,
        personalAccessTokenUuid: string,
    ): Promise<void> {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'delete',
                subject('PersonalAccessToken', {
                    organizationUuid: account.organization.organizationUuid!,
                    metadata: {
                        userUuid: account.user.id,
                        personalAccessTokenUuid,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to delete a personal access token',
            );
        }

        await this.personalAccessTokenModel.delete(personalAccessTokenUuid);
        this.analytics.track({
            userId: account.user.id,
            event: 'personal_access_token.deleted',
        });
    }

    async getAllPersonalAccessTokens(
        account: Account,
    ): Promise<PersonalAccessToken[]> {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('PersonalAccessToken', {
                    organizationUuid: account.organization.organizationUuid!,
                    metadata: { userUuid: account.user.id },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view personal access tokens',
            );
        }
        if (account.user.type !== 'registered') {
            throw new ForbiddenError(
                'Anonymous accounts cannot view personal access tokens',
            );
        }
        return this.personalAccessTokenModel.getAllForUser(account.user.userId);
    }

    async rotatePersonalAccessToken(
        account: Account,
        personalAccessTokenUuid: string,
        data: { expiresAt: Date },
    ): Promise<PersonalAccessTokenWithToken> {
        assertOAuthCredentialOperationAllowed(
            account,
            'rotatePersonalAccessToken',
        );
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'update',
                subject('PersonalAccessToken', {
                    organizationUuid: account.organization.organizationUuid!,
                    metadata: {
                        userUuid: account.user.id,
                        personalAccessTokenUuid,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to rotate a personal access token',
            );
        }

        // validate expiration time
        this.throwIfExpirationTimeIsInvalid(data.expiresAt);

        const existingToken = await this.personalAccessTokenModel.getUserToken({
            userUuid: account.user.id,
            tokenUuid: personalAccessTokenUuid,
        });

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

        const newToken = await this.personalAccessTokenModel.rotate({
            personalAccessTokenUuid,
            expiresAt: data.expiresAt,
        });
        this.analytics.track({
            userId: account.user.id,
            event: 'personal_access_token.rotated',
        });
        return newToken;
    }
}
