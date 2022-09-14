import { ParseError } from '@lightdash/common';
import { GoogleAuth, UserRefreshClient } from 'google-auth-library';

export const getBigqueryCredentialsFromOauth = async (): Promise<
    Record<string, string>
> => {
    const auth = new GoogleAuth();
    const credentials = await auth.getApplicationDefault();

    if (credentials.credential instanceof UserRefreshClient) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { _clientId, _clientSecret, _refreshToken } =
            credentials.credential;
        if (_clientId && _clientSecret && _refreshToken) {
            return {
                client_id: _clientId,
                client_secret: _clientSecret,
                refresh_token: _refreshToken,
                type: 'authorized_user',
            };
        }
        throw new ParseError(`Cannot get credentials from UserRefreshClient`);
    }
    throw new ParseError(`Cannot get credentials from oauth`);
};
