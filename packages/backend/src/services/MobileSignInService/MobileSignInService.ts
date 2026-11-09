import {
    ConflictError,
    FeatureFlags,
    ForbiddenError,
    formatMobileSignInMatchNumber,
    LightdashMode,
    MOBILE_PLATFORMS,
    MOBILE_SIGN_IN_PATH,
    MOBILE_SIGN_IN_REDEEM_INTERVAL_SECONDS,
    MobileSignInCodeStatus,
    MobileSignInRefusal,
    NotFoundError,
    TooManyRequestsError,
    type MobileSignInClaimResponse,
    type MobileSignInCode,
    type MobileSignInCodeState,
    type MobileSignInDecision,
    type MobileSignInMintReason,
    type MobileSignInPlatform,
    type SessionUser,
} from '@lightdash/common';
import { type Request } from 'express';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import {
    createAuditLogEvent,
    type AuditContext,
    type AuditStatusType,
} from '../../logging/auditLog';
import { createActorFromUser } from '../../logging/caslAuditWrapper';
import Logger from '../../logging/logger';
import { logAuditEvent } from '../../logging/winston';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import {
    hashMobileAppLinkKey,
    MobileAppLinkModel,
} from '../../models/MobileAppLinkModel';
import {
    isMobileSignInCode,
    MobileSignInCodeModel,
    type MobileSignInCodeOwner,
} from '../../models/MobileSignInCodeModel';
import { isMobileOAuthClient, OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { getClientAddress } from '../../utils/clientAddress';
import { BaseService } from '../BaseService';
import type { UserService } from '../UserService';
import { MobileSignInOAuthError } from './MobileSignInOAuthError';

const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const MATCH_NUMBER_PATTERN = /^[0-9]{2}$/;
export const QR_SIGN_IN_DISABLED_MESSAGE =
    'Sign in with a QR code is turned off for this organization';

type RedeemArgs = {
    code: string;
    clientId: string;
    codeVerifier: unknown;
    matchNumber: unknown;
    isScopeAllowed: (user: SessionUser) => Promise<boolean>;
};

const SUPPORTED_MODES: LightdashMode[] = [
    LightdashMode.CLOUD_BETA,
    LightdashMode.PR,
];

const UNAVAILABLE_REFUSALS: MobileSignInRefusal[] = [
    MobileSignInRefusal.FEATURE_DISABLED,
    MobileSignInRefusal.QR_SIGN_IN_DISABLED,
];

const PHONE_REFUSAL_DESCRIPTIONS: Partial<Record<MobileSignInRefusal, string>> =
    {
        [MobileSignInRefusal.MANAGED_SIGN_IN_REQUIRED]:
            'managed_sign_in_required',
        [MobileSignInRefusal.QR_SIGN_IN_DISABLED]: 'qr_sign_in_disabled',
        [MobileSignInRefusal.FEATURE_DISABLED]: 'feature_disabled',
    };

const UNCOUNTED_REDEEM_ERRORS: MobileSignInOAuthError['error'][] = [
    'authorization_pending',
    'slow_down',
];

type RateLimit = {
    scope: string;
    limit: number;
    windowSeconds: number;
};

type RateLimitResult =
    | { allowed: true }
    | { allowed: false; retryAfterSeconds: number };

export const MOBILE_SIGN_IN_RATE_LIMITS = {
    mintPerUser: {
        scope: 'mobile_sign_in.mint.user',
        limit: 40,
        windowSeconds: 3600,
    },
    claimPerIp: {
        scope: 'mobile_sign_in.claim.ip',
        limit: 20,
        windowSeconds: 60,
    },
    redeemPerIp: {
        scope: 'mobile_sign_in.redeem.ip',
        limit: 60,
        windowSeconds: 60,
    },
} satisfies Record<string, RateLimit>;

export const maskDisplayName = (
    firstName: string | undefined,
    lastName: string | undefined,
): string => {
    const first = Array.from(firstName?.trim() ?? '');
    const last = Array.from(lastName?.trim() ?? '');
    const maskedFirst =
        first.length > 0 ? `${first.slice(0, 2).join('')}•••` : '';
    const maskedLast = last.length > 0 ? `${last[0].toUpperCase()}.` : '';
    return [maskedFirst, maskedLast].filter(Boolean).join(' ') || '•••';
};

export type MobileSignInRequestContext = {
    ip?: string;
    userAgent?: string;
};

export type MobileSignInRedemption = {
    user: SessionUser;
    metadata: {
        codeUuid: string;
        clientId: string | null;
        reportedPlatform: string | null;
    };
};

type MobileSignInServiceArguments = {
    lightdashConfig: Pick<
        LightdashConfig,
        'siteUrl' | 'smtp' | 'trustProxy' | 'mode'
    >;
    mobileSignInCodeModel: MobileSignInCodeModel;
    mobileAppLinkModel: Pick<
        MobileAppLinkModel,
        'incrementRateCounter' | 'getRateCount'
    >;
    now?: () => Date;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    userModel: Pick<UserModel, 'findSessionUserAndOrgByUuid'>;
    oauthModel: Pick<OAuth2Model, 'getClient'>;
    getUserService: () => Pick<UserService, 'getManagedSignIn'>;
    analytics: Pick<LightdashAnalytics, 'track'>;
};

type TrackedCode = {
    codeUuid: string;
    userUuid: string;
    organizationUuid: string;
    platform: string | null;
};

export class MobileSignInService extends BaseService {
    private readonly lightdashConfig: MobileSignInServiceArguments['lightdashConfig'];

    private readonly mobileSignInCodeModel: MobileSignInCodeModel;

    private readonly mobileAppLinkModel: MobileSignInServiceArguments['mobileAppLinkModel'];

    private readonly now: () => Date;

    private readonly featureFlagModel: MobileSignInServiceArguments['featureFlagModel'];

    private readonly userModel: MobileSignInServiceArguments['userModel'];

    private readonly oauthModel: MobileSignInServiceArguments['oauthModel'];

    private readonly getUserService: MobileSignInServiceArguments['getUserService'];

    private readonly analytics: MobileSignInServiceArguments['analytics'];

    constructor(args: MobileSignInServiceArguments) {
        super({ serviceName: 'MobileSignInService' });
        this.lightdashConfig = args.lightdashConfig;
        this.mobileSignInCodeModel = args.mobileSignInCodeModel;
        this.mobileAppLinkModel = args.mobileAppLinkModel;
        this.now = args.now ?? (() => new Date());
        this.featureFlagModel = args.featureFlagModel;
        this.userModel = args.userModel;
        this.oauthModel = args.oauthModel;
        this.getUserService = args.getUserService;
        this.analytics = args.analytics;
    }

    private track(
        event:
            | 'mobile_sign_in_code.created'
            | 'mobile_sign_in_code.claimed'
            | 'mobile_sign_in_code.approved'
            | 'mobile_sign_in_code.declined'
            | 'mobile_sign_in_code.redeemed',
        code: TrackedCode,
        extra: {
            reason?: MobileSignInMintReason;
            declinedBy?: 'web' | 'failed_redeems';
        } = {},
    ): void {
        this.analytics.track({
            event,
            userId: code.userUuid,
            properties: {
                organizationId: code.organizationUuid,
                codeUuid: code.codeUuid,
                reason: extra.reason ?? null,
                platform: code.platform,
                declinedBy: extra.declinedBy ?? null,
            },
        });
    }

    private static audit(
        user: SessionUser,
        action:
            | 'mobile_sign_in_approve'
            | 'mobile_sign_in_decline'
            | 'mobile_sign_in_redeem',
        status: AuditStatusType,
        metadata: Record<string, unknown>,
        context: AuditContext,
        reason?: string,
    ): void {
        try {
            logAuditEvent(
                createAuditLogEvent(
                    createActorFromUser(user),
                    action,
                    {
                        type: 'Session',
                        organizationUuid: user.organizationUuid ?? 'unknown',
                        metadata,
                    },
                    context,
                    status,
                    reason,
                ),
            );
        } catch (error) {
            Logger.warn('Failed to log mobile sign-in audit event', {
                error: error instanceof Error ? error.message : String(error),
                action,
            });
        }
    }

    getClientAddress(req: Pick<Request, 'socket' | 'get'>): string {
        return getClientAddress(req, this.lightdashConfig.trustProxy);
    }

    private async isEnabled(organizationUuid: string): Promise<boolean> {
        const flag = await this.featureFlagModel.get({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.MobileSettings,
        });
        return flag.enabled;
    }

    private async isQrSignInEnabled(
        organizationUuid: string,
    ): Promise<boolean> {
        const flag = await this.featureFlagModel.get({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.MobileQrSignIn,
        });
        return flag.enabled;
    }

    private static refusalError(refusal: MobileSignInRefusal): ForbiddenError {
        return new ForbiddenError(
            refusal === MobileSignInRefusal.QR_SIGN_IN_DISABLED
                ? QR_SIGN_IN_DISABLED_MESSAGE
                : 'Sign-in codes are not available',
            { reason: refusal },
        );
    }

    private isSupportedMode(): boolean {
        return SUPPORTED_MODES.includes(this.lightdashConfig.mode);
    }

    private async availability(
        organizationUuid: string | undefined,
    ): Promise<MobileSignInRefusal | null> {
        if (!this.isSupportedMode())
            return MobileSignInRefusal.FEATURE_DISABLED;
        if (!organizationUuid) return MobileSignInRefusal.ORGANIZATION_REQUIRED;
        if (!(await this.isEnabled(organizationUuid))) {
            return MobileSignInRefusal.FEATURE_DISABLED;
        }
        if (!(await this.isQrSignInEnabled(organizationUuid))) {
            return MobileSignInRefusal.QR_SIGN_IN_DISABLED;
        }
        return null;
    }

    private async assertAvailableFor(user: SessionUser): Promise<void> {
        const refusal = await this.availability(user.organizationUuid);
        if (refusal) throw MobileSignInService.refusalError(refusal);
    }

    private static deniedForPhone(
        refusal: MobileSignInRefusal,
    ): MobileSignInOAuthError {
        return new MobileSignInOAuthError('access_denied', {
            description:
                PHONE_REFUSAL_DESCRIPTIONS[refusal] ?? 'user_not_allowed',
            statusCode: UNAVAILABLE_REFUSALS.includes(refusal) ? 403 : 400,
        });
    }

    private async assertAvailableForCode(
        code: string,
    ): Promise<MobileSignInCodeOwner | null> {
        if (!this.isSupportedMode()) {
            throw MobileSignInService.deniedForPhone(
                MobileSignInRefusal.FEATURE_DISABLED,
            );
        }
        const owner = await this.mobileSignInCodeModel.findOwner(code);
        if (!owner) return null;
        const refusal = await this.availability(owner.organization_uuid);
        if (refusal) throw MobileSignInService.deniedForPhone(refusal);
        return owner;
    }

    private async findOwnerUser(
        owner: MobileSignInCodeOwner,
    ): Promise<SessionUser> {
        try {
            return await this.userModel.findSessionUserAndOrgByUuid(
                owner.user_uuid,
                owner.organization_uuid,
            );
        } catch {
            throw new MobileSignInOAuthError('access_denied', {
                description: 'user_not_allowed',
            });
        }
    }

    private async isManaged(
        email: string | undefined,
        platforms: readonly MobileSignInPlatform[],
    ): Promise<boolean> {
        const results = await Promise.all(
            platforms.map((platform) =>
                this.getUserService().getManagedSignIn(platform, email),
            ),
        );
        return results.some((managed) => managed !== undefined);
    }

    private async refusal(
        user: SessionUser,
        platforms: readonly MobileSignInPlatform[],
    ): Promise<MobileSignInRefusal | null> {
        const unavailable = await this.availability(user.organizationUuid);
        if (unavailable) return unavailable;
        if (!user.isActive) {
            return MobileSignInRefusal.FEATURE_DISABLED;
        }
        if (this.lightdashConfig.smtp && user.isEmailVerified !== true) {
            return MobileSignInRefusal.EMAIL_UNVERIFIED;
        }
        if (await this.isManaged(user.email, platforms)) {
            return MobileSignInRefusal.MANAGED_SIGN_IN_REQUIRED;
        }
        return null;
    }

    async mint(
        user: SessionUser,
        sessionId: string,
        reason: MobileSignInMintReason,
    ): Promise<MobileSignInCode> {
        const refusal = await this.refusal(user, MOBILE_PLATFORMS);
        if (refusal) throw MobileSignInService.refusalError(refusal);
        const rate = await this.consumeRate(
            MOBILE_SIGN_IN_RATE_LIMITS.mintPerUser,
            user.userUuid,
        );
        if (!rate.allowed) {
            throw new TooManyRequestsError('Too many sign-in codes', {
                reason: MobileSignInRefusal.RATE_LIMITED,
                retryAfterSeconds: rate.retryAfterSeconds,
            });
        }
        const minted = await this.mobileSignInCodeModel.mint({
            userUuid: user.userUuid,
            organizationUuid: user.organizationUuid!,
            sessionId,
        });
        const expiresInSeconds = Math.max(
            0,
            Math.round((minted.expiresAt.getTime() - Date.now()) / 1000),
        );
        this.track(
            'mobile_sign_in_code.created',
            {
                codeUuid: minted.codeUuid,
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid!,
                platform: null,
            },
            { reason },
        );
        const signInUrl = new URL(
            MOBILE_SIGN_IN_PATH,
            this.lightdashConfig.siteUrl,
        );
        signInUrl.hash = `c=${minted.code}`;
        return {
            codeUuid: minted.codeUuid,
            signInUrl: signInUrl.href,
            approvalNonce: minted.approvalNonce,
            expiresAt: minted.expiresAt.toISOString(),
            expiresInSeconds,
        };
    }

    async getState(
        user: SessionUser,
        sessionId: string,
        codeUuid: string,
    ): Promise<MobileSignInCodeState> {
        await this.assertAvailableFor(user);
        const row = await this.mobileSignInCodeModel.findForSession({
            codeUuid,
            userUuid: user.userUuid,
            sessionId,
        });
        if (!row) throw new NotFoundError('Sign-in code not found');
        const showsNumber =
            row.effective_status === MobileSignInCodeStatus.CLAIMED ||
            row.effective_status === MobileSignInCodeStatus.APPROVED;
        return {
            codeUuid: row.mobile_sign_in_code_uuid,
            status: row.effective_status,
            expiresAt: row.expires_at.toISOString(),
            matchNumber:
                showsNumber && row.match_number !== null
                    ? formatMobileSignInMatchNumber(row.match_number)
                    : null,
            device:
                row.client_id === null
                    ? null
                    : {
                          platform:
                              row.reported_platform === 'ios' ||
                              row.reported_platform === 'android'
                                  ? row.reported_platform
                                  : 'unknown',
                          clientName: row.client_name ?? '',
                      },
        };
    }

    async decide(
        user: SessionUser,
        sessionId: string,
        codeUuid: string,
        nonce: string,
        decision: 'approved' | 'declined',
        context: MobileSignInRequestContext,
    ): Promise<MobileSignInDecision> {
        if (decision === 'approved') {
            const refusal = await this.refusal(user, MOBILE_PLATFORMS);
            if (refusal) throw MobileSignInService.refusalError(refusal);
        } else {
            await this.assertAvailableFor(user);
        }
        const result = await this.mobileSignInCodeModel.decide({
            codeUuid,
            userUuid: user.userUuid,
            sessionId,
            nonce,
            decision,
        });
        switch (result.outcome) {
            case 'decided':
                this.track(
                    decision === 'approved'
                        ? 'mobile_sign_in_code.approved'
                        : 'mobile_sign_in_code.declined',
                    {
                        codeUuid,
                        userUuid: user.userUuid,
                        organizationUuid: result.row.organization_uuid,
                        platform: result.row.reported_platform,
                    },
                    decision === 'declined' ? { declinedBy: 'web' } : {},
                );
                MobileSignInService.audit(
                    user,
                    decision === 'approved'
                        ? 'mobile_sign_in_approve'
                        : 'mobile_sign_in_decline',
                    'allowed',
                    {
                        codeUuid,
                        clientId: result.row.client_id,
                        reportedPlatform: result.row.reported_platform,
                    },
                    context,
                );
                return decision === 'approved'
                    ? {
                          status: MobileSignInCodeStatus.APPROVED,
                          matchNumber: formatMobileSignInMatchNumber(
                              result.row.match_number!,
                          ),
                      }
                    : {
                          status: MobileSignInCodeStatus.DECLINED,
                          matchNumber: null,
                      };
            case 'not_found':
                throw new NotFoundError('Sign-in code not found');
            case 'session_mismatch':
                throw new ForbiddenError(
                    'Confirm the code from the page that shows it',
                    { reason: MobileSignInRefusal.APPROVAL_SESSION_MISMATCH },
                );
            case 'invalid_state':
                throw new ConflictError('This code cannot be confirmed now', {
                    reason: MobileSignInRefusal.INVALID_STATE,
                    status: result.status,
                });
            default:
                throw new Error('Unknown mobile sign-in decision outcome');
        }
    }

    async cancel(
        user: SessionUser,
        sessionId: string,
        codeUuid: string,
    ): Promise<void> {
        await this.assertAvailableFor(user);
        await this.mobileSignInCodeModel.deleteForSession({
            codeUuid,
            userUuid: user.userUuid,
            sessionId,
        });
    }

    async deleteUnredeemedForUser(userUuid: string): Promise<void> {
        await this.mobileSignInCodeModel.deleteUnredeemedForUser(userUuid);
    }

    private rateWindow(rateLimit: RateLimit, key: string) {
        const windowMs = rateLimit.windowSeconds * 1000;
        const now = this.now().getTime();
        const windowStartedAt = Math.floor(now / windowMs) * windowMs;
        return {
            counter: {
                keyHash: hashMobileAppLinkKey(key),
                operation: rateLimit.scope,
                windowStartedAt: new Date(windowStartedAt),
            },
            retryAfterSeconds: Math.max(
                1,
                Math.ceil((windowStartedAt + windowMs - now) / 1000),
            ),
        };
    }

    private async consumeRate(
        rateLimit: RateLimit,
        key: string,
    ): Promise<RateLimitResult> {
        const { counter, retryAfterSeconds } = this.rateWindow(rateLimit, key);
        const count =
            await this.mobileAppLinkModel.incrementRateCounter(counter);
        return count <= rateLimit.limit
            ? { allowed: true }
            : { allowed: false, retryAfterSeconds };
    }

    private async assertUnderRedeemLimit(ip: string): Promise<void> {
        const { counter, retryAfterSeconds } = this.rateWindow(
            MOBILE_SIGN_IN_RATE_LIMITS.redeemPerIp,
            ip,
        );
        const count = await this.mobileAppLinkModel.getRateCount(counter);
        if (count >= MOBILE_SIGN_IN_RATE_LIMITS.redeemPerIp.limit) {
            throw new MobileSignInOAuthError('rate_limited', {
                statusCode: 429,
                retryAfterSeconds,
            });
        }
    }

    private async countRedeem(ip: string): Promise<void> {
        const { counter } = this.rateWindow(
            MOBILE_SIGN_IN_RATE_LIMITS.redeemPerIp,
            ip,
        );
        await this.mobileAppLinkModel.incrementRateCounter(counter);
    }

    private async consumeIpLimit(
        rateLimit: RateLimit,
        ip: string | undefined,
    ): Promise<void> {
        const rate = await this.consumeRate(rateLimit, ip ?? 'unknown');
        if (!rate.allowed) {
            throw new MobileSignInOAuthError('rate_limited', {
                statusCode: 429,
                retryAfterSeconds: rate.retryAfterSeconds,
            });
        }
    }

    private async getMobileClient(clientId: unknown) {
        if (typeof clientId !== 'string' || clientId.length === 0) {
            throw new MobileSignInOAuthError('invalid_request', {
                description: 'client_id',
            });
        }
        const client = await this.oauthModel.getClient(clientId);
        if (!client || !isMobileOAuthClient(client.redirectUris)) {
            throw new MobileSignInOAuthError('invalid_client', {
                statusCode: 401,
            });
        }
        return client;
    }

    async claim(
        body: Record<string, unknown>,
        context: MobileSignInRequestContext,
    ): Promise<MobileSignInClaimResponse> {
        await this.consumeIpLimit(
            MOBILE_SIGN_IN_RATE_LIMITS.claimPerIp,
            context.ip,
        );
        const {
            code,
            client_id: clientId,
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
            platform,
        } = body;
        if (!isMobileSignInCode(code)) {
            throw new MobileSignInOAuthError('invalid_request', {
                description: 'code',
            });
        }
        if (
            typeof codeChallenge !== 'string' ||
            !CHALLENGE_PATTERN.test(codeChallenge)
        ) {
            throw new MobileSignInOAuthError('invalid_request', {
                description: 'code_challenge',
            });
        }
        if (codeChallengeMethod !== 'S256') {
            throw new MobileSignInOAuthError('invalid_request', {
                description: 'code_challenge_method',
            });
        }
        if (platform !== 'ios' && platform !== 'android') {
            throw new MobileSignInOAuthError('invalid_request', {
                description: 'platform',
            });
        }
        const client = await this.getMobileClient(clientId);
        const owner = await this.assertAvailableForCode(code);
        const ownerUser = owner ? await this.findOwnerUser(owner) : null;

        const result = await this.mobileSignInCodeModel.claim({
            code,
            clientId: client.id,
            codeChallenge,
            platform,
        });
        if (result.outcome === 'expired') {
            throw new MobileSignInOAuthError('expired_token');
        }
        if (result.outcome === 'already_used') {
            throw new MobileSignInOAuthError('invalid_grant', {
                description: 'code_already_used',
            });
        }
        this.track('mobile_sign_in_code.claimed', {
            codeUuid: result.row.mobile_sign_in_code_uuid,
            userUuid: result.row.user_uuid,
            organizationUuid: result.row.organization_uuid,
            platform: result.row.reported_platform,
        });
        const user =
            ownerUser ??
            (await this.findOwnerUser({
                user_uuid: result.row.user_uuid,
                organization_uuid: result.row.organization_uuid,
                reported_platform: result.row.reported_platform,
            }));
        return {
            instance_url: new URL(this.lightdashConfig.siteUrl).origin,
            display_name_masked: maskDisplayName(user.firstName, user.lastName),
            expires_in: Math.max(
                0,
                Math.round(
                    (result.row.expires_at.getTime() - Date.now()) / 1000,
                ),
            ),
            interval: MOBILE_SIGN_IN_REDEEM_INTERVAL_SECONDS,
        };
    }

    async redeem(
        args: RedeemArgs,
        context: MobileSignInRequestContext,
    ): Promise<MobileSignInRedemption> {
        const ip = context.ip ?? 'unknown';
        await this.assertUnderRedeemLimit(ip);
        let isCounted = true;
        try {
            return await this.redeemCode(args, context);
        } catch (error) {
            if (
                error instanceof MobileSignInOAuthError &&
                UNCOUNTED_REDEEM_ERRORS.includes(error.error)
            ) {
                isCounted = false;
            }
            throw error;
        } finally {
            if (isCounted) await this.countRedeem(ip);
        }
    }

    private async redeemCode(
        args: RedeemArgs,
        context: MobileSignInRequestContext,
    ): Promise<MobileSignInRedemption> {
        if (
            typeof args.codeVerifier !== 'string' ||
            !VERIFIER_PATTERN.test(args.codeVerifier)
        ) {
            throw new MobileSignInOAuthError('invalid_request', {
                description: 'code_verifier',
            });
        }
        if (
            typeof args.matchNumber !== 'string' ||
            !MATCH_NUMBER_PATTERN.test(args.matchNumber)
        ) {
            throw new MobileSignInOAuthError('invalid_request', {
                description: 'match_number',
            });
        }
        const owner = await this.assertAvailableForCode(args.code);
        const ownerUser = owner
            ? await this.assertOwnerMayRedeem(owner, args, context)
            : null;
        const result = await this.mobileSignInCodeModel.redeem({
            code: args.code,
            clientId: args.clientId,
            codeVerifier: args.codeVerifier,
            matchNumber: Number(args.matchNumber),
        });
        switch (result.outcome) {
            case 'redeemed':
                break;
            case 'authorization_pending':
                throw new MobileSignInOAuthError('authorization_pending');
            case 'slow_down':
                throw new MobileSignInOAuthError('slow_down');
            case 'declined':
                throw new MobileSignInOAuthError('access_denied', {
                    description: 'declined',
                });
            case 'expired':
                throw new MobileSignInOAuthError('expired_token');
            case 'wrong_number':
            case 'code_mismatch':
                if (result.declined) {
                    this.track(
                        'mobile_sign_in_code.declined',
                        {
                            codeUuid: result.declined.mobile_sign_in_code_uuid,
                            userUuid: result.declined.user_uuid,
                            organizationUuid: result.declined.organization_uuid,
                            platform: result.declined.reported_platform,
                        },
                        { declinedBy: 'failed_redeems' },
                    );
                }
                throw result.declined
                    ? new MobileSignInOAuthError('access_denied', {
                          description: 'declined',
                      })
                    : new MobileSignInOAuthError('invalid_grant', {
                          description: result.outcome,
                      });
            default:
                throw new Error('Unknown mobile sign-in redeem outcome');
        }

        const { row } = result;
        const user =
            ownerUser ??
            (await this.findOwnerUser({
                user_uuid: row.user_uuid,
                organization_uuid: row.organization_uuid,
                reported_platform: row.reported_platform,
            }));
        return {
            user,
            metadata: {
                codeUuid: row.mobile_sign_in_code_uuid,
                clientId: row.client_id,
                reportedPlatform: row.reported_platform,
            },
        };
    }

    private async assertOwnerMayRedeem(
        owner: MobileSignInCodeOwner,
        args: RedeemArgs,
        context: MobileSignInRequestContext,
    ): Promise<SessionUser> {
        const user = await this.findOwnerUser(owner);
        const reportedPlatform = owner.reported_platform;
        const platforms: readonly MobileSignInPlatform[] =
            reportedPlatform === 'ios' || reportedPlatform === 'android'
                ? [reportedPlatform]
                : MOBILE_PLATFORMS;
        const refusal = await this.refusal(user, platforms);
        if (refusal) {
            MobileSignInService.audit(
                user,
                'mobile_sign_in_redeem',
                'denied',
                { clientId: args.clientId, reportedPlatform },
                context,
                refusal,
            );
            throw refusal === MobileSignInRefusal.MANAGED_SIGN_IN_REQUIRED
                ? MobileSignInService.deniedForPhone(refusal)
                : new MobileSignInOAuthError('access_denied', {
                      description: 'user_not_allowed',
                  });
        }
        if (!(await args.isScopeAllowed(user))) {
            throw new MobileSignInOAuthError('invalid_scope');
        }
        return user;
    }

    recordRedeemAllowed(
        redemption: MobileSignInRedemption,
        context: MobileSignInRequestContext,
    ): void {
        this.track('mobile_sign_in_code.redeemed', {
            codeUuid: redemption.metadata.codeUuid,
            userUuid: redemption.user.userUuid,
            organizationUuid: redemption.user.organizationUuid!,
            platform: redemption.metadata.reportedPlatform,
        });
        MobileSignInService.audit(
            redemption.user,
            'mobile_sign_in_redeem',
            'allowed',
            redemption.metadata,
            context,
        );
    }
}
