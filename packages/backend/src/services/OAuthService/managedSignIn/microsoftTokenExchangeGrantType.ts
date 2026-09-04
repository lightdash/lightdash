import { ID_TOKEN_TYPE, ManagedSignInError } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { ManagedSignInRejection } from './ManagedSignInRejection';
import type { ManagedSignInService } from './ManagedSignInService';

const {
    AbstractGrantType,
    InvalidGrantError,
    InvalidRequestError,
    InvalidScopeError,
} = OAuth2Server;

export const createMicrosoftTokenExchangeGrantType = (
    getManagedSignInService: () => ManagedSignInService,
) =>
    class MicrosoftTokenExchangeGrantType extends AbstractGrantType {
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
            if (subjectTokenType !== ID_TOKEN_TYPE) {
                throw new InvalidRequestError(
                    'Invalid parameter: `subject_token_type`',
                );
            }

            let user: OAuth2Server.User;
            try {
                user = await getManagedSignInService().exchangeIdToken({
                    subjectToken,
                    clientId: client.id,
                    ip: request.get('x-forwarded-for') ?? undefined,
                    userAgent: request.get('user-agent') ?? undefined,
                });
            } catch (error) {
                throw new InvalidGrantError(
                    error instanceof ManagedSignInRejection
                        ? error.code
                        : ManagedSignInError.TOKEN_INVALID,
                );
            }

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

            const saved = await this.model.saveToken(
                {
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
