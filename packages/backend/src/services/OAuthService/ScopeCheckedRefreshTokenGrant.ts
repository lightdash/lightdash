import OAuth2Server from '@node-oauth/oauth2-server';
import RefreshTokenGrantType from '@node-oauth/oauth2-server/lib/grant-types/refresh-token-grant-type';
import { OAuthScopeMode } from '../../auth/oauthScopes/mode';
import {
    OAuthResourceBinding,
    resolveGrantedOAuthResource,
    withOAuthResourceBinding,
} from '../../auth/oauthScopes/oauthResources';

export const createScopeCheckedRefreshTokenGrant = (
    resolveMode: (user: OAuth2Server.User) => Promise<OAuthScopeMode | null>,
    resolveStrict: (user: OAuth2Server.User) => Promise<boolean>,
    siteUrl: string,
) =>
    class ScopeCheckedRefreshTokenGrant extends RefreshTokenGrantType {
        private binding: OAuthResourceBinding;

        constructor(
            options: OAuth2Server.TokenOptions & {
                model: OAuth2Server.AuthorizationCodeModel;
            },
        ) {
            const binding: OAuthResourceBinding = { resource: null };
            const boundOptions = {
                ...options,
                model: withOAuthResourceBinding(options.model, binding),
            };
            super(boundOptions);
            this.binding = binding;
        }

        async getRefreshToken(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.Token> {
            const token = await super.getRefreshToken(request, client);
            if (await resolveStrict(token.user)) {
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
