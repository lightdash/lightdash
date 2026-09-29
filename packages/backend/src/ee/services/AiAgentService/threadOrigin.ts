import {
    assertUnreachable,
    type AiAppThreadCreatedFrom,
    type AuthType,
} from '@lightdash/common';

/**
 * Only credentials a script holds count as the API: a browser session and the
 * mobile app's OAuth token are both a person in the app.
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
