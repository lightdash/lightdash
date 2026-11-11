import {
    AuthorizationError,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    TooManyRequestsError,
    validateOrganizationNameOrThrow,
    validatePassword,
    type ProvisionedOrganization,
    type ProvisionOrganizationRequest,
} from '@lightdash/common';
import type {
    AuthTrustedProvisionerConfig,
    LightdashConfig,
} from '../../config/parseConfig';
import Logger from '../../logging/logger';
import type { EmailModel } from '../../models/EmailModel';
import type { ManagedSignInModel } from '../../models/ManagedSignInModel';
import type { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import type { UserModel } from '../../models/UserModel';
import { hashSignedJwtContent } from '../../utils/jwtContentHash';
import { BaseService } from '../BaseService';
import type { OrganizationService } from '../OrganizationService/OrganizationService';
import { OidcTokenRejection, OidcTokenVerifier } from './oidcTokenVerifier';

const OWNER_LOCAL_PART_PATTERN = /^[a-z0-9][a-z0-9._+-]{0,63}$/;

// Counted per process before any token work, so a flood cannot drive key fetches.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

type ProvisioningServiceArguments = {
    lightdashConfig: LightdashConfig;
    userModel: UserModel;
    emailModel: EmailModel;
    managedSignInModel: ManagedSignInModel;
    organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;
    getOrganizationService: () => OrganizationService;
    verifier: OidcTokenVerifier;
};

type ValidatedRequest = {
    organizationName: string;
    email: string;
    password: string;
};

export class ProvisioningService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly userModel: UserModel;

    private readonly emailModel: EmailModel;

    private readonly managedSignInModel: ManagedSignInModel;

    private readonly organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;

    private readonly getOrganizationService: () => OrganizationService;

    private readonly verifier: OidcTokenVerifier;

    private rateLimitWindow = { startedAt: 0, requests: 0 };

    constructor(args: ProvisioningServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.userModel = args.userModel;
        this.emailModel = args.emailModel;
        this.managedSignInModel = args.managedSignInModel;
        this.organizationAllowedEmailDomainsModel =
            args.organizationAllowedEmailDomainsModel;
        this.getOrganizationService = args.getOrganizationService;
        this.verifier = args.verifier;
    }

    private countRequest(): void {
        const now = Date.now();
        if (now - this.rateLimitWindow.startedAt >= RATE_LIMIT_WINDOW_MS) {
            this.rateLimitWindow = { startedAt: now, requests: 0 };
        }
        this.rateLimitWindow.requests += 1;
        if (this.rateLimitWindow.requests > RATE_LIMIT_MAX_REQUESTS) {
            throw new TooManyRequestsError();
        }
    }

    private static reject(detail: string): never {
        Logger.warn(`Organization provisioning rejected: ${detail}`);
        throw new AuthorizationError('Identity token was rejected');
    }

    /** Checks the token and its subject; returns the subject and the token's expiry. */
    private async verifyIdentity(
        idToken: string,
        config: AuthTrustedProvisionerConfig,
    ): Promise<{ subject: string; expiresAt: Date }> {
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
            return claims;
        } catch (error) {
            if (error instanceof OidcTokenRejection) {
                return ProvisioningService.reject(error.message);
            }
            throw error;
        }
    }

    private static validateRequest(
        request: ProvisionOrganizationRequest,
        ownerEmailDomain: string,
    ): ValidatedRequest {
        const organizationName = request.organizationName.trim();
        validateOrganizationNameOrThrow(organizationName);

        const email = request.ownerEmail.trim().toLowerCase();
        const separator = email.lastIndexOf('@');
        if (
            separator < 1 ||
            email.slice(separator + 1) !== ownerEmailDomain ||
            !OWNER_LOCAL_PART_PATTERN.test(email.slice(0, separator))
        ) {
            throw new ParameterError(
                `Owner email must be an address at ${ownerEmailDomain}`,
            );
        }
        if (!validatePassword(request.ownerPassword)) {
            throw new ParameterError(
                'Owner password does not meet the password requirements',
            );
        }
        return { organizationName, email, password: request.ownerPassword };
    }

    /**
     * A verified user can join any organization that allows their email
     * domain, so owners must live on a domain no organization allows.
     */
    private async assertOwnerDomainIsReserved(
        ownerEmailDomain: string,
    ): Promise<void> {
        if (!this.lightdashConfig.allowMultiOrgs) {
            throw new ForbiddenError(
                'This instance does not allow more than one organization',
            );
        }
        if (
            await this.organizationAllowedEmailDomainsModel.isEmailDomainAllowedByAnyOrganization(
                ownerEmailDomain,
            )
        ) {
            Logger.error(
                `Organization provisioning refused: an organization allows the owner email domain ${ownerEmailDomain}`,
            );
            throw new ForbiddenError(
                'The owner email domain is allowed by an organization',
            );
        }
    }

    async provisionOrganization(
        idToken: string | null,
        request: ProvisionOrganizationRequest,
    ): Promise<ProvisionedOrganization> {
        const config = this.lightdashConfig.auth.trustedProvisioner;
        if (config === null) {
            throw new NotFoundError('Organization provisioning is not enabled');
        }
        this.countRequest();
        if (idToken === null) {
            throw new AuthorizationError('Identity token is required');
        }
        const { subject, expiresAt } = await this.verifyIdentity(
            idToken,
            config,
        );
        const { organizationName, email, password } =
            ProvisioningService.validateRequest(
                request,
                config.ownerEmailDomain,
            );
        await this.assertOwnerDomainIsReserved(config.ownerEmailDomain);

        const claimed = await this.managedSignInModel.claimTokenUse(
            hashSignedJwtContent(idToken),
            expiresAt,
        );
        if (!claimed) {
            ProvisioningService.reject('token was already used');
        }

        const user = await this.userModel.createUser(
            { firstName: 'Demo', lastName: 'Owner', email, password },
            true,
            true,
        );
        try {
            await this.getOrganizationService().createAndJoinOrg(
                await this.userModel.findSessionUserByUUID(user.userUuid),
                { name: organizationName },
            );
        } catch (error) {
            // Never leave an owner without an organization behind.
            await this.userModel.delete(user.userUuid).catch((cause) => {
                Logger.error(
                    `Organization provisioning could not remove owner ${user.userUuid} after a failed organization`,
                    { cause },
                );
            });
            throw error;
        }
        // Verified last: an owner without an organization is never verified.
        await this.emailModel.verifyUserEmailIfExists(user.userUuid, email);

        const owner = await this.userModel.findSessionUserByUUID(user.userUuid);
        if (owner.organizationUuid === undefined) {
            throw new NotFoundError('Provisioned organization was not found');
        }
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
        };
    }
}
