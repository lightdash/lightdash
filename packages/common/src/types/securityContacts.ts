import { z } from 'zod';

export const SECURITY_CONTACTS_MAX_EMAILS = 10;

export type SecurityContactsResults = { emails: string[] };
export type ApiSecurityContactsResponse = {
    status: 'ok';
    results: SecurityContactsResults;
};
export type UpdateSecurityContactsRequest = { emails: string[] };

// Replaces the whole list; an empty array clears it.
export const UpdateSecurityContactsRequestSchema: z.ZodType<UpdateSecurityContactsRequest> =
    z.strictObject({
        emails: z
            .array(z.string().trim().toLowerCase().pipe(z.email().max(254)))
            .max(SECURITY_CONTACTS_MAX_EMAILS),
    });

export const SecurityContactsResultsSchema: z.ZodType<SecurityContactsResults> =
    z.object({ emails: z.array(z.string()) });
export const SecurityContactsResponseSchema = z.object({
    status: z.literal('ok'),
    results: SecurityContactsResultsSchema,
});
