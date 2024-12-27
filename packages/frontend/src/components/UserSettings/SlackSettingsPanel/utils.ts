import { slackRequiredScopes, type SlackSettings } from '@lightdash/common';
import { intersection } from 'lodash';

export const hasRequiredScopes = (slackSettings: SlackSettings) => {
    return (
        intersection(slackSettings.scopes, slackRequiredScopes).length ===
        slackRequiredScopes.length
    );
};
