import {
    getMicrosoftIssuer,
    LightdashError,
    ManagedSignInError,
    OpenIdIdentityIssuerType,
    type OpenIdUser,
    type SessionUser,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { decodeJwt } from 'jose';
import { LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import { ManagedSignInModel } from '../../../models/ManagedSignInModel';
import { OrganizationSsoModel } from '../../../models/OrganizationSsoModel';
import type { UserService } from '../../UserService';
import { ManagedSignInRejection } from './ManagedSignInRejection';
import {
    MicrosoftTokenVerifier,
    type MicrosoftIdTokenClaims,
} from './microsoftTokenVerifier';

type ManagedSignInServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationSsoModel: OrganizationSsoModel;
    managedSignInModel: ManagedSignInModel;
    getUserService: () => UserService;
    verifier?: MicrosoftTokenVerifier;
};

export type ManagedSignInRequest = {
    subjectToken: string;
    clientId: string;
    ip?: string;
    userAgent?: string;
};

type RejectionContext = {
    tid: string | undefined;
    aud: string | undefined;
    organizationUuid: string | undefined;
};

const hashToken = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

/** Unverified, for the rejection log only. */
const readLogClaims = (
    token: string,
): Pick<RejectionContext, 'tid' | 'aud'> => {
    try {
        const payload = decodeJwt(token);
        const audience = Array.isArray(payload.aud)
            ? payload.aud.join(',')
            : payload.aud;
        return {
            tid: typeof payload.tid === 'string' ? payload.tid : undefined,
            aud: typeof audience === 'string' ? audience : undefined,
        };
    } catch {
        return { tid: undefined, aud: undefined };
    }
};

const getName = (
    claims: MicrosoftIdTokenClaims,
): { firstName: string | undefined; lastName: string | undefined } => {
    const givenName =
        typeof claims.given_name === 'string' ? claims.given_name : undefined;
    const familyName =
        typeof claims.family_name === 'string' ? claims.family_name : undefined;
    if (givenName || familyName) {
        return { firstName: givenName, lastName: familyName };
    }
    const displayName = typeof claims.name === 'string' ? claims.name : '';
    const [firstName, lastName] = displayName.split(' ');
    return { firstName, lastName };
};

/**
 * Turns a Microsoft Entra ID token into a Lightdash user. Browser sign-in and
 * managed sign-in share one rule set: this resolves the organisation from the
 * token's tenant, then hands the identity to `UserService.loginWithOpenId`.
 */
export class ManagedSignInService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationSsoModel: OrganizationSsoModel;

    private readonly managedSignInModel: ManagedSignInModel;

    private readonly getUserService: () => UserService;

    private readonly verifier: MicrosoftTokenVerifier;

    constructor(args: ManagedSignInServiceArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.organizationSsoModel = args.organizationSsoModel;
        this.managedSignInModel = args.managedSignInModel;
        this.getUserService = args.getUserService;
        this.verifier = args.verifier ?? new MicrosoftTokenVerifier();
    }

    private getConfiguredAudiences(): string[] {
        const { iosClientId, androidClientId } =
            this.lightdashConfig.auth.microsoftManagedSignIn;
        return [iosClientId, androidClientId].filter(
            (clientId): clientId is string => !!clientId,
        );
    }

    /**
     * The organisation the tenant belongs to, resolved from `tid` alone.
     * Undefined means a dedicated instance, where the environment names the
     * tenant and no per-organisation scoping applies.
     */
    private async resolveOrganizationUuid(
        tenantId: string,
    ): Promise<string | undefined> {
        const envTenantId = this.lightdashConfig.auth.azuread.oauth2TenantId;
        if (envTenantId) {
            if (envTenantId !== tenantId) {
                throw new ManagedSignInRejection(
                    ManagedSignInError.TENANT_NOT_CONFIGURED,
                    'tid does not match the configured tenant',
                );
            }
            return undefined;
        }

        const methods =
            await this.organizationSsoModel.findEnabledAzureAdMethodsByTenantId(
                tenantId,
            );
        if (methods.length !== 1) {
            throw new ManagedSignInRejection(
                ManagedSignInError.TENANT_NOT_CONFIGURED,
                `${methods.length} organizations claim this tenant`,
            );
        }
        return methods[0].organizationUuid;
    }

    private async claimSingleUse(
        subjectToken: string,
        claims: MicrosoftIdTokenClaims,
    ): Promise<void> {
        const claimed = await this.managedSignInModel.claimTokenUse(
            hashToken(subjectToken),
            new Date(claims.exp! * 1000),
        );
        if (!claimed) {
            throw new ManagedSignInRejection(
                ManagedSignInError.TOKEN_REPLAYED,
                'token hash is already recorded',
            );
        }
    }

    private static buildOpenIdUser(claims: MicrosoftIdTokenClaims): OpenIdUser {
        if (typeof claims.email !== 'string' || claims.email.length === 0) {
            throw new ManagedSignInRejection(
                ManagedSignInError.EMAIL_UNVERIFIED,
                'email claim is missing',
            );
        }
        const { firstName, lastName } = getName(claims);
        return {
            openId: {
                issuer: getMicrosoftIssuer(claims.tid),
                issuerType: OpenIdIdentityIssuerType.AZUREAD,
                subject: claims.oid,
                email: claims.email,
                firstName,
                lastName,
            },
        };
    }

    private logRejection(
        rejection: ManagedSignInRejection,
        clientId: string,
        context: RejectionContext,
    ): void {
        Logger.warn('Managed sign-in exchange rejected', {
            reason: rejection.code,
            detail: rejection.detail,
            tid: context.tid,
            aud: context.aud,
            clientId,
            organizationUuid: context.organizationUuid,
        });
    }

    async exchangeIdToken({
        subjectToken,
        clientId,
        ip,
        userAgent,
    }: ManagedSignInRequest): Promise<SessionUser> {
        const context: RejectionContext = {
            ...readLogClaims(subjectToken),
            organizationUuid: undefined,
        };
        try {
            const claims = await this.verifier.verify(
                subjectToken,
                this.getConfiguredAudiences(),
            );
            context.tid = claims.tid;

            const organizationUuid = await this.resolveOrganizationUuid(
                claims.tid,
            );
            context.organizationUuid = organizationUuid;

            await this.claimSingleUse(subjectToken, claims);

            const openIdUser = ManagedSignInService.buildOpenIdUser(claims);

            let user: SessionUser;
            try {
                user = await this.getUserService().loginWithOpenId(
                    openIdUser,
                    undefined,
                    undefined,
                    undefined,
                    { ip, userAgent },
                );
            } catch (error) {
                throw new ManagedSignInRejection(
                    ManagedSignInError.USER_NOT_ALLOWED,
                    error instanceof LightdashError
                        ? error.message
                        : 'login failed',
                );
            }

            if (
                organizationUuid !== undefined &&
                user.organizationUuid !== organizationUuid
            ) {
                throw new ManagedSignInRejection(
                    ManagedSignInError.USER_NOT_ALLOWED,
                    'user does not belong to the tenant organization',
                );
            }

            return user;
        } catch (error) {
            const rejection =
                error instanceof ManagedSignInRejection
                    ? error
                    : new ManagedSignInRejection(
                          ManagedSignInError.TOKEN_INVALID,
                          error instanceof Error
                              ? error.message
                              : 'unexpected failure',
                      );
            this.logRejection(rejection, clientId, context);
            throw rejection;
        }
    }
}
