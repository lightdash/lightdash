import { z } from 'zod';
import { formatTestCount } from '../../integration';
import { type LiveTestSummary } from '../../types';

// The setup test lists the organization's projects
const testResponseSchema = z.array(z.object({ slug: z.string() }));

/** The projects endpoint lists this many a page. */
const PAGE_SIZE = 100;

export const summarizeSentryTest = (
    body: unknown,
    {
        organizationSlug,
        projectSlugs,
    }: { organizationSlug: string; projectSlugs: string[] },
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    const listed = new Set(parsed.data.map(({ slug }) => slug));
    // A full page may leave a project out, so nothing is said to be missing
    const missing =
        parsed.data.length < PAGE_SIZE
            ? projectSlugs.filter((slug) => !listed.has(slug))
            : [];
    return {
        summary:
            missing.length > 0
                ? `Connected to ${organizationSlug}, but it has no project ${missing.join(', ')}`
                : `Connected to the Sentry organization ${organizationSlug}`,
        facts: [
            {
                label: 'Projects read',
                value: formatTestCount(projectSlugs.length - missing.length),
            },
            {
                label: 'Projects in the organization',
                value: formatTestCount(parsed.data.length),
            },
        ],
    };
};
