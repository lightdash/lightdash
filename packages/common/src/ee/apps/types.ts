import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { type ApiSuccess, type ApiSuccessEmpty } from '../../types/api/success';
import {
    type KnexPaginateArgs,
    type KnexPaginatedData,
} from '../../types/knex-paginate';
import { type MetricQuery } from '../../types/metricQuery';

/**
 * Ordered pipeline stages. Index position determines progression — used to
 * skip completed stages when a build is retried after a worker crash.
 * 'ready' is included as the final stage; 'error' is terminal but not a
 * stage (not reachable through normal progression).
 */
export const APP_VERSION_STAGE_ORDER = [
    'pending',
    'sandbox',
    'catalog',
    'generating',
    'building',
    'packaging',
    'ready',
] as const;

export const APP_VERSION_TERMINAL_STATUSES = ['ready', 'error'] as const;

export type AppVersionStatus =
    | (typeof APP_VERSION_STAGE_ORDER)[number]
    | 'error';

export const isAppVersionInProgress = (status: AppVersionStatus): boolean =>
    !(APP_VERSION_TERMINAL_STATUSES as readonly string[]).includes(status);

/**
 * Data apps are created with an empty name and only get an auto-generated
 * title after their first version builds successfully. If that build never
 * completes the name stays blank. Everywhere an app name is shown to the user,
 * fall back to a stable, identifiable placeholder instead of rendering nothing
 * — the uuid suffix keeps two unnamed apps distinguishable. Use this as the
 * single source of truth so the convention stays consistent across the UI.
 */
export const getAppDisplayName = (name: string, appUuid: string): string =>
    name.trim().length > 0 ? name : `Untitled app ${appUuid.slice(0, 8)}`;

export type ApiGenerateAppResponse = ApiSuccess<{
    appUuid: string;
    version: number;
}>;

export type ApiAppImageUploadResponse = ApiSuccess<{
    imageId: string;
}>;

/** Starter template for a single-tile renderer that emits a typed viz schema. */
export const DATA_APP_VIZ_TEMPLATE = 'data_app_viz' as const;

export const DATA_APP_TEMPLATES = [
    'dashboard',
    'slideshow',
    'pdf',
    'custom',
    DATA_APP_VIZ_TEMPLATE,
] as const;
export type DataAppTemplate = (typeof DATA_APP_TEMPLATES)[number];

/**
 * Claude model used to generate / iterate the data app inside the sandbox.
 * Mapped to the Claude CLI's `--model <alias>` flag verbatim. Persisted
 * per-version on `AppVersionResources.claudeModel` so the user can switch
 * mid-iteration without losing the record of which model built which version.
 */
export const DATA_APP_CLAUDE_MODELS = ['opus', 'sonnet', 'haiku'] as const;
export type DataAppClaudeModel = (typeof DATA_APP_CLAUDE_MODELS)[number];
export const DEFAULT_DATA_APP_CLAUDE_MODEL: DataAppClaudeModel = 'sonnet';

/**
 * A saved-chart reference attached to a generation request.
 * `includeSampleData` is opt-in per chart: when true the backend runs the
 * underlying metric query and inlines a small sample of rows into the
 * sandbox so Claude can see actual values (e.g. "season 2026 only").
 */
export type AppChartReference = {
    uuid: string;
    includeSampleData: boolean;
    /** When true the app runs this chart live by UUID (linked) instead of
     *  copying its metric query inline. Optional for backwards compatibility —
     *  omitted (older clients) is treated as false (copy) on the server. */
    linkLive?: boolean;
};

/**
 * A dashboard reference attached to a generation request. The dashboard is
 * expanded server-side into its chart tiles. When `includeSampleData` is
 * true, every resolved chart in the dashboard receives a sample.
 */
export type AppDashboardReference = {
    uuid: string;
    includeSampleData: boolean;
};

/**
 * An external connection attached to a generation request. Linked to the app
 * (under `alias`) server-side at creation — before the catalog stage — so the
 * generated app can call it via `client.externalFetch(alias, …)`. Validated
 * (must belong to the app's project) before linking.
 */
export type AppExternalConnectionReference = {
    externalConnectionUuid: string;
    alias: string;
};

/**
 * A clarifying question the backend posed to the user before the build, paired
 * with the user's answer. Persisted on the version's `resources.clarifications`
 * so the chat can render them as a structured Q&A card on the user message.
 */
export type AppClarification = {
    question: string;
    answer: string;
};

/**
 * Fold clarifications into the prompt sent to the sandbox. The persisted
 * prompt stays as the user's original words — clarifications travel
 * separately on `resources.clarifications` for chat rendering.
 */
export const formatPromptWithClarifications = (
    prompt: string,
    clarifications: AppClarification[] | undefined,
): string => {
    if (!clarifications || clarifications.length === 0) return prompt;
    const qa = clarifications
        .map(
            (c, i) =>
                `${i + 1}. Q: ${c.question.trim()}\n   A: ${c.answer.trim()}`,
        )
        .join('\n');
    return `${prompt}\n\nClarifications:\n${qa}`;
};

export type GenerateAppRequestBody = {
    prompt: string;
    template?: DataAppTemplate; // starter template selected on app creation; ignored on iteration
    imageIds?: string[];
    appUuid?: string; // pre-generated UUID so images can be scoped to the app in S3
    charts?: AppChartReference[]; // saved charts to resolve, optionally with sample rows
    dashboard?: AppDashboardReference; // dashboard — resolved server-side to its chart tiles
    clarifications?: AppClarification[]; // pre-build Q&A folded into the prompt server-side
    // Optional target space. When set, the app is created with `space_uuid`
    // populated and the caller must have manage rights on that space (space
    // EDITOR/ADMIN, or project admin). When omitted, the app is created as
    // personal and can be moved into a space later.
    spaceUuid?: string;
    // Claude model to use for this version's generation. Defaults to
    // DEFAULT_DATA_APP_CLAUDE_MODEL on the backend when absent. Can be
    // switched between iterations — `claude --continue` keeps the prior
    // conversation context but accepts a fresh `--model` flag per turn.
    claudeModel?: DataAppClaudeModel;
    // Theme (org design) to apply to this app's source tree and system
    // prompt. On initial creation, omit to use the org default, null for no
    // theme, or pass a uuid for a specific theme. On iteration, omit to
    // inherit the current app theme; pass a uuid/null to change the app theme
    // and run a style-only rebuild.
    designUuid?: string | null;
    // External connections to link to the app before the catalog stage of this
    // build, so the generated app can call them via client.externalFetch.
    // Applied on both creation and iteration (linking is idempotent), validated
    // server-side (must belong to the project), and gated on the external-access
    // feature flag.
    externalConnections?: AppExternalConnectionReference[];
};

export type ApiClarifyAppRequest = {
    prompt: string;
    template?: DataAppTemplate;
    // Resources the user has already attached in the picker. The clarifier
    // resolves them lightly (names + explore only — no sample queries, no S3
    // image reads) and surfaces them to the LLM so it doesn't ask "which
    // chart?" when the user already pinned one. `includeSampleData` on the
    // refs is ignored at this stage; sample rows don't change *whether* a
    // question is worth asking.
    charts?: AppChartReference[];
    dashboard?: AppDashboardReference;
    imageIds?: string[];
};

export type ApiClarifyAppResponse = ApiSuccess<{
    questions: string[];
}>;

export type ApiPreviewTokenResponse = ApiSuccess<{
    token: string;
}>;

export type AppVersionImageResource = {
    imageId: string;
};

export type AppVersionChartResource = {
    chartUuid: string;
    chartName: string;
    chartKind: string | null;
    /** Whether this chart was attached as a live link — persists the linked
     *  chip indicator across reloads. Optional for backwards compatibility. */
    linkLive?: boolean;
};

export type AppVersionExternalConnectionResource = {
    externalConnectionUuid: string;
    name: string;
    alias: string;
};

export type AppVersionDesignSnapshot = {
    designUuid: string;
    name: string;
    fileCount: number;
};

export type AppVersionResources = {
    images: AppVersionImageResource[];
    charts: AppVersionChartResource[];
    externalConnections?: AppVersionExternalConnectionResource[];
    dashboardName: string | null;
    // Pre-build Q&A captured at the time of generation. Persisted alongside
    // the prompt so the chat history can render the clarifications as their
    // own card on the user message — rather than mashing them into the
    // prompt text. Empty array when the user skipped or wasn't asked.
    clarifications: AppClarification[];
    // Claude model the user picked for this version (sonnet / haiku).
    // Optional for backwards compatibility — versions built before the picker
    // shipped don't carry the field; readers should fall back to
    // DEFAULT_DATA_APP_CLAUDE_MODEL.
    claudeModel?: DataAppClaudeModel;
    // Snapshot of the theme used to generate this version (org design). Null
    // when no theme was applied. Captured at generation time so the chat
    // history reflects which theme was active even if it was later renamed
    // or deleted.
    design?: AppVersionDesignSnapshot | null;
    // The viz declaration (fields + configOptions) for a data_app_viz version,
    // sourced from app_versions.viz_schema. Null/absent for non-viz versions or
    // versions whose generation emitted no valid schema. Optional for rows
    // predating this field.
    vizSchema?: DataAppVizSchema | null;
};

export type AppVersionDependencyEntry = {
    name: string;
    version: string;
};

// Persisted on app_versions.dependencies (jsonb). Null on the row = the
// version builds with the template dependency set.
export type AppVersionDependencies = {
    // Packages that differ from the template baseline (new or version override).
    custom: AppVersionDependencyEntry[];
    // sha256 of the stored pnpm-lock.yaml, for integrity checks.
    lockfileHash: string;
};

export type ApiAppImageUrlResponse = ApiSuccess<{
    imageUrl: string;
}>;

export type ApiAppThumbnailUrlResponse = ApiSuccess<{
    thumbnailUrl: string;
}>;

export type ApiAppVersionSummary = {
    version: number;
    prompt: string;
    status: AppVersionStatus;
    statusMessage: string | null;
    // Detailed failure reason (e.g. the build's stderr) when `status` is
    // `error`; null otherwise. `statusMessage` carries the short user-facing
    // line (e.g. "Build failed"); this carries the why.
    error: string | null;
    createdAt: Date;
    // When the version last transitioned (e.g. into `ready` or `error`).
    // The chat UI shows this as the assistant-reply timestamp so it reflects
    // when the build actually completed, not when the prompt was submitted.
    statusUpdatedAt: Date | null;
    // Author of the version (the user who submitted the prompt). `null`
    // only when the underlying user row is missing (hard-deleted user) —
    // `created_by_user_uuid` itself is non-null on the row.
    createdByUser: {
        userUuid: string;
        firstName: string;
        lastName: string;
    } | null;
    resources: AppVersionResources | null;
    // Declared-dependency summary when the version was uploaded with a custom
    // dependency set; absent for template-dependency versions.
    dependencies?: { custom: AppVersionDependencyEntry[] };
};

export type ApiGetAppResponse = ApiSuccess<{
    appUuid: string;
    name: string;
    description: string;
    createdByUserUuid: string;
    spaceUuid: string | null;
    spaceName: string | null;
    // The stored template flavor; null for "Custom" or apps predating template persistence.
    template: Exclude<DataAppTemplate, 'custom'> | null;
    pinnedListUuid: string | null;
    pinnedListOrder: number | null;
    versions: ApiAppVersionSummary[];
    hasMore: boolean;
}>;

export type ApiUpdateAppRequest = {
    name?: string;
    description?: string;
};

export type ApiUpdateAppResponse = ApiSuccess<{
    appUuid: string;
    name: string;
    description: string;
}>;

export type ApiCancelAppVersionResponse = ApiSuccessEmpty;

export type ApiRestoreAppVersionResponse = ApiSuccess<{
    appUuid: string;
    version: number;
}>;

export type ApiDuplicateAppResponse = ApiSuccess<{
    appUuid: string;
    version: number;
}>;

export type PromoteAppAction = 'create' | 'update';

/**
 * Preview of what promoting a data app from a preview project into its
 * upstream (production) project will do. Drives the confirmation dialog.
 */
export type PromoteAppDiff = {
    // 'create' on first promotion, 'update' when the preview app is already
    // linked to a live production app (a new version is appended).
    action: PromoteAppAction;
    upstreamProjectUuid: string;
    upstreamProjectName: string;
    // The production app that will be updated, or null when it will be created.
    upstreamAppUuid: string | null;
    // The space (mirrored by path) the app will land in, or null for the
    // production project root.
    space: { name: string; path: string } | null;
};

export type ApiPromoteAppDiffResponse = ApiSuccess<PromoteAppDiff>;

export type ApiPromoteAppResponse = ApiSuccess<{
    appUuid: string;
    projectUuid: string;
    version: number;
    action: PromoteAppAction;
}>;

export type ApiDeleteAppResponse = ApiSuccessEmpty;

export type ApiAppSummary = {
    appUuid: string;
    name: string;
    description: string;
    projectUuid: string;
    projectName: string;
    spaceUuid: string | null;
    spaceName: string | null;
    createdAt: Date;
    lastVersionNumber: number | null;
    lastVersionStatus: AppVersionStatus | null;
};

/** Minimal app shape for the embed config's standalone-app allowlist picker. */
export type EmbedProjectApp = {
    appUuid: string;
    name: string;
};

export type ApiEmbedProjectAppsResponse = ApiSuccess<EmbedProjectApp[]>;

/**
 * Sample of rows from a chart's underlying query, captured at request time
 * and inlined into the sandbox alongside the chart's metric query. Opt-in
 * per chart via `AppChartReference.includeSampleData`.
 *
 * Discriminated on `status`:
 * - `available` — query ran; up to SAMPLE_ROW_LIMIT formatted rows attached
 * - `unavailable` — query failed or was skipped; `reason` is informational
 *   text the prompt surfaces to Claude so it doesn't fabricate values
 */
export type ChartSampleData =
    | {
          status: 'available';
          rows: Record<string, string>[];
          truncated: boolean;
      }
    | {
          status: 'unavailable';
          reason: string;
      };

export type ChartReference = {
    chartName: string;
    chartDescription: string;
    exploreName: string;
    metricQuery: MetricQuery;
    sampleData: ChartSampleData | null; // null when the user did not opt in
    /** Saved chart UUID — surfaced into the sandbox so a linked chart can be
     *  run live via savedChart(uuid). */
    chartUuid: string;
    /** true = run live by UUID; false = inline the metricQuery (copy). */
    linked: boolean;
};

export type ApiMyAppsResponse = ApiSuccess<{
    data: ApiAppSummary[];
    pagination?: KnexPaginateArgs & {
        totalPageCount: number;
        totalResults: number;
    };
}>;

// Data app viz declaration: explicit TS types (for the OpenAPI spec) plus a zod
// schema (runtime validation of the generated declaration), kept in sync by the
// compile-time assertion below.

// Binds a host query column: dimension (grouping), metric (measure), series (splits/colours).
export type DataAppVizFieldType = 'dimension' | 'metric' | 'series';
export type DataAppVizField = {
    name: string;
    label: string;
    type: DataAppVizFieldType;
    required: boolean;
};

export type DataAppVizConfigOptionType =
    | 'boolean'
    | 'select'
    | 'number'
    | 'text'
    | 'color'
    | 'palette';

// A whole-viz config option rendered as a form control; `group` is an optional tab label.
export type DataAppVizConfigOption =
    | {
          type: 'boolean';
          name: string;
          label: string;
          group?: string;
          default: boolean;
      }
    | {
          type: 'select';
          name: string;
          label: string;
          group?: string;
          choices: { value: string; label: string }[];
          default: string;
      }
    | {
          type: 'number';
          name: string;
          label: string;
          group?: string;
          default: number;
          min?: number;
          max?: number;
      }
    | {
          type: 'text';
          name: string;
          label: string;
          group?: string;
          default: string;
      }
    | {
          type: 'color';
          name: string;
          label: string;
          group?: string;
          default: string;
      }
    | {
          type: 'palette';
          name: string;
          label: string;
          group?: string;
          default: string[];
      };

/** A persisted config value; its shape is set by the option's declared `type`. */
export type DataAppVizOptionValue = boolean | number | string | string[];

/** The full declaration a data app viz emits: data-binding fields + config form. */
export type DataAppVizSchema = {
    fields: DataAppVizField[];
    configOptions: DataAppVizConfigOption[];
};

const uniqueNames = <T extends { name: string }>(arr: T[]): boolean =>
    new Set(arr.map((a) => a.name)).size === arr.length;

const optionBase = {
    name: z.string().min(1),
    label: z.string(),
    group: z.string().optional(),
};

// Runtime validator for the untrusted generated declaration. Also the source
// for the JSON Schema embedded in the generation prompt.
export const dataAppVizSchema = z.object({
    fields: z
        .array(
            z.object({
                name: z.string().min(1),
                label: z.string(),
                type: z.enum(['dimension', 'metric', 'series']),
                required: z.boolean(),
            }),
        )
        .refine(uniqueNames, 'duplicate field name'),
    configOptions: z
        .array(
            z.discriminatedUnion('type', [
                z.object({
                    ...optionBase,
                    type: z.literal('boolean'),
                    default: z.boolean(),
                }),
                z.object({
                    ...optionBase,
                    type: z.literal('select'),
                    choices: z
                        .array(
                            z.object({ value: z.string(), label: z.string() }),
                        )
                        .min(1),
                    default: z.string(),
                }),
                z.object({
                    ...optionBase,
                    type: z.literal('number'),
                    default: z.number(),
                    min: z.number().optional(),
                    max: z.number().optional(),
                }),
                z.object({
                    ...optionBase,
                    type: z.literal('text'),
                    default: z.string(),
                }),
                z.object({
                    ...optionBase,
                    type: z.literal('color'),
                    default: z.string(),
                }),
                z.object({
                    ...optionBase,
                    type: z.literal('palette'),
                    default: z.array(z.string()),
                }),
            ]),
        )
        .default([])
        .refine(uniqueNames, 'duplicate option name'),
});

// Compile-time guard: the zod schema's output type must match the explicit
// type exposed through the API. If either side drifts, this line fails to type.
type AssertMutuallyAssignable<A, B> = [A] extends [B]
    ? [B] extends [A]
        ? true
        : never
    : never;
const dataAppVizSchemaMatchesApiType: AssertMutuallyAssignable<
    z.infer<typeof dataAppVizSchema>,
    DataAppVizSchema
> = true;
void dataAppVizSchemaMatchesApiType;

// JSON Schema form of `dataAppVizSchema` for the generator CLI's `--json-schema`
// flag. Refinements (e.g. unique names) don't survive the conversion and stay
// enforced by the runtime `safeParse`.
export const dataAppVizJsonSchema = zodToJsonSchema(dataAppVizSchema);

/** Effective option values = stored value ?? declared default (derive, never seed). */
export const getEffectiveOptionValues = (
    configOptions: DataAppVizConfigOption[],
    optionValues: Record<string, DataAppVizOptionValue>,
): Record<string, DataAppVizOptionValue> =>
    Object.fromEntries(
        configOptions.map((o) => [o.name, optionValues[o.name] ?? o.default]),
    );

// A reusable, by-reference data app viz: a single-tile data app that declares a
// schema. Consumers store the `dataAppVizUuid` plus their own mapping, never a
// copy. `schema` is null until a version generates one.
export type DataAppViz = {
    dataAppVizUuid: string;
    name: string;
    description: string;
    projectUuid: string;
    spaceUuid: string | null;
    schema: DataAppVizSchema | null;
    createdAt: Date;
    createdByUserUuid: string;
};

export type ApiListDataAppVizsResponse = ApiSuccess<
    KnexPaginatedData<DataAppViz[]>
>;
export type ApiGetDataAppVizResponse = ApiSuccess<DataAppViz>;

// postMessage type the host uses to push render context into the sandboxed
// iframe over the existing app SDK bridge (no new transport).
export const APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE =
    'lightdash:sdk:data-app-viz-context';

// postMessage type the iframe posts on mount (via the SDK's useVizContext) to
// ask the host to push the current context — the renderer may mount after the
// host's first push, so this handshake replaces blind timed re-sends.
export const APP_SDK_VIZ_CONTEXT_REQUEST_MESSAGE =
    'lightdash:sdk:viz-context-request';

// Host-owned render context pushed into a data app viz: field name → bound query
// field id, plus the host-fetched result rows the renderer reads.
export type DataAppVizContext = {
    fieldMapping: Record<string, string>;
    rows: Record<string, unknown>[];
};
