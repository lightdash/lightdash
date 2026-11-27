import { z } from 'zod';
import { toLiveHttpError, type LiveHttpResponse } from '../../sdk';

/** PostgREST's error body; Supabase's gateway sends only `message`. */
const errorSchema = z.object({
    code: z.string().nullable().optional(),
    message: z.string().optional(),
    details: z.string().nullable().optional(),
    hint: z.string().nullable().optional(),
});

/** Turns a Data API error response into an error that says what to change. */
export const toSupabaseError = (
    response: LiveHttpResponse,
    { table }: { table: string },
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const body = parsed.success ? parsed.data : {};
    const message = [body.message, body.details, body.hint]
        .filter(Boolean)
        .join(' ');
    const detail = message ? `: ${message}` : '';
    const badKey = `Supabase rejected the API key${detail}. Use a secret key (sb_secret_…) or the service_role key from the project's API Keys settings, and update this live data source.`;
    return toLiveHttpError(response, {
        rateLimited: (seconds) =>
            `Supabase is limiting requests; retry ${
                seconds ? `in ${seconds} seconds` : 'shortly'
            }.`,
        connection: {
            401: badKey,
            403: badKey,
            404: `Supabase can't find the table "${table}"${detail}. Check the table name, and that its schema is exposed in the project's Data API settings.`,
        },
        rejected: `Supabase couldn't read "${table}"${detail}. Check the filter values.`,
        failed: `Supabase returned ${response.status}${detail}`,
    });
};
