declare module '@node-oauth/oauth2-server/lib/grant-types/refresh-token-grant-type' {
    import OAuth2Server from '@node-oauth/oauth2-server';

    const RefreshTokenGrantBase: new (
        options: OAuth2Server.TokenOptions,
    ) => Omit<OAuth2Server.AbstractGrantType, 'getScope'>;

    export default class RefreshTokenGrantType extends RefreshTokenGrantBase {
        revokeToken(token: OAuth2Server.Token): Promise<OAuth2Server.Token>;
        getRefreshToken(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.Token>;
        getScope(
            request: OAuth2Server.Request,
            token: OAuth2Server.Token,
        ): string[] | undefined;
        handle(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.Token>;
    }
}
