declare module '@node-oauth/oauth2-server/lib/grant-types/refresh-token-grant-type' {
    import OAuth2Server from '@node-oauth/oauth2-server';

    export default class RefreshTokenGrantType
        extends OAuth2Server.AbstractGrantType
    {
        getRefreshToken(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.Token>;
        getScope(
            request: OAuth2Server.Request,
            token?: OAuth2Server.Token,
        ): string[];
        handle(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.Token>;
    }
}
