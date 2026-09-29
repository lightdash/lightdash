import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    isMobilePlatform,
    MobileSetupCodeError,
    MobileSetupCodeStatus,
    NotFoundError,
    type MobileSetupCode,
    type MobileSetupCodeStatusResponse,
    type RegisteredAccount,
    type SessionUser,
    type UUID,
} from '@lightdash/common';
import type { Client, Token } from '@node-oauth/oauth2-server';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { type Knex } from 'knex';
import { fromSession, toSessionUser } from '../../auth/account';
import { LightdashConfig } from '../../config/parseConfig';
import { type DbMobileSetupCode } from '../../database/entities/mobileSetupCodes';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { MobileSetupCodeModel } from '../../models/MobileSetupCodeModel';
import { isMobileOAuthClient } from '../../models/OAuth2Model';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { BaseService } from '../BaseService';
import { MobileSetupRejection } from './MobileSetupRejection';

type MobileSetupServiceArguments = {
    mobileSetupCodeModel: MobileSetupCodeModel;
    featureFlagModel: FeatureFlagModel;
    projectModel: ProjectModel;
    userModel: UserModel;
    lightdashConfig: LightdashConfig;
};

const hashCode = (code: string): string =>
    createHash('sha256').update(code).digest('hex');

const generateCode = (): string => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = randomBytes(20);
    let bits = 0;
    let value = 0;
    let encoded = '';
    for (const byte of bytes) {
        value = value * 256 + byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            encoded += alphabet[Math.floor(value / 2 ** bits) % 32];
        }
        value %= 2 ** bits;
    }
    return encoded;
};

const getCodeStatus = (code: DbMobileSetupCode): MobileSetupCodeStatus => {
    if (code.redeemed_at !== null) return MobileSetupCodeStatus.REDEEMED;
    if (code.revoked_at !== null) return MobileSetupCodeStatus.REVOKED;
    if (code.expires_at.getTime() <= Date.now())
        return MobileSetupCodeStatus.EXPIRED;
    if (code.verification_challenge)
        return MobileSetupCodeStatus.AWAITING_VERIFICATION;
    return MobileSetupCodeStatus.PENDING;
};

const assertPending = (
    code: DbMobileSetupCode | undefined,
): DbMobileSetupCode => {
    if (code === undefined)
        throw new MobileSetupRejection(MobileSetupCodeError.UNKNOWN);
    if (code.verification_attempts >= 5)
        throw new MobileSetupRejection(MobileSetupCodeError.ATTEMPTS_EXHAUSTED);
    const status = getCodeStatus(code);
    if (status === MobileSetupCodeStatus.REDEEMED)
        throw new MobileSetupRejection(MobileSetupCodeError.ALREADY_USED);
    if (status === MobileSetupCodeStatus.REVOKED)
        throw new MobileSetupRejection(MobileSetupCodeError.REVOKED);
    if (status === MobileSetupCodeStatus.EXPIRED)
        throw new MobileSetupRejection(MobileSetupCodeError.EXPIRED);
    return code;
};

export class MobileSetupService extends BaseService {
    constructor(private readonly dependencies: MobileSetupServiceArguments) {
        super();
    }

    private async assertEnabled(user: SessionUser): Promise<void> {
        const { enabled } = await this.dependencies.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.MobileAppSetup,
        });
        if (!enabled)
            throw new ForbiddenError('Mobile app setup is not enabled');
    }

    private async assertProjectAccess(
        account: RegisteredAccount,
        projectUuid: UUID,
    ): Promise<void> {
        const project =
            await this.dependencies.projectModel.getSummary(projectUuid);
        if (
            project.organizationUuid !==
                account.organization.organizationUuid ||
            this.createAuditedAbility(account).cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError('You do not have access to this project');
        }
    }

    async mint(
        account: RegisteredAccount,
        projectUuid: UUID,
    ): Promise<MobileSetupCode> {
        if (account.authentication.type !== 'session')
            throw new ForbiddenError('A signed-in session is required');
        const user = toSessionUser(account);
        await this.assertEnabled(user);
        await this.assertProjectAccess(account, projectUuid);
        const { organizationUuid } = account.organization;
        if (!organizationUuid)
            throw new ForbiddenError('An organization is required');
        const code = generateCode();
        const created = await this.dependencies.mobileSetupCodeModel.create({
            code_hash: hashCode(code),
            user_uuid: account.user.id,
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            expires_at: new Date(Date.now() + 5 * 60 * 1000),
        });
        const { lightdashConfig } = this.dependencies;
        const link = new URL(lightdashConfig.mobileApp.setupLinkBaseUrl);
        link.searchParams.set('v', '2');
        link.searchParams.set('i', new URL(lightdashConfig.siteUrl).origin);
        link.searchParams.set('c', code);
        return {
            codeId: created.mobile_setup_code_uuid,
            code,
            link: link.toString(),
            expiresAt: created.expires_at.toISOString(),
            projectUuid,
        };
    }

    private async getOwnedCode(
        account: RegisteredAccount,
        codeId: UUID,
    ): Promise<DbMobileSetupCode> {
        if (account.authentication.type !== 'session')
            throw new ForbiddenError('A signed-in session is required');
        await this.assertEnabled(toSessionUser(account));
        const code = await this.dependencies.mobileSetupCodeModel.findForUser(
            codeId,
            account.user.id,
        );
        if (code === undefined)
            throw new NotFoundError('Mobile setup code not found');
        if (code.organization_uuid !== account.organization.organizationUuid)
            throw new NotFoundError('Mobile setup code not found');
        await this.assertProjectAccess(account, code.project_uuid);
        return code;
    }

    async getStatus(
        account: RegisteredAccount,
        codeId: UUID,
    ): Promise<MobileSetupCodeStatusResponse> {
        const code = await this.getOwnedCode(account, codeId);
        const status = getCodeStatus(code);
        return {
            codeId,
            ...(status === MobileSetupCodeStatus.AWAITING_VERIFICATION &&
            code.verification_code_encrypted
                ? {
                      verificationCode: new EncryptionUtil(
                          this.dependencies,
                      ).decrypt(code.verification_code_encrypted),
                  }
                : {}),
            status,
            expiresAt: code.expires_at.toISOString(),
            redeemedAt: code.redeemed_at?.toISOString() ?? null,
            redeemedPlatform: code.redeemed_platform,
        };
    }

    async revoke(account: RegisteredAccount, codeId: UUID): Promise<void> {
        await this.getOwnedCode(account, codeId);
        await this.dependencies.mobileSetupCodeModel.revoke(
            codeId,
            account.user.id,
        );
    }

    async beginChallenge({
        code,
        client,
        platform,
        codeChallenge,
    }: {
        code: unknown;
        client: Client;
        platform: unknown;
        codeChallenge: unknown;
    }): Promise<{ expiresAt: string }> {
        if (
            typeof code !== 'string' ||
            !/^[A-Z2-7]{32}$/.test(code) ||
            typeof codeChallenge !== 'string' ||
            !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) ||
            !isMobilePlatform(platform) ||
            client.isPublicClient !== true ||
            !isMobileOAuthClient(client.redirectUris)
        ) {
            throw new MobileSetupRejection(MobileSetupCodeError.UNKNOWN);
        }
        const codeHash = hashCode(code);
        const stored = assertPending(
            await this.dependencies.mobileSetupCodeModel.findByHash(codeHash),
        );
        const user =
            await this.dependencies.userModel.findSessionUserAndOrgByUuid(
                stored.user_uuid,
                stored.organization_uuid,
            );
        if (
            !user.isActive ||
            user.organizationUuid !== stored.organization_uuid
        )
            throw new MobileSetupRejection(MobileSetupCodeError.UNKNOWN);
        await this.assertEnabled(user);
        await this.assertProjectAccess(fromSession(user), stored.project_uuid);
        const bound =
            await this.dependencies.mobileSetupCodeModel.beginVerification(
                codeHash,
                stored.user_uuid,
                {
                    verification_challenge: codeChallenge,
                    verification_client_id: client.id,
                    verification_platform: platform,
                    verification_code_encrypted: new EncryptionUtil(
                        this.dependencies,
                    ).encrypt(randomInt(1_000_000).toString().padStart(6, '0')),
                },
            );
        if (!bound) {
            assertPending(
                await this.dependencies.mobileSetupCodeModel.findByHash(
                    codeHash,
                ),
            );
            throw new MobileSetupRejection(MobileSetupCodeError.UNKNOWN);
        }
        if (
            bound.verification_client_id !== client.id ||
            bound.verification_platform !== platform ||
            bound.verification_challenge !== codeChallenge
        ) {
            throw new MobileSetupRejection(
                MobileSetupCodeError.BINDING_MISMATCH,
            );
        }
        assertPending(bound);
        return { expiresAt: bound.expires_at.toISOString() };
    }

    async redeem(
        {
            code,
            client,
            platform,
            codeVerifier,
            verificationCode,
        }: {
            code: unknown;
            client: Client;
            platform: unknown;
            codeVerifier: unknown;
            verificationCode: unknown;
        },
        issueTokens: (
            redeemed: {
                user: SessionUser & { organizationUuid: UUID };
                projectUuid: UUID;
            },
            transaction: Knex.Transaction,
        ) => Promise<Token>,
    ): Promise<Token> {
        if (
            typeof codeVerifier !== 'string' ||
            !/^[A-Za-z0-9_-]{43}$/.test(codeVerifier) ||
            typeof verificationCode !== 'string' ||
            !/^[0-9]{6}$/.test(verificationCode) ||
            typeof code !== 'string' ||
            !/^[A-Z2-7]{32}$/.test(code) ||
            !isMobilePlatform(platform) ||
            client.isPublicClient !== true ||
            !isMobileOAuthClient(client.redirectUris)
        ) {
            throw new MobileSetupRejection(MobileSetupCodeError.UNKNOWN);
        }
        const codeHash = hashCode(code);
        const stored = assertPending(
            await this.dependencies.mobileSetupCodeModel.findByHash(codeHash),
        );
        const user =
            await this.dependencies.userModel.findSessionUserAndOrgByUuid(
                stored.user_uuid,
                stored.organization_uuid,
            );
        if (
            !user.isActive ||
            user.organizationUuid !== stored.organization_uuid
        )
            throw new MobileSetupRejection(MobileSetupCodeError.UNKNOWN);
        await this.assertEnabled(user);
        await this.assertProjectAccess(fromSession(user), stored.project_uuid);
        const redeemed = await this.dependencies.mobileSetupCodeModel.redeem(
            codeHash,
            client.id,
            platform,
            stored.user_uuid,
            (locked) => {
                if (
                    locked.verification_client_id !== client.id ||
                    locked.verification_platform !== platform ||
                    !locked.verification_challenge ||
                    !locked.verification_code_encrypted ||
                    !timingSafeEqual(
                        Buffer.from(locked.verification_challenge),
                        Buffer.from(
                            createHash('sha256')
                                .update(codeVerifier)
                                .digest('base64url'),
                        ),
                    )
                ) {
                    return MobileSetupCodeError.BINDING_MISMATCH;
                }
                const expected = new EncryptionUtil(this.dependencies).decrypt(
                    locked.verification_code_encrypted,
                );
                return timingSafeEqual(
                    Buffer.from(expected),
                    Buffer.from(verificationCode),
                )
                    ? null
                    : MobileSetupCodeError.VERIFICATION_FAILED;
            },
            (transaction) =>
                issueTokens(
                    {
                        user: {
                            ...user,
                            organizationUuid: stored.organization_uuid,
                        },
                        projectUuid: stored.project_uuid,
                    },
                    transaction,
                ),
        );
        if (redeemed === undefined) {
            assertPending(
                await this.dependencies.mobileSetupCodeModel.findByHash(
                    codeHash,
                ),
            );
            throw new MobileSetupRejection(MobileSetupCodeError.UNKNOWN);
        }
        if ('error' in redeemed) throw new MobileSetupRejection(redeemed.error);
        return redeemed.token;
    }
}
