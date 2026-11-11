import {
    AuthorizationError,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    PROVISIONED_TOKEN_LIFETIME_DAYS,
    RequestMethod,
    type ProvisionedOrganization,
    type ProvisionOrganizationRequest,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { fromSession } from '../../auth/account/account';
import type {
    AuthTrustedProvisionerConfig,
    LightdashConfig,
} from '../../config/parseConfig';
import Logger from '../../logging/logger';
import type { EmailModel } from '../../models/EmailModel';
import type { ManagedSignInModel } from '../../models/ManagedSignInModel';
import type { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';
import type { OrganizationService } from '../OrganizationService/OrganizationService';
import type { PersonalAccessTokenService } from '../PersonalAccessTokenService';
import { OidcTokenRejection, OidcTokenVerifier } from './oidcTokenVerifier';

const OWNER_LOCAL_PART_PATTERN = /^[a-z0-9][a-z0-9._+-]{0,63}$/;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

type ProvisioningServiceArguments = {
    lightdashConfig: LightdashConfig;
    userModel: UserModel;
    emailModel: EmailModel;
    managedSignInModel: ManagedSignInModel;
    getOrganizationService: () => OrganizationService;
    getPersonalAccessTokenService: () => PersonalAccessTokenService;
    verifier: OidcTokenVerifier;
};

const hashToken = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

export class ProvisioningService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly userModel: UserModel;

    private readonly emailModel: EmailModel;

    private readonly managedSignInModel: ManagedSignInModel;

    private readonly getOrganizationService: () => OrganizationService;

    private readonly getPersonalAccessTokenService: () => PersonalAccessTokenService;

    private readonly verifier: OidcTokenVerifier;

    constructor(args: ProvisioningServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.userModel = args.userModel;
        this.emailModel = args.emailModel;
        this.managedSignInModel = args.managedSignInModel;
        this.getOrganizationService = args.getOrganizationService;
        this.getPersonalAccessTokenService = args.getPersonalAccessTokenService;
        this.verifier = args.verifier;
    }

    private async authenticate(
        idToken: string,
        config: AuthTrustedProvisionerConfig,
    ): Promise<string> {
        try {
            const claims = await this.verifier.verify(
                idToken,
                config.issuer,
                config.audience,
            );
            if (!config.subjects.includes(claims.subject)) {
                throw new OidcTokenRejection(
                    `subject ${claims.subject} is not trusted`,
                );
            }
            const claimed = await this.managedSignInModel.claimTokenUse(
                hashToken(idToken),
                claims.expiresAt,
            );
            if (!claimed) {
                throw new OidcTokenRejection('token was already used');
            }
            return claims.subject;
        } catch (error) {
            if (error instanceof OidcTokenRejection) {
                Logger.warn(
                    `Organization provisioning rejected: ${error.message}`,
                );
                throw new AuthorizationError('Identity token was rejected');
            }
            throw error;
        }
    }

    private static parseOwnerEmail(
        ownerEmail: string,
        ownerEmailDomain: string,
    ): string {
        const email = ownerEmail.trim().toLowerCase();
        const separator = email.lastIndexOf('@');
        const localPart = email.slice(0, separator);
        const domain = email.slice(separator + 1);
        if (
            separator < 1 ||
            domain !== ownerEmailDomain ||
            !OWNER_LOCAL_PART_PATTERN.test(localPart)
        ) {
            throw new ParameterError(
                `Owner email must be an address at ${ownerEmailDomain}`,
            );
        }
        return email;
    }

    private getTokenExpiry(): Date {
        const { maxExpirationTimeInDays } = this.lightdashConfig.auth.pat;
        const days = Math.min(
            PROVISIONED_TOKEN_LIFETIME_DAYS,
            maxExpirationTimeInDays ?? PROVISIONED_TOKEN_LIFETIME_DAYS,
        );
        return new Date(Date.now() + days * DAY_IN_MS);
    }

    async provisionOrganization(
        idToken: string | null,
        request: ProvisionOrganizationRequest,
    ): Promise<ProvisionedOrganization> {
        const config = this.lightdashConfig.auth.trustedProvisioner;
        if (config === null) {
            throw new NotFoundError('Organization provisioning is not enabled');
        }
        if (idToken === null) {
            throw new AuthorizationError('Identity token is required');
        }
        const subject = await this.authenticate(idToken, config);

        const organizationName = request.organizationName.trim();
        if (organizationName.length === 0) {
            throw new ParameterError('Organization name is required');
        }
        const email = ProvisioningService.parseOwnerEmail(
            request.ownerEmail,
            config.ownerEmailDomain,
        );
        if (!this.lightdashConfig.allowMultiOrgs) {
            throw new ForbiddenError(
                'This instance does not allow more than one organization',
            );
        }
        const expiresAt = this.getTokenExpiry();

        const user = await this.userModel.createUser(
            { firstName: 'Demo', lastName: 'Owner', email },
            true,
            true,
        );
        await this.emailModel.verifyUserEmailIfExists(user.userUuid, email);
        await this.getOrganizationService().createAndJoinOrg(
            await this.userModel.findSessionUserByUUID(user.userUuid),
            { name: organizationName },
        );

        const owner = await this.userModel.findSessionUserByUUID(user.userUuid);
        if (owner.organizationUuid === undefined) {
            throw new NotFoundError('Provisioned organization was not found');
        }
        const { token } =
            await this.getPersonalAccessTokenService().createPersonalAccessToken(
                fromSession(owner),
                {
                    description: 'Organization provisioning',
                    expiresAt,
                    autoGenerated: true,
                },
                RequestMethod.BACKEND,
            );

        Logger.info(
            `Organization ${owner.organizationUuid} provisioned by trusted identity ${subject}`,
            {
                organizationUuid: owner.organizationUuid,
                userUuid: owner.userUuid,
                provisionerSubject: subject,
            },
        );
        return {
            organizationUuid: owner.organizationUuid,
            userUuid: owner.userUuid,
            token,
            tokenExpiresAt: expiresAt,
        };
    }
}
