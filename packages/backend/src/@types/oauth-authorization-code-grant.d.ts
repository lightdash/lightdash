declare module '@node-oauth/oauth2-server/lib/grant-types/authorization-code-grant-type' {
    import OAuth2Server from '@node-oauth/oauth2-server';

    export default class AuthorizationCodeGrantType
        extends OAuth2Server.AbstractGrantType
    {
        getAuthorizationCode(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.AuthorizationCode>;
        verifyPKCE(
            request: OAuth2Server.Request,
            code: OAuth2Server.AuthorizationCode,
        ): void;
        handle(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.Token>;
    }
}
