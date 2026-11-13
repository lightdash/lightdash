import { z } from 'zod';

export type BillingPortalLinkResults = { url: string };
export type ApiBillingPortalLinkResponse = {
    status: 'ok';
    results: BillingPortalLinkResults;
};

// The link is opened in the browser, so only https targets are accepted.
export const BillingPortalLinkResultsSchema: z.ZodType<BillingPortalLinkResults> =
    z.object({
        url: z.url({ protocol: /^https$/ }),
    });
export const BillingPortalLinkResponseSchema = z.object({
    status: z.literal('ok'),
    results: BillingPortalLinkResultsSchema,
});
