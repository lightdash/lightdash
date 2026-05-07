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

export type AppVersionResources = {
    images: AppVersionImageResource[];
    charts: AppVersionChartResource[];
    dashboardName: string | null;
    // Pre-build Q&A captured at the time of generation. Persisted alongside
    // the prompt so the chat history can render the clarifications as their
    // own card on the user message — rather than mashing them into the
    // prompt text. Empty array when the user skipped or wasn't asked.
    clarifications: AppClarification[];
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
