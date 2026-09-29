import {
    assertUnreachable,
    type AiAppThreadCreatedFrom,
    type AuthType,
} from '@lightdash/common';

/**
 * Where a thread started through the app's thread endpoints is recorded as
 * created. Only credentials a script holds count as the API: the browser holds
 * a session and the mobile app an OAuth token, and both are a person in the app.
 */
export const getAppThreadCreatedFrom = (
    authType: AuthType,
): AiAppThreadCreatedFrom => {
    switch (authType) {
        case 'pat':
        case 'service-account':
            return 'api';
        case 'session':
        case 'oauth':
        case 'jwt':
            return 'web_app';
        default:
            return assertUnreachable(authType, 'Unknown authentication type');
    }
};
