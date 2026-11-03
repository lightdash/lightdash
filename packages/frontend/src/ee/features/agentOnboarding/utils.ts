import {
    AGENT_ONBOARDING_STAGES,
    DimensionType,
    MetricType,
    isAgentOnboardingRunTerminal,
    type AgentOnboardingFile,
    type AgentOnboardingRun,
    type AgentOnboardingRunEvent,
    type AgentOnboardingStage,
} from '@lightdash/common';
import { load } from 'js-yaml';

export type AgentOnboardingStageTiming = {
    stage: AgentOnboardingStage;
    state: 'not_started' | 'active' | 'completed';
    durationMs: number | null;
};

export const AGENT_ONBOARDING_PROGRESS_STAGES = [
    {
        stage: 'explore',
        sourceStages: ['preparing_project', 'exploring_warehouse'],
    },
    {
        stage: 'semantic_layer',
        sourceStages: ['deploying_semantic_layer'],
    },
    {
        stage: 'dashboard',
        sourceStages: ['building_dashboard'],
    },
    {
        stage: 'ready',
        sourceStages: ['verifying', 'handoff'],
    },
] as const satisfies ReadonlyArray<{
    stage: string;
    sourceStages: readonly AgentOnboardingStage[];
}>;

export type AgentOnboardingProgressStage =
    (typeof AGENT_ONBOARDING_PROGRESS_STAGES)[number]['stage'];

export const AGENT_ONBOARDING_STAGE_LABELS: Record<
    AgentOnboardingProgressStage,
    string
> = {
    explore: 'Read your warehouse',
    semantic_layer: 'Define metrics',
    dashboard: 'Draft a dashboard',
    ready: 'Check and hand off',
};

export type AgentOnboardingProgressStageTiming = {
    stage: AgentOnboardingProgressStage;
    state: AgentOnboardingStageTiming['state'];
    durationMs: number | null;
};

const parseTimestamp = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
};

const isHandoffFile = ({ path }: AgentOnboardingFile): boolean =>
    /LIGHTDASH_(?:ONBOARDING_)?HANDOFF.*\.md$/i.test(path);

const getHandoffTimestamp = (files: AgentOnboardingFile[]): number | null => {
    const timestamps = files
        .filter(isHandoffFile)
        .map(({ updatedAt }) => parseTimestamp(updatedAt))
        .filter((timestamp): timestamp is number => timestamp !== null);

    return timestamps.length > 0 ? Math.max(...timestamps) : null;
};

const getVisibleTimestamps = (run: AgentOnboardingRun): number[] => [
    ...run.events
        .map(({ createdAt }) => parseTimestamp(createdAt))
        .filter((timestamp): timestamp is number => timestamp !== null),
    ...run.files
        .map(({ updatedAt }) => parseTimestamp(updatedAt))
        .filter((timestamp): timestamp is number => timestamp !== null),
];

const getAgentOnboardingStageTimings = (
    run: AgentOnboardingRun,
    now = Date.now(),
): AgentOnboardingStageTiming[] => {
    const starts = new Map<AgentOnboardingStage, number>();
    const orderedEvents = run.events
        .map((event, order) => ({
            ...event,
            order,
            timestamp: parseTimestamp(event.createdAt),
        }))
        .filter(
            (event): event is typeof event & { timestamp: number } =>
                event.timestamp !== null,
        )
        .sort(
            (left, right) =>
                left.timestamp - right.timestamp || left.order - right.order,
        );

    let furthestStageIndex = -1;
    for (const event of orderedEvents) {
        if (!event.stage) continue;
        const stageIndex = AGENT_ONBOARDING_STAGES.indexOf(event.stage);
        if (stageIndex <= furthestStageIndex) continue;
        starts.set(event.stage, event.timestamp);
        furthestStageIndex = stageIndex;
    }

    const visibleTimestamps = getVisibleTimestamps(run);
    const earliestVisible =
        visibleTimestamps.length > 0 ? Math.min(...visibleTimestamps) : null;
    const fallbackStart =
        parseTimestamp(run.startedAt) ?? parseTimestamp(run.createdAt);

    if (!starts.has('preparing_project')) {
        const preparingStart = earliestVisible ?? fallbackStart;
        if (preparingStart !== null) {
            starts.set('preparing_project', preparingStart);
        }
    } else if (earliestVisible !== null) {
        starts.set(
            'preparing_project',
            Math.min(starts.get('preparing_project')!, earliestVisible),
        );
    }

    const currentStageIndex = run.stage
        ? AGENT_ONBOARDING_STAGES.indexOf(run.stage)
        : -1;
    if (
        run.stage &&
        !starts.has(run.stage) &&
        currentStageIndex > furthestStageIndex
    ) {
        const transitionEvidence = [
            ...orderedEvents.map(({ timestamp }) => timestamp),
            ...run.files
                .filter((file) => !isHandoffFile(file))
                .map(({ updatedAt }) => parseTimestamp(updatedAt))
                .filter((timestamp): timestamp is number => timestamp !== null),
        ];
        const latestTransition =
            transitionEvidence.length > 0
                ? Math.max(...transitionEvidence)
                : fallbackStart;
        if (latestTransition !== null) starts.set(run.stage, latestTransition);
    }

    const isTerminal = isAgentOnboardingRunTerminal(run.status);
    const handoffTimestamp = getHandoffTimestamp(run.files);
    const latestVisible =
        visibleTimestamps.length > 0 ? Math.max(...visibleTimestamps) : null;
    const databaseEnd =
        parseTimestamp(run.completedAt) ?? parseTimestamp(run.updatedAt);
    const terminalEnd =
        run.status === 'completed' && handoffTimestamp !== null
            ? handoffTimestamp
            : (latestVisible ?? databaseEnd ?? now);
    const activeStage = AGENT_ONBOARDING_STAGES.findLast((stage) =>
        starts.has(stage),
    );

    return AGENT_ONBOARDING_STAGES.map((stage, stageIndex) => {
        const startedAt = starts.get(stage);
        if (startedAt === undefined) {
            return { stage, state: 'not_started', durationMs: null };
        }

        const nextStartedAt = AGENT_ONBOARDING_STAGES.slice(stageIndex + 1)
            .map((nextStage) => starts.get(nextStage))
            .find((timestamp): timestamp is number => timestamp !== undefined);
        const isActive = !isTerminal && stage === activeStage;
        const endedAt = nextStartedAt ?? (isActive ? now : terminalEnd);

        return {
            stage,
            state: isActive ? 'active' : 'completed',
            durationMs: Math.max(0, endedAt - startedAt),
        };
    });
};

export const getAgentOnboardingProgressStageTimings = (
    run: AgentOnboardingRun,
    now = Date.now(),
): AgentOnboardingProgressStageTiming[] => {
    const stageTimings = getAgentOnboardingStageTimings(run, now);

    return AGENT_ONBOARDING_PROGRESS_STAGES.map(({ stage, sourceStages }) => {
        const timings = stageTimings.filter((timing) =>
            sourceStages.some((sourceStage) => sourceStage === timing.stage),
        );
        const state = timings.some((timing) => timing.state === 'active')
            ? 'active'
            : timings.some((timing) => timing.state === 'completed')
              ? 'completed'
              : 'not_started';
        const durations = timings
            .map(({ durationMs }) => durationMs)
            .filter((durationMs): durationMs is number => durationMs !== null);

        return {
            stage,
            state,
            durationMs:
                durations.length > 0
                    ? durations.reduce(
                          (total, durationMs) => total + durationMs,
                          0,
                      )
                    : null,
        };
    });
};

export type StageState =
    | AgentOnboardingProgressStageTiming['state']
    | 'stopped';

// A cancelled or failed run leaves its last started stage unfinished
export const getStageStates = (
    run: AgentOnboardingRun | undefined,
    timings: AgentOnboardingProgressStageTiming[] | undefined,
): StageState[] => {
    if (!run || !timings || run.status === 'queued') {
        return AGENT_ONBOARDING_PROGRESS_STAGES.map(() => 'not_started');
    }
    if (run.status === 'completed') {
        return AGENT_ONBOARDING_PROGRESS_STAGES.map(() => 'completed');
    }
    const states: StageState[] = timings.map(({ state }) => state);
    if (run.status === 'cancelled' || run.status === 'failed') {
        const lastStartedIndex = states.findLastIndex(
            (state) => state !== 'not_started',
        );
        if (lastStartedIndex >= 0) states[lastStartedIndex] = 'stopped';
    }
    return states;
};

export const formatStageDuration = (durationMs: number | null): string => {
    if (durationMs === null) return '—';
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
};

export const sanitizeTerminalText = (value: string): string => {
    const withoutAnsi = value.replace(
        new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g'),
        '',
    );
    return Array.from(withoutAnsi)
        .filter((character) => {
            const code = character.charCodeAt(0);
            return character === '\n' || character === '\t' || code >= 32;
        })
        .join('');
};

export type AgentOnboardingFileKind = 'model' | 'chart' | 'dashboard' | 'other';

/** Which part of the project a written file is, and what to call it */
export const describeAgentOnboardingFile = (
    path: string,
): { kind: AgentOnboardingFileKind; label: string } => {
    const kind: AgentOnboardingFileKind = /(^|\/)models\//.test(path)
        ? 'model'
        : /(^|\/)charts\//.test(path)
          ? 'chart'
          : /(^|\/)dashboards\//.test(path)
            ? 'dashboard'
            : 'other';
    return {
        kind,
        label:
            kind === 'other'
                ? (path.split('/').pop() ?? path)
                : humanizeSlug(fileName(path)),
    };
};

export const getAgentOnboardingRunUrl = (
    runUuid: string,
    projectUuid: string,
): string =>
    `/projects/${encodeURIComponent(projectUuid)}/onboarding/runs/${encodeURIComponent(runUuid)}`;

const AGENT_ONBOARDING_DASHBOARD_SLUG = 'agent-starter-dashboard';

export const getAgentOnboardingDashboardUrl = (projectUuid: string): string =>
    `/projects/${encodeURIComponent(projectUuid)}/dashboards/${AGENT_ONBOARDING_DASHBOARD_SLUG}/view`;

export const AGENT_ONBOARDING_STAGE_ACTIVE_LABELS: Record<
    AgentOnboardingProgressStage,
    string
> = {
    explore: 'Exploring your warehouse',
    semantic_layer: 'Building the semantic layer',
    dashboard: 'Creating a starter dashboard',
    ready: 'Verifying and handing off',
};

const humanizeSlug = (slug: string): string => {
    const words = slug.replace(/^agent-starter-/, '').replace(/[-_]+/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
};

const fileName = (path: string): string =>
    path
        .split('/')
        .pop()
        ?.replace(/\.ya?ml$/, '') ?? path;

/** Plain-language line for a run event, or null for housekeeping the user doesn't need */
export const describeAgentOnboardingEvent = (
    message: string,
): string | null => {
    const text = message.trim();
    const table = text.match(/warehouse-catalog.*--table\s+(\S+)/)?.[1];
    if (table) return `Read the ${table} table`;
    const schema = text.match(/warehouse-catalog.*--schema\s+(\S+)/)?.[1];
    if (schema) return `Listed the tables in ${schema}`;
    if (/^lightdash sql\b/.test(text)) return 'Profiled the data with a query';
    const model = text.match(/^Write: \S*models\/(\S+)$/)?.[1];
    if (model) return `Wrote the ${fileName(model)} model`;
    const chart = text.match(/^Write: \S*charts\/(\S+)$/)?.[1];
    if (chart) return `Drafted ${humanizeSlug(fileName(chart))}`;
    if (/^Write: \S*dashboards\//.test(text))
        return 'Laid out the starter dashboard';
    const checked = text.match(/run-chart.*charts\/(\S+)/)?.[1];
    if (checked) return `Checked ${humanizeSlug(fileName(checked))}`;
    if (/^lightdash deploy\b/.test(text)) return 'Deployed the semantic layer';
    if (/^lightdash upload\b/.test(text))
        return 'Uploaded the charts and dashboard';
    if (/^lightdash validate\b/.test(text)) return 'Validated the project';
    if (/^lightdash lint\b/.test(text)) return 'Checked the YAML';
    if (/^Preparing\b/.test(text)) return 'Getting ready';
    return null;
};

export type AgentOnboardingRunArtifacts = {
    tables: string[];
    models: string[];
    charts: string[];
};

/** What the run has produced so far, named the way a person would say it */
export const collectAgentOnboardingArtifacts = (
    events: AgentOnboardingRunEvent[],
): AgentOnboardingRunArtifacts => {
    const collect = (pattern: RegExp) => [
        ...new Set(
            events
                .map(({ message }) => message.match(pattern)?.[1])
                .filter((match): match is string => !!match),
        ),
    ];
    return {
        tables: collect(/warehouse-catalog.*--table\s+(\S+)/),
        models: collect(/^Write: \S*models\/(\S+)$/).map(fileName),
        charts: collect(/^Write: \S*charts\/(\S+)$/).map((chart) =>
            humanizeSlug(fileName(chart)),
        ),
    };
};

export type AgentOnboardingRunSummary = {
    tables: number;
    models: number;
    charts: number;
};

export const summarizeAgentOnboardingEvents = (
    events: AgentOnboardingRunEvent[],
): AgentOnboardingRunSummary => {
    const { tables, models, charts } = collectAgentOnboardingArtifacts(events);
    return {
        tables: tables.length,
        models: models.length,
        charts: charts.length,
    };
};

export type SemanticLayerField = {
    name: string;
    label: string;
    type: DimensionType | MetricType | null;
    description: string | null;
};

export type SemanticLayerModel = {
    name: string;
    label: string;
    dimensions: SemanticLayerField[];
    metrics: SemanticLayerField[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asText = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value : null;

const FIELD_TYPES: ReadonlyArray<string> = [
    ...Object.values(DimensionType),
    ...Object.values(MetricType),
];

const isFieldType = (value: unknown): value is DimensionType | MetricType =>
    typeof value === 'string' && FIELD_TYPES.includes(value);

const toField = (
    name: string,
    raw: Record<string, unknown>,
): SemanticLayerField => ({
    name,
    label: asText(raw.label) ?? humanizeSlug(name),
    type: isFieldType(raw.type) ? raw.type : null,
    description: asText(raw.description),
});

// Fields come as a list of `{ name }` or a map keyed by name; hidden ones are plumbing
const toFields = (raw: unknown): SemanticLayerField[] => {
    const entries: [string, Record<string, unknown>][] = Array.isArray(raw)
        ? raw.flatMap((item) => {
              const name = isRecord(item) ? asText(item.name) : null;
              return isRecord(item) && name ? [[name, item]] : [];
          })
        : isRecord(raw)
          ? Object.entries(raw).flatMap(([name, item]) =>
                isRecord(item) ? [[name, item]] : [],
            )
          : [];
    return entries
        .filter(([, item]) => item.hidden !== true)
        .map(([name, item]) => toField(name, item));
};

/** Reads a parsed Lightdash model YAML, or null when it isn't one (yet) */
export const toSemanticLayerModel = (
    path: string,
    parsed: unknown,
): SemanticLayerModel | null => {
    if (!isRecord(parsed)) return null;
    const name = asText(parsed.name) ?? fileName(path);
    return {
        name,
        label: asText(parsed.label) ?? humanizeSlug(name),
        dimensions: toFields(parsed.dimensions),
        metrics: toFields(parsed.metrics),
    };
};

export const parseSemanticLayerModel = (
    path: string,
    content: string,
): SemanticLayerModel | null => {
    try {
        return toSemanticLayerModel(path, load(content));
    } catch {
        // A file mid-write is not valid YAML yet
        return null;
    }
};

export const isSemanticLayerModelFile = ({ path }: AgentOnboardingFile) =>
    /(^|\/)models\/[^/]+\.ya?ml$/i.test(path);

export const SEMANTIC_LAYER_ANCHOR = 'semantic-layer';
