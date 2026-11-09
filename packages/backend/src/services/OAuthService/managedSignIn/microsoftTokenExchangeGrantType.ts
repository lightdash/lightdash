import {
    ID_TOKEN_TYPE,
    ManagedSignInError,
    MOBILE_SIGN_IN_CODE_TOKEN_TYPE,
    type SessionUser,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { randomUUID } from 'node:crypto';
import {
    oauthApiResource,
    resolveGrantedOAuthResource,
} from '../../../auth/oauthScopes/oauthResources';
import { MobileSignInOAuthError } from '../../MobileSignInService/MobileSignInOAuthError';
import type { MobileSignInService } from '../../MobileSignInService/MobileSignInService';
import { ManagedSignInRejection } from './ManagedSignInRejection';
import type { ManagedSignInService } from './ManagedSignInService';

const {
    AbstractGrantType,
    InvalidGrantError,
    InvalidRequestError,
    InvalidScopeError,
    OAuthError,
} = OAuth2Server;

export class MobileSignInGrantError extends OAuthError {
    readonly retryAfterSeconds: number | undefined;

    constructor(error: MobileSignInOAuthError) {
        super(error.description ?? error.error, {
            code: error.statusCode,
            name: error.error,
        });
        this.retryAfterSeconds = error.retryAfterSeconds;
    }
}

const tokenRequestClientIps = new WeakMap<OAuth2Server.Request, string>();

export const setTokenRequestClientIp = (
    request: OAuth2Server.Request,
    ip: string,
): void => {
    tokenRequestClientIps.set(request, ip);
};

type SubjectResolution = {
    user: SessionUser;
    onIssued: () => void;
};

export const createMicrosoftTokenExchangeGrantType = (
    getManagedSignInService: () => ManagedSignInService,
    resolveStrict: (user: OAuth2Server.User) => Promise<boolean>,
    siteUrl: string,
    getMobileSignInService?: () => MobileSignInService,
) =>
    class TokenExchangeGrantType extends AbstractGrantType {
        declare protected readonly model: OAuth2Server.AuthorizationCodeModel;

        async handle(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.Token> {
            const subjectToken = request.body.subject_token;
            const subjectTokenType = request.body.subject_token_type;

            if (!subjectToken) {
                throw new InvalidRequestError(
                    'Missing parameter: `subject_token`',
                );
            }

            const auditContext = {
                ip: request.get('x-forwarded-for') ?? undefined,
                userAgent: request.get('user-agent') ?? undefined,
            };

            let resolution: SubjectResolution;
            if (subjectTokenType === ID_TOKEN_TYPE) {
                resolution = await this.resolveManagedSignIn(
                    subjectToken,
                    client,
                    auditContext,
                );
            } else if (
                subjectTokenType === MOBILE_SIGN_IN_CODE_TOKEN_TYPE &&
                getMobileSignInService
            ) {
                resolution = await this.resolveMobileSignInCode(
                    request,
                    subjectToken,
                    client,
                    auditContext,
                );
            } else {
                throw new InvalidRequestError(
                    'Invalid parameter: `subject_token_type`',
                );
            }

            const saved = await this.issue(request, client, resolution.user);
            resolution.onIssued();
            return saved;
        }

        private async resolveManagedSignIn(
            subjectToken: string,
            client: OAuth2Server.Client,
            auditContext: { ip?: string; userAgent?: string },
        ): Promise<SubjectResolution> {
            let user: SessionUser;
            try {
                user = await getManagedSignInService().exchangeIdToken({
                    subjectToken,
                    clientId: client.id,
                    ...auditContext,
                });
            } catch (error) {
                throw new InvalidGrantError(
                    error instanceof ManagedSignInRejection
                        ? error.code
                        : ManagedSignInError.TOKEN_INVALID,
                );
            }
            return {
                user,
                onIssued: () =>
                    getManagedSignInService().recordSignInAllowed(
                        user,
                        auditContext,
                    ),
            };
        }

        private async resolveMobileSignInCode(
            request: OAuth2Server.Request,
            subjectToken: string,
            client: OAuth2Server.Client,
            auditContext: { ip?: string; userAgent?: string },
        ): Promise<SubjectResolution> {
            const service = getMobileSignInService!();
            const mobileContext = {
                ...auditContext,
                ip: tokenRequestClientIps.get(request) ?? auditContext.ip,
            };
            const requestedScope = this.getScope(request);
            try {
                const redemption = await service.redeem(
                    {
                        code: subjectToken,
                        clientId: client.id,
                        codeVerifier: request.body.code_verifier,
                        matchNumber: request.body.match_number,
                        isScopeAllowed: async (user) =>
                            Boolean(
                                await this.validateScope(
                                    user,
                                    client,
                                    requestedScope,
                                ),
                            ),
                    },
                    mobileContext,
                );
                return {
                    user: redemption.user,
                    onIssued: () =>
                        service.recordRedeemAllowed(redemption, mobileContext),
                };
            } catch (error) {
                if (error instanceof MobileSignInOAuthError) {
                    throw new MobileSignInGrantError(error);
                }
                throw error;
            }
        }

        private async issue(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
            user: SessionUser,
        ): Promise<OAuth2Server.Token> {
            const requestedScope = this.getScope(request);
            const scope = await this.validateScope(
                user,
                client,
                requestedScope,
            );
            if (!scope) {
                throw new InvalidScopeError(
                    'Invalid scope: requested scope is invalid',
                );
            }
            const accessToken = await this.generateAccessToken(
                client,
                user,
                scope,
            );
            const refreshToken = await this.generateRefreshToken(
                client,
                user,
                scope,
            );
            const accessTokenExpiresAt = await this.getAccessTokenExpiresAt();
            const refreshTokenExpiresAt = await this.getRefreshTokenExpiresAt();

            const strict = await resolveStrict(user);
            const saved = await this.model.saveToken(
                {
                    familyUuid: strict ? randomUUID() : null,
                    resource: strict
                        ? resolveGrantedOAuthResource(
                              siteUrl,
                              request,
                              oauthApiResource(siteUrl),
                          )
                        : null,
                    accessToken,
                    accessTokenExpiresAt,
                    refreshToken,
                    refreshTokenExpiresAt,
                    scope,
                    client,
                    user,
                },
                client,
                user,
            );
            if (!saved) {
                throw new InvalidGrantError(ManagedSignInError.TOKEN_INVALID);
            }
            return saved;
        }
    };
