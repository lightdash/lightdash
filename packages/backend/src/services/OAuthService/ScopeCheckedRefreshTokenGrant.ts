import OAuth2Server from '@node-oauth/oauth2-server';
import RefreshTokenGrantType from '@node-oauth/oauth2-server/lib/grant-types/refresh-token-grant-type';

export class ScopeCheckedRefreshTokenGrant extends RefreshTokenGrantType {
    async getRefreshToken(
        request: OAuth2Server.Request,
        client: OAuth2Server.Client,
    ): Promise<OAuth2Server.Token> {
        const token = await super.getRefreshToken(request, client);
        const scope = this.getScope(request, token);
        const validated = await this.validateScope(token.user, client, scope);
        if (!validated) {
            throw new OAuth2Server.InvalidScopeError(
                'Invalid scope: requested scope is invalid',
            );
        }
        return token;
    }
}
