import { z } from 'zod';
import { type ApiSuccess } from '../../types/api/success';
import { isValidDataAppSlug } from './code';
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
    vizSchema: DataAppVizSchema;
    thumbnail: string | null;
    screenshots: string[];
    artifacts: {
        source: ChartRegistryArtifact;
        dist: ChartRegistryArtifact;
    };
};

const registryEntrySchema = z.object({
    slug: registrySlug,
    name: z.string().min(1),
    description: z.string(),
    version: semverString,
    publishedAt: z.string(),
    tags: z.array(z.string()).default([]),
    changelog: z.string().default(''),
    minLightdashVersion: semverString.nullable().default(null),
    vizSchema: dataAppVizSchema,
    thumbnail: z.string().nullable().default(null),
    screenshots: z.array(z.string()).default([]),
    artifacts: z.object({
        source: registryArtifactSchema,
        dist: registryArtifactSchema,
    }),
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

export type RegistryChartTypeListItem = ChartRegistryEntry & {
    state: RegistryChartTypeState;
    installedAppUuid: string | null;
    installedRegistryVersion: string | null;
    installedCreatedByUserUuid: string | null;
};

export type ApiListRegistryChartTypesResponse = ApiSuccess<{
    registryEnabled: boolean;
    charts: RegistryChartTypeListItem[];
}>;

export type ApiInstallRegistryChartTypeResponse = ApiSuccess<{
    appUuid: string;
    slug: string;
    version: number;
    action: 'installed' | 'upgraded' | 'unchanged';
}>;
