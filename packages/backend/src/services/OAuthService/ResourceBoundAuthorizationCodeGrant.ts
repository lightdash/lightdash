import OAuth2Server from '@node-oauth/oauth2-server';
import AuthorizationCodeGrantType from '@node-oauth/oauth2-server/lib/grant-types/authorization-code-grant-type';
import { randomUUID } from 'node:crypto';
import { resolveGrantedOAuthResource } from '../../auth/oauthScopes/oauthResources';
import {
    OAuthTokenBinding,
    withOAuthTokenBinding,
} from '../../auth/oauthScopes/oauthTokenBinding';

export const createResourceBoundAuthorizationCodeGrant = (
    resolveStrict: (user: OAuth2Server.User) => Promise<boolean>,
    siteUrl: string,
) =>
    class ResourceBoundAuthorizationCodeGrant extends AuthorizationCodeGrantType {
        private binding: OAuthTokenBinding;

        private strict = false;

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

        async getAuthorizationCode(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.AuthorizationCode> {
            const code = await super.getAuthorizationCode(request, client);
            this.binding.agentConnectionGrantUuid =
                code.agentConnectionGrantUuid ?? null;
            this.strict =
                this.binding.agentConnectionGrantUuid !== null ||
                (await resolveStrict(code.user));
            if (this.strict) {
                this.binding.familyUuid = code.familyUuid ?? randomUUID();
                this.binding.resource = resolveGrantedOAuthResource(
                    siteUrl,
                    request,
                    code.resource ?? null,
                );
            }
            return code;
        }

        verifyPKCE(
            request: OAuth2Server.Request,
            code: OAuth2Server.AuthorizationCode,
        ): void {
            if (this.strict && !code.codeChallenge)
                throw new OAuth2Server.InvalidGrantError(
                    'Authorization code requires PKCE',
                );
            super.verifyPKCE(request, code);
        }
    };
