import { ParseError } from '@lightdash/common';
import { GoogleAuth, UserRefreshClient } from 'google-auth-library';

export const getBigqueryCredentialsFromOauth = async (): Promise<
    Record<string, string>
> => {
    const auth = new GoogleAuth();
    const credentials = await auth.getApplicationDefault();

    if (credentials.credential instanceof UserRefreshClient) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { _clientId, _clientSecret, _refreshToken, projectId } =
            credentials.credential;
        if (_clientId && _clientSecret && _refreshToken) {
            return {
                client_id: _clientId,
                client_secret: _clientSecret,
                refresh_token: _refreshToken,
                project_id: projectId || '',
                type: 'authorized_user',
            };
        }
        throw new ParseError(`Cannot get credentials from UserRefreshClient`);
    } else if (
        'email' in credentials.credential &&
        'key' in credentials.credential
    ) {
        // Works with service credentials
        const { email, key, projectId } = credentials.credential as any;

        return {
            client_email: email,
            private_key: key,
            project_id: projectId,
        };
    }

    throw new ParseError(`Cannot get credentials from oauth`);
};
