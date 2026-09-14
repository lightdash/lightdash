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
import type { Client } from '@node-oauth/oauth2-server';
import { createHash, randomBytes } from 'crypto';
import { fromSession, toSessionUser } from '../../auth/account';
import { LightdashConfig } from '../../config/parseConfig';
import { type DbMobileSetupCode } from '../../database/entities/mobileSetupCodes';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { MobileSetupCodeModel } from '../../models/MobileSetupCodeModel';
import { isMobileOAuthClient } from '../../models/OAuth2Model';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
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
    return MobileSetupCodeStatus.PENDING;
};

const assertPending = (
    code: DbMobileSetupCode | undefined,
): DbMobileSetupCode => {
    if (code === undefined)
        throw new MobileSetupRejection(MobileSetupCodeError.UNKNOWN);
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
        link.searchParams.set('v', '1');
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
        await this.assertEnabled(toSessionUser(account));
        const code = await this.dependencies.mobileSetupCodeModel.findForUser(
            codeId,
            account.user.id,
        );
        if (code === undefined)
            throw new NotFoundError('Mobile setup code not found');
        return code;
    }

    async getStatus(
        account: RegisteredAccount,
        codeId: UUID,
    ): Promise<MobileSetupCodeStatusResponse> {
        const code = await this.getOwnedCode(account, codeId);
        return {
            codeId,
            status: getCodeStatus(code),
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

    async redeem({
        code,
        client,
        platform,
    }: {
        code: unknown;
        client: Client;
        platform: unknown;
    }): Promise<{ user: SessionUser; projectUuid: UUID }> {
        if (
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
        );
        if (redeemed === undefined) {
            assertPending(
                await this.dependencies.mobileSetupCodeModel.findByHash(
                    codeHash,
                ),
            );
            throw new MobileSetupRejection(MobileSetupCodeError.UNKNOWN);
        }
        return { user, projectUuid: stored.project_uuid };
    }
}
