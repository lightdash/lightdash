import OAuth2Server from '@node-oauth/oauth2-server';
import RefreshTokenGrantType from '@node-oauth/oauth2-server/lib/grant-types/refresh-token-grant-type';
import { randomUUID } from 'node:crypto';
import { OAuthScopeMode } from '../../auth/oauthScopes/mode';
import { resolveGrantedOAuthResource } from '../../auth/oauthScopes/oauthResources';
import {
    OAuthTokenBinding,
    withOAuthTokenBinding,
} from '../../auth/oauthScopes/oauthTokenBinding';

export const createScopeCheckedRefreshTokenGrant = (
    resolveMode: (user: OAuth2Server.User) => Promise<OAuthScopeMode | null>,
    resolveStrict: (user: OAuth2Server.User) => Promise<boolean>,
    siteUrl: string,
) =>
    class ScopeCheckedRefreshTokenGrant extends RefreshTokenGrantType {
        private binding: OAuthTokenBinding;

        constructor(
            options: OAuth2Server.TokenOptions & {
                model: OAuth2Server.AuthorizationCodeModel;
            },
        ) {
            const binding: OAuthTokenBinding = {
                resource: null,
                familyUuid: null,
                agentConnectionGrantUuid: null,
                parentRefreshToken: null,
            };
            const boundOptions = {
                ...options,
                model: withOAuthTokenBinding(options.model, binding),
            };
            super(boundOptions);
            this.binding = binding;
        }

        async revokeToken(
            token: OAuth2Server.Token,
        ): Promise<OAuth2Server.Token> {
            if (this.binding.parentRefreshToken !== null) return token;
            return super.revokeToken(token);
        }

        async getRefreshToken(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.Token> {
            const token = await super.getRefreshToken(request, client);
            this.binding.agentConnectionGrantUuid =
                token.agentConnectionGrantUuid ?? null;
            if (this.binding.agentConnectionGrantUuid !== null) {
                if (!token.familyUuid)
                    throw new OAuth2Server.InvalidGrantError(
                        'Agent connection refresh family is missing',
                    );
                const requested = this.getScope(request, token) ?? [];
                const original: string[] = token.scope ?? [];
                if (
                    requested.length !== original.length ||
                    requested.some((scope) => !original.includes(scope))
                )
                    throw new OAuth2Server.InvalidScopeError(
                        'Agent connection scopes cannot change',
                    );
            }
            if (
                this.binding.agentConnectionGrantUuid !== null ||
                (await resolveStrict(token.user))
            ) {
                this.binding.familyUuid = token.familyUuid ?? randomUUID();
                this.binding.parentRefreshToken = token.refreshToken ?? null;
                this.binding.resource = resolveGrantedOAuthResource(
                    siteUrl,
                    request,
                    token.resource ?? null,
                );
            }
            const mode = await resolveMode(token.user);
            if (mode === null) return token;
            const scope = this.getScope(request, token);
            const validated = await this.validateScope(
                token.user,
                client,
                scope ?? [],
            );
            if (!validated) {
                throw new OAuth2Server.InvalidScopeError(
                    'Invalid scope: requested scope is invalid',
                );
            }
            return token;
        }
    };
