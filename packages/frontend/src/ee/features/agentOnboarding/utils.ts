import {
    AGENT_ONBOARDING_STAGES,
    isAgentOnboardingRunTerminal,
    type AgentOnboardingFile,
    type AgentOnboardingRun,
    type AgentOnboardingStage,
} from '@lightdash/common';

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

export const getAgentOnboardingProgressStageIndex = (
    stage: AgentOnboardingStage | null,
): number =>
    stage === null
        ? -1
        : AGENT_ONBOARDING_PROGRESS_STAGES.findIndex(({ sourceStages }) =>
              sourceStages.some((sourceStage) => sourceStage === stage),
          );

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

export type AgentOnboardingFileTreeNode = {
    name: string;
    path: string;
    file: AgentOnboardingFile | null;
    children: AgentOnboardingFileTreeNode[];
};

export const buildAgentOnboardingFileTree = (
    files: AgentOnboardingFile[],
): AgentOnboardingFileTreeNode[] => {
    const root: AgentOnboardingFileTreeNode[] = [];

    for (const file of [...files].sort((left, right) =>
        left.path.localeCompare(right.path),
    )) {
        const segments = file.path.split('/').filter(Boolean);
        let children = root;
        let currentPath = '';

        segments.forEach((segment, index) => {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            const isFile = index === segments.length - 1;
            let node = children.find(({ name }) => name === segment);
            if (!node) {
                node = {
                    name: segment,
                    path: currentPath,
                    file: isFile ? file : null,
                    children: [],
                };
                children.push(node);
            } else if (isFile) {
                node.file = file;
            }
            children = node.children;
        });
    }

    const sortNodes = (
        nodes: AgentOnboardingFileTreeNode[],
    ): AgentOnboardingFileTreeNode[] =>
        nodes
            .map((node) => ({ ...node, children: sortNodes(node.children) }))
            .sort((left, right) => {
                if (left.file === null && right.file !== null) return -1;
                if (left.file !== null && right.file === null) return 1;
                return left.name.localeCompare(right.name);
            });

    return sortNodes(root);
};

export const getAgentOnboardingRunUrl = (
    runUuid: string,
    projectUuid: string,
): string =>
    `/projects/${encodeURIComponent(projectUuid)}/onboarding/runs/${encodeURIComponent(runUuid)}`;

const AGENT_ONBOARDING_DASHBOARD_SLUG = 'agent-starter-dashboard';

export const getAgentOnboardingDashboardUrl = (projectUuid: string): string =>
    `/projects/${encodeURIComponent(projectUuid)}/dashboards/${AGENT_ONBOARDING_DASHBOARD_SLUG}/view`;
