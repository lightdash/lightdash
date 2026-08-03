import { z } from 'zod';
import {
    HOMEPAGE_MAX_BLOCKS_PER_ROW,
    type HomepageBlock,
    type HomepageConfig,
} from './types';

const heroDensitySchema = z.enum(['full', 'compact']);

const markdownBlockSchema = z.object({
    id: z.string(),
    type: z.literal('markdown'),
    config: z.object({ content: z.string() }),
});

const askAiHeroBlockSchema = z.object({
    id: z.string(),
    type: z.literal('ask-ai-hero'),
    config: z.object({
        showGreeting: z.boolean(),
        showRecommendedActions: z.boolean().optional(),
        density: heroDensitySchema.optional(),
    }),
});

const greetingBlockSchema = z.object({
    id: z.string(),
    type: z.literal('greeting'),
    config: z.object({
        subtitle: z.string(),
        density: heroDensitySchema.optional(),
    }),
});

const collectionItemRefSchema = z.object({
    contentType: z.enum(['chart', 'dashboard', 'space', 'data_app']),
    uuid: z.string(),
});

const contentLayoutSchema = z.enum(['card', 'list']);

const collectionBlockSchema = z.object({
    id: z.string(),
    type: z.literal('collection'),
    config: z.object({
        title: z.string(),
        items: z.array(collectionItemRefSchema),
        source: z
            .enum([
                'manual',
                'most-viewed',
                'recently-updated',
                'pinned',
                'favorites',
                'recently-viewed',
            ])
            .optional(),
        verifiedOnly: z.boolean().optional(),
        limit: z.number().int().positive().optional(),
        layout: contentLayoutSchema.optional(),
        contentTypes: z
            .array(z.enum(['chart', 'dashboard', 'space', 'data_app']))
            .optional(),
    }),
});

const resourceItemSchema = z.object({
    title: z.string(),
    url: z.string(),
    kind: z.enum(['video', 'doc', 'link', 'claude', 'youtube', 'data-app']),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    appUuid: z.string().optional(),
});

const resourcesBlockSchema = z.object({
    id: z.string(),
    type: z.literal('resources'),
    config: z.object({
        title: z.string(),
        items: z.array(resourceItemSchema),
        layout: contentLayoutSchema.optional(),
        showDescriptions: z.boolean().optional(),
    }),
});

const announcementsBlockSchema = z.object({
    id: z.string(),
    type: z.literal('announcements'),
    config: z.object({ title: z.string() }),
});

const quickActionSchema = z
    .discriminatedUnion('type', [
        z.object({ type: z.literal('ask-ai') }),
        z.object({ type: z.literal('run-query') }),
        z.object({ type: z.literal('browse-dashboards') }),
        z.object({ type: z.literal('browse-spaces') }),
        z.object({
            type: z.literal('dashboard'),
            dashboardUuid: z.string(),
            label: z.string(),
        }),
    ])
    .and(z.object({ primary: z.boolean().optional() }));

const quickActionsBlockSchema = z.object({
    id: z.string(),
    type: z.literal('quick-actions'),
    config: z.object({ actions: z.array(quickActionSchema) }),
});

const metricRefSchema = z.object({
    tableName: z.string(),
    metricName: z.string(),
    label: z.string(),
});

const metricsBlockSchema = z.object({
    id: z.string(),
    type: z.literal('metrics'),
    config: z.object({ title: z.string(), items: z.array(metricRefSchema) }),
});

const favoritesBlockSchema = z.object({
    id: z.string(),
    type: z.literal('favorites'),
    config: z.object({ title: z.string() }),
});

const recentBlockSchema = z.object({
    id: z.string(),
    type: z.literal('recent'),
    config: z.object({ title: z.string() }),
});

export const homepageBlockSchema = z.discriminatedUnion('type', [
    markdownBlockSchema,
    askAiHeroBlockSchema,
    greetingBlockSchema,
    collectionBlockSchema,
    resourcesBlockSchema,
    announcementsBlockSchema,
    quickActionsBlockSchema,
    metricsBlockSchema,
    favoritesBlockSchema,
    recentBlockSchema,
]) satisfies z.ZodType<HomepageBlock>;

const homepageRowSchema = z.object({
    id: z.string(),
    blocks: z.array(homepageBlockSchema),
});

export const homepageConfigSchema = z.object({
    version: z.literal(1),
    rows: z.array(homepageRowSchema),
}) satisfies z.ZodType<HomepageConfig>;

// Legacy `hero` blocks predate the schema; map them to markdown *before*
// validation so old stored configs and old clients keep working. Mirrors
// migrateBlock in migrateHomepageConfig, but at the raw-JSON level.
const migrateRawBlock = (block: unknown): unknown => {
    if (
        typeof block !== 'object' ||
        block === null ||
        (block as { type?: unknown }).type !== 'hero'
    ) {
        return block;
    }
    const legacy = block as {
        id?: unknown;
        config?: { title?: unknown; subtitle?: unknown };
    };
    const title =
        typeof legacy.config?.title === 'string' ? legacy.config.title : '';
    const subtitle =
        typeof legacy.config?.subtitle === 'string'
            ? legacy.config.subtitle
            : '';
    return {
        id: legacy.id,
        type: 'markdown',
        config: {
            content: subtitle ? `## ${title}\n\n${subtitle}` : `## ${title}`,
        },
    };
};

const rawShellSchema = z.object({
    version: z.literal(1),
    rows: z.array(z.object({ id: z.string(), blocks: z.array(z.unknown()) })),
});

/**
 * Strict write-path contract: migrates legacy shapes, then rejects anything
 * that isn't a valid HomepageConfig (including rows over the block cap).
 * Unknown extra properties are stripped, so they never reach storage.
 * Throws a plain Error with a readable message — callers wrap it in their
 * transport error (e.g. ParameterError).
 */
export const parseHomepageConfig = (value: unknown): HomepageConfig => {
    const shell = rawShellSchema.safeParse(value);
    if (!shell.success) {
        throw new Error(
            `Invalid homepage config: ${shell.error.issues[0]?.message ?? 'malformed'}`,
        );
    }
    const migrated = {
        version: shell.data.version,
        rows: shell.data.rows.map((row) => ({
            id: row.id,
            blocks: row.blocks.map(migrateRawBlock),
        })),
    };
    const result = homepageConfigSchema.safeParse(migrated);
    if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue?.path.join('.') ?? '';
        throw new Error(
            `Invalid homepage config at ${path}: ${issue?.message ?? 'malformed'}`,
        );
    }
    const oversizedRow = result.data.rows.find(
        (row) => row.blocks.length > HOMEPAGE_MAX_BLOCKS_PER_ROW,
    );
    if (oversizedRow) {
        throw new Error(
            `Invalid homepage config: rows support at most ${HOMEPAGE_MAX_BLOCKS_PER_ROW} blocks`,
        );
    }
    return result.data;
};

/**
 * Lenient read-path contract for configs already in storage: migrates legacy
 * shapes, drops individual blocks that don't validate (an unknown or corrupt
 * block must not take the whole homepage down), keeps everything else.
 * Only throws when the top-level shell isn't a versioned rows document —
 * that config was never renderable anyway.
 */
export const sanitizeHomepageConfig = (value: unknown): HomepageConfig => {
    const shell = rawShellSchema.safeParse(value);
    if (!shell.success) {
        throw new Error(
            `Corrupt homepage config: ${shell.error.issues[0]?.message ?? 'malformed'}`,
        );
    }
    return {
        version: shell.data.version,
        rows: shell.data.rows.map((row) => ({
            id: row.id,
            blocks: row.blocks.flatMap((rawBlock) => {
                const parsed = homepageBlockSchema.safeParse(
                    migrateRawBlock(rawBlock),
                );
                return parsed.success ? [parsed.data] : [];
            }),
        })),
    };
};
