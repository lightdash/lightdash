import { slackRequiredScopes, SlackSettings } from '@lightdash/common';
import intersection from 'lodash/intersection';

export const hasRequiredScopes = (slackSettings: SlackSettings) =>
    intersection(slackSettings.scopes, slackRequiredScopes).length ===
    slackRequiredScopes.length;
