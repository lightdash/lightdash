import {
    BillingPortalLinkResultsSchema,
    type BillingPortalLinkResults,
} from '@lightdash/common';
import { type LightdashApi } from '../../../api';

export const createBillingPortalLink = async (lightdashApi: LightdashApi) =>
    BillingPortalLinkResultsSchema.parse(
        await lightdashApi<BillingPortalLinkResults>({
            url: '/org/billing/portal-link',
            method: 'POST',
            sensitive: true,
            body: undefined,
            version: 'v1',
        }),
    );
