import { type ApiSuccess, type ApiSuccessEmpty } from '../../types/api/success';
import { type KnexPaginateArgs } from '../../types/knex-paginate';
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

export type ApiGenerateAppResponse = ApiSuccess<{
    appUuid: string;
    version: number;
}>;

export type ApiAppImageUploadResponse = ApiSuccess<{
    imageId: string;
}>;

export const DATA_APP_TEMPLATES = [
    'dashboard',
    'slideshow',
    'pdf',
    'custom',
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
 * (must belong to the app's project) and gated on the external-access flag.
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
};

export type ApiAppImageUrlResponse = ApiSuccess<{
    imageUrl: string;
}>;

export type ApiAppVersionSummary = {
    version: number;
    prompt: string;
    status: AppVersionStatus;
    statusMessage: string | null;
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
};

export type ApiGetAppResponse = ApiSuccess<{
    appUuid: string;
    name: string;
    description: string;
    createdByUserUuid: string;
    spaceUuid: string | null;
    // null when the user picked "Custom" or for apps that pre-date template persistence
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
};

export type ApiMyAppsResponse = ApiSuccess<{
    data: ApiAppSummary[];
    pagination?: KnexPaginateArgs & {
        totalPageCount: number;
        totalResults: number;
    };
}>;
