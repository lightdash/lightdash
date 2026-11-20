import { type SalesforceObject } from '@lightdash/common';
import {
    setLiveSourceReturnTo,
    type LiveSourceReturnTo,
} from './postHogConnection';

/** Opens Salesforce's consent screen; reconnecting keeps the source's uuid. */
export const getSalesforceSignInUrl = (
    projectUuid: string,
    values: {
        name: string;
        object: SalesforceObject;
    },
    connectionUuid: string | null,
    returnTo: LiveSourceReturnTo,
) => {
    const params = new URLSearchParams({
        name: values.name.trim(),
        object: values.object,
    });
    if (connectionUuid) params.set('connectionUuid', connectionUuid);
    setLiveSourceReturnTo(params, returnTo);
    return `/api/v1/ee/projects/${projectUuid}/live-sources/salesforce/oauth/start?${params.toString()}`;
};
