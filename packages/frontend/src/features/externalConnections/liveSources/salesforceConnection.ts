import { type SalesforceEnvironment } from '@lightdash/common';
import {
    setLiveSourceReturnTo,
    type LiveSourceReturnTo,
} from './postHogConnection';

/**
 * Opens Salesforce's consent screen; reconnecting keeps the source's uuid
 * and its login host, so it sends no environment.
 */
export const getSalesforceSignInUrl = (
    projectUuid: string,
    values: {
        name: string;
        environment?: SalesforceEnvironment;
        explorePrefix?: string;
    },
    connectionUuid: string | null,
    returnTo: LiveSourceReturnTo,
) => {
    const params = new URLSearchParams({ name: values.name.trim() });
    if (connectionUuid) params.set('connectionUuid', connectionUuid);
    if (values.environment) params.set('environment', values.environment);
    if (values.explorePrefix) params.set('explorePrefix', values.explorePrefix);
    setLiveSourceReturnTo(params, returnTo);
    return `/api/v1/ee/projects/${projectUuid}/live-sources/salesforce/oauth/start?${params.toString()}`;
};
