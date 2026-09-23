import { z } from 'zod';
import { type ApiSuccess } from '../../types/api/success';
import { chartTypeIconSchema, type ChartTypeIcon } from './chartTypeIcons';
import { isValidDataAppSlug } from './code';
import {
    dataAppVizPreviewSchema,
    getDataAppVizPreviewSchema,
    type DataAppVizPreview,
} from './preview';
import { dataAppVizSchema, type DataAppVizSchema } from './types';

export const CHART_REGISTRY_INDEX_SCHEMA_VERSION = 1 as const;

const SEMVER_VERSION_RE = /^\d+\.\d+\.\d+$/;

export const isSemverVersion = (value: string): boolean =>
    SEMVER_VERSION_RE.test(value);

/** Strict x.y.z numeric compare; throws on anything else. */
export const compareSemverVersions = (
    left: string,
    right: string,
): -1 | 0 | 1 => {
    if (!isSemverVersion(left) || !isSemverVersion(right)) {
        throw new Error(
            `Cannot compare non-semver versions: ${left} vs ${right}`,
        );
    }
    const l = left.split('.').map(Number);
    const r = right.split('.').map(Number);
    for (let i = 0; i < 3; i += 1) {
        if (l[i] !== r[i]) return l[i] < r[i] ? -1 : 1;
    }
    return 0;
};

const semverString = z
    .string()
    .refine(isSemverVersion, { message: 'must be a strict x.y.z version' });

const registrySlug = z
    .string()
    .refine(isValidDataAppSlug, { message: 'must be a valid chart type slug' });

// Explicit TS types (for the OpenAPI spec) plus zod schemas (runtime
// validation of the registry index), kept in sync by the compile-time
// assertions below — TSOA can't resolve types derived purely from
// `z.infer<...>`, so every registry type exposed via the API is declared
// by hand here, mirroring the data-app-viz schema/type split in `./types`.

export type ChartRegistryArtifact = {
    path: string;
    sha256: string;
};

const registryArtifactSchema = z.object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export type ChartRegistryEntry = {
    slug: string;
    name: string;
    description: string;
    version: string;
    publishedAt: string;
    tags: string[];
    changelog: string;
    minLightdashVersion: string | null;
    /** Release channel; absent = stable (the stable index omits the field) */
    channel?: 'stable' | 'beta';
    vizSchema: DataAppVizSchema;
    preview: DataAppVizPreview | null;
    thumbnail: string | null;
    /** Dark-scheme thumbnail variant; null = reuse `thumbnail` in both schemes */
    thumbnailDark: string | null;
    screenshots: string[];
    // Curated Tabler icon name; copied onto the app on install and upgrade.
    icon: ChartTypeIcon | null;
    artifacts: {
        source: ChartRegistryArtifact;
        dist: ChartRegistryArtifact;
    };
};

const registryEntrySchema = z
    .object({
        slug: registrySlug,
        name: z.string().min(1),
        description: z.string(),
        version: semverString,
        publishedAt: z.string(),
        tags: z.array(z.string()).default([]),
        changelog: z.string().default(''),
        minLightdashVersion: semverString.nullable().default(null),
        channel: z.enum(['stable', 'beta']).optional(),
        vizSchema: dataAppVizSchema,
        preview: dataAppVizPreviewSchema.nullable().default(null),
        thumbnail: z.string().nullable().default(null),
        thumbnailDark: z.string().nullable().default(null),
        screenshots: z.array(z.string()).default([]),
        icon: chartTypeIconSchema.nullable().default(null),
        artifacts: z.object({
            source: registryArtifactSchema,
            dist: registryArtifactSchema,
        }),
    })
    .superRefine((entry, ctx) => {
        if (!entry.preview) return;
        const result = getDataAppVizPreviewSchema(entry.vizSchema).safeParse(
            entry.preview,
        );
        if (!result.success)
            result.error.issues.forEach((issue) =>
                ctx.addIssue({ ...issue, path: ['preview', ...issue.path] }),
            );
    });

export type ChartRegistryIndex = {
    schemaVersion: typeof CHART_REGISTRY_INDEX_SCHEMA_VERSION;
    generatedAt: string;
    charts: ChartRegistryEntry[];
};

export const chartRegistryIndexSchema = z.object({
    schemaVersion: z.literal(CHART_REGISTRY_INDEX_SCHEMA_VERSION),
    generatedAt: z.string(),
    charts: z.array(registryEntrySchema),
});

const chartRegistryIndexEnvelopeSchema = z.object({
    schemaVersion: z.literal(CHART_REGISTRY_INDEX_SCHEMA_VERSION),
    generatedAt: z.string(),
    charts: z.array(z.unknown()),
});

export type ChartRegistryDroppedEntry = {
    slug: string | null;
    message: string;
};

/**
 * Parses a registry index, dropping entries that fail validation instead of
 * failing the whole index. The registry evolves independently of deployed
 * instances — one entry with, say, a channel value this build doesn't know
 * must hide that chart, not blank the entire library. An invalid envelope
 * (wrong schemaVersion, charts not an array) still throws: that's an
 * unusable registry, not a forward-compat entry.
 */
export const parseChartRegistryIndexTolerant = (
    raw: unknown,
): { index: ChartRegistryIndex; dropped: ChartRegistryDroppedEntry[] } => {
    const envelope = chartRegistryIndexEnvelopeSchema.parse(raw);
    const charts: ChartRegistryEntry[] = [];
    const dropped: ChartRegistryDroppedEntry[] = [];
    for (const rawEntry of envelope.charts) {
        const parsed = registryEntrySchema.safeParse(rawEntry);
        if (parsed.success) {
            charts.push(parsed.data);
        } else {
            const slug =
                typeof rawEntry === 'object' &&
                rawEntry !== null &&
                'slug' in rawEntry &&
                typeof rawEntry.slug === 'string'
                    ? rawEntry.slug
                    : null;
            dropped.push({
                slug,
                message: parsed.error.issues
                    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                    .join('; '),
            });
        }
    }
    return {
        index: {
            schemaVersion: envelope.schemaVersion,
            generatedAt: envelope.generatedAt,
            charts,
        },
        dropped,
    };
};

type AssertMutuallyAssignable<A, B> = [A] extends [B]
    ? [B] extends [A]
        ? true
        : never
    : never;
const chartRegistryIndexSchemaMatchesApiType: AssertMutuallyAssignable<
    z.infer<typeof chartRegistryIndexSchema>,
    ChartRegistryIndex
> = true;
void chartRegistryIndexSchemaMatchesApiType;

export type RegistryChartTypeState =
    | 'not_installed'
    | 'installed'
    | 'update_available'
    | 'incompatible';

/**
 * Server-derived release stage. The raw `channel` is ambiguous when absent:
 * stable on the stable index, unpointed (pre-release) on index-next — only
 * the backend knows which index the instance reads.
 */
export type RegistryChartTypeReleaseStage = 'stable' | 'beta' | 'prerelease';

export type RegistryChartTypeListItem = ChartRegistryEntry & {
    state: RegistryChartTypeState;
    releaseStage: RegistryChartTypeReleaseStage;
    installedAppUuid: string | null;
    installedRegistryVersion: string | null;
    installedCreatedByUserUuid: string | null;
};

export type ApiListRegistryChartTypesResponse = ApiSuccess<{
    registryEnabled: boolean;
    charts: RegistryChartTypeListItem[];
}>;

export type InstallRegistryChartTypeBody = {
    /**
     * Also move every consuming saved chart's pinned version onto the
     * installed version, deliberately overriding per-chart pins. Unpinned
     * charts already follow the latest version and are left untouched.
     */
    upgradeConsumingCharts?: boolean;
};

export type ApiInstallRegistryChartTypeResponse = ApiSuccess<{
    appUuid: string;
    slug: string;
    version: number;
    action: 'installed' | 'upgraded' | 'unchanged';
    /** Saved charts repinned by `upgradeConsumingCharts` (0 when not requested). */
    upgradedChartCount: number;
}>;
