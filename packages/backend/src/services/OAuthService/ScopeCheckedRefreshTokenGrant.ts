import OAuth2Server from '@node-oauth/oauth2-server';
import RefreshTokenGrantType from '@node-oauth/oauth2-server/lib/grant-types/refresh-token-grant-type';
import { parseScope } from '@node-oauth/oauth2-server/lib/utils/scope-util';
import { randomUUID } from 'node:crypto';
import { splitOAuthScopes } from '../../auth/oauthScopes/mode';
import { resolveGrantedOAuthResource } from '../../auth/oauthScopes/oauthResources';
import {
    OAuthTokenBinding,
    withOAuthTokenBinding,
} from '../../auth/oauthScopes/oauthTokenBinding';

export const createScopeCheckedRefreshTokenGrant = (
    resolveStrict: (user: OAuth2Server.User) => Promise<boolean>,
    siteUrl: string,
    assertMobileAppAccess: (
        client: OAuth2Server.Client,
        user: OAuth2Server.User,
    ) => Promise<void>,
    recordScopeResolution: (
        client: OAuth2Server.Client,
        user: OAuth2Server.User,
        requested: string[],
        resolved: string[],
    ) => Promise<void>,
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
                sessionExpiresAt: null,
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
            await assertMobileAppAccess(client, token.user);
            this.binding.sessionExpiresAt = token.sessionExpiresAt ?? null;
            if (
                this.binding.sessionExpiresAt !== null &&
                this.binding.sessionExpiresAt.getTime() <= Date.now()
            )
                throw new OAuth2Server.InvalidGrantError(
                    'Session expired. Log in again.',
                );
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
            await recordScopeResolution(
                client,
                token.user,
                parseScope(request.body.scope) ?? token.scope ?? [],
                validated,
            );
            return { ...token, scope: validated };
        }

        getScope(
            request: OAuth2Server.Request,
            token: OAuth2Server.Token,
        ): string[] | undefined {
            const requested = parseScope(request.body.scope);
            if (requested === undefined) return super.getScope(request, token);
            const { known } = splitOAuthScopes(requested);
            if (known.length === 0)
                throw new OAuth2Server.InvalidScopeError(
                    'Invalid scope: requested scope is invalid',
                );
            return super.getScope(
                {
                    ...request,
                    body: { ...request.body, scope: known.join(' ') },
                } as OAuth2Server.Request,
                token,
            );
        }
    };
