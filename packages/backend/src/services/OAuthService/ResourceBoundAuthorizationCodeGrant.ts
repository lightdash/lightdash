import OAuth2Server from '@node-oauth/oauth2-server';
import AuthorizationCodeGrantType from '@node-oauth/oauth2-server/lib/grant-types/authorization-code-grant-type';
import {
    OAuthResourceBinding,
    resolveGrantedOAuthResource,
    withOAuthResourceBinding,
} from '../../auth/oauthScopes/oauthResources';

export const createResourceBoundAuthorizationCodeGrant = (
    resolveStrict: (user: OAuth2Server.User) => Promise<boolean>,
    siteUrl: string,
) =>
    class ResourceBoundAuthorizationCodeGrant extends AuthorizationCodeGrantType {
        private binding: OAuthResourceBinding;

        private strict = false;

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

        async getAuthorizationCode(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.AuthorizationCode> {
            const code = await super.getAuthorizationCode(request, client);
            this.strict = await resolveStrict(code.user);
            if (this.strict) {
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
