import { subject } from '@casl/ability';
import {
    DbtProjectType,
    FeatureFlags,
    type AgentSuggestion,
    type AiPromptContextInput,
    type AiPromptContextItem,
    type AiRouter,
} from '@lightdash/common';
import { Anchor, Skeleton, Text } from '@mantine-8/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProject } from '../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import {
    AI_ROUTING_AUTO_VALUE,
    AI_ROUTING_SEARCH_PARAM,
} from '../aiCopilot/components/AgentSelector/AgentSelectorUtils';
import { AgentChatInput } from '../aiCopilot/components/ChatElements/AgentChatInput';
import { usePendingPrompt } from '../aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { type StartDeepResearchArgs } from '../aiCopilot/deepResearch/types';
import { useAgentSuggestions } from '../aiCopilot/hooks/useAgentSuggestions';
import { useCanCreateAiAgentThread } from '../aiCopilot/hooks/useAiAgentPermission';
import { useAiAgentSqlModeAvailable } from '../aiCopilot/hooks/useAiAgentSqlModeAvailable';
import { useStartDeepResearchForThreadMutation } from '../aiCopilot/hooks/useDeepResearch';
import {
    useCreateAgentThreadMutation,
    useProjectAiAgents,
} from '../aiCopilot/hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../aiCopilot/hooks/useUserAgentPreferences';
import blockClasses from './blocks/blockStyles.module.css';
import classes from './DayOneAskInput.module.css';

const AI_ROUTER_QUERY_KEY = 'ai-router';

type Props = {
    projectUuid: string | null;
    preview?: boolean;
    hideSuggestions?: boolean;
};

// AgentSelector (rendered inside AgentChatInput below) already calls
// useAiRouterConfig() to build its own dropdown. Calling that same hook a
// second time here — a second live observer on the exact same query key —
// triggers an infinite refetch loop (reproduced locally: 2000+ renders/sec).
// Reading the cache directly, with no observer, avoids it while still
// letting day-0 default to Auto once the config is known.
const useAiRouterEnabledFromCache = (): boolean | undefined => {
    const queryClient = useQueryClient();
    const [enabled, setEnabled] = useState<boolean | undefined>(
        () =>
            queryClient.getQueryData<AiRouter>([AI_ROUTER_QUERY_KEY])?.enabled,
    );
    useEffect(
        () =>
            queryClient.getQueryCache().subscribe((event) => {
                const key = event.query.queryKey;
                if (key.length === 1 && key[0] === AI_ROUTER_QUERY_KEY) {
                    setEnabled(
                        (event.query.state.data as AiRouter | undefined)
                            ?.enabled,
                    );
                }
            }),
        [queryClient],
    );
    return enabled;
};

const inputHoldClass = (projectUuid: string | null) =>
    projectUuid ? classes.inputHold : classes.inputHoldMinimal;

// The composer's footprint on a surface that is still deciding whether it can
// show a composer at all. Lives here so the reserved height is stated once,
// next to the composer it stands in for.
export const DayOneAskInputPlaceholder: FC<
    Pick<Props, 'projectUuid' | 'hideSuggestions'>
> = ({ projectUuid, hideSuggestions }) => (
    <div className={classes.composer}>
        <Skeleton className={inputHoldClass(projectUuid)} radius="lg" />
        {!projectUuid && <Skeleton h={17} w={260} mt={10} mx="auto" />}
        {!hideSuggestions && <div className={classes.pillRow} />}
    </div>
);

// Two chips, not the full generated set. On the homepage the composer is the
// opening view and the chips are a hint at what it can do — five of them read
// as a menu to work through, and they cost more vertical space than the
// composer itself, pushing curated content under the fold. The thread page
// still shows the full set, where there's nothing below to protect.
const HOMEPAGE_SUGGESTION_LIMIT = 2;

// The chips come from an LLM generation, so on a cold view they land a second
// or two after the composer. The row reserves one chip-line of height while
// loading so their arrival never shoves the greeting/composer up; the chips
// then fade + rise in, staggered, so it reads as intentional rather than a
// pop. Once the query settles with no chips (e.g. generation failed past its
// retry) the row collapses so there's no permanent empty gap.
const SuggestionPills: FC<{
    chips: AgentSuggestion[];
    loading: boolean;
    onPick: (chip: AgentSuggestion, index: number) => void;
}> = ({ chips, loading, onPick }) => {
    if (!loading && chips.length === 0) return null;
    return (
        <div className={classes.pillRow}>
            {chips.map((chip, index) => (
                <button
                    key={chip.label}
                    type="button"
                    className={classes.pill}
                    onClick={() => onPick(chip, index)}
                >
                    <MantineIcon
                        icon={IconArrowUpRight}
                        size={12}
                        color="ldGray.5"
                    />
                    {chip.label}
                </button>
            ))}
        </div>
    );
};

// The exact composer used on real agent threads — reused here so day-0's ask
// experience looks and feels identical, not a lookalike. Selecting a
// different agent from the built-in AgentSelector navigates to that agent's
// thread page (same as everywhere else it's used); picking one before typing
// leaves day-0, which is expected. No sql-mode toggle: onSqlModeChange is
// intentionally omitted. Suggestion chips are fetched and rendered locally
// (not via AgentChatInput's own `showSuggestions`) so they keep the design's
// pill styling, and so a specific reference agent can power them even when
// the composer itself is in Auto mode.
const DayOneAskInputInner: FC<Props> = ({
    projectUuid,
    preview = false,
    hideSuggestions,
}) => {
    const navigate = useNavigate();
    const { track, data: trackingData } = useTracking();
    const isTrackingReady = !!trackingData.rudder;
    const { user } = useApp();
    const { setPendingPrompt } = usePendingPrompt();
    const { data: agents, isInitialLoading: isLoadingAgents } =
        useProjectAiAgents({
            projectUuid,
            redirectOnUnauthorized: false,
            options: { enabled: !!projectUuid },
        });
    const {
        data: userAgentPreferences,
        isInitialLoading: isLoadingPreferences,
    } = useGetUserAgentPreferences(projectUuid);
    const canCreateThread = useCanCreateAiAgentThread(projectUuid ?? undefined);
    const canManageProject =
        user.data?.ability?.can(
            'manage',
            subject('Project', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid ?? undefined,
            }),
        ) ?? false;
    const routerEnabled = useAiRouterEnabledFromCache();
    const { mutateAsync: createAgentThread, isLoading: isCreatingThread } =
        useCreateAgentThreadMutation(projectUuid ?? '');
    const { mutateAsync: startDeepResearch } =
        useStartDeepResearchForThreadMutation(projectUuid ?? '', 'homepage');
    const deepResearchFlag = useServerFeatureFlag(FeatureFlags.AiDeepResearch);

    const showAutoOption = (agents?.length ?? 0) > 1 && routerEnabled === true;
    const validDefaultAgent = agents?.find(
        (agent) => agent.uuid === userAgentPreferences?.defaultAgentUuid,
    );
    // Auto is the default whenever it's available — Auto mode can't have its
    // own suggestions, so the chip row below always sources from a concrete
    // reference agent regardless of what the composer is currently set to.
    const activeSelection =
        validDefaultAgent ?? (showAutoOption ? 'auto' : agents?.[0]);
    const referenceAgent = validDefaultAgent ?? agents?.[0];
    const selectedAgent =
        activeSelection === 'auto' ? undefined : activeSelection;

    const { data: project } = useProject(projectUuid ?? undefined);
    const sqlModeAvailable = useAiAgentSqlModeAvailable(
        projectUuid ?? undefined,
    );
    // Dbt-less projects have no explores yet — the agent queries the
    // warehouse catalog directly via SQL mode until a semantic layer exists.
    const enableSqlMode =
        sqlModeAvailable &&
        project?.dbtConnection?.type === DbtProjectType.NONE;

    const suggestionsQuery = useAgentSuggestions({
        projectUuid: projectUuid ?? '',
        agentUuid: referenceAgent?.uuid,
        enableSqlMode,
        enabled: !!projectUuid && !!referenceAgent && !hideSuggestions,
    });

    const submitPrompt = (
        prompt: string,
        toolHints: string[] = [],
        context?: AiPromptContextInput,
        optimisticContext?: AiPromptContextItem[],
    ) => {
        if (!projectUuid) return;
        if (activeSelection === 'auto') {
            setPendingPrompt(prompt);
            void navigate(
                {
                    pathname: `/projects/${projectUuid}/ai-agents`,
                    search: new URLSearchParams({
                        [AI_ROUTING_SEARCH_PARAM]: AI_ROUTING_AUTO_VALUE,
                    }).toString(),
                },
                { state: { autoSubmitPrompt: prompt }, viewTransition: true },
            );
            return;
        }
        if (!activeSelection) {
            void navigate(`/projects/${projectUuid}/ai-agents`);
            return;
        }
        void createAgentThread({
            agentUuid: activeSelection.uuid,
            prompt,
            toolHints,
            context,
            optimisticContext,
            enableSqlMode,
        });
    };

    const handleSubmit = ({
        message,
        toolHints,
        context,
        optimisticContext,
    }: {
        message: string;
        toolHints: string[];
        context?: AiPromptContextInput;
        optimisticContext?: AiPromptContextItem[];
    }) => {
        const prompt = message.trim();
        if (!prompt) return;
        track({
            name: EventName.HOMEPAGE_ASK_SUBMITTED,
            properties: {
                mode: activeSelection === 'auto' ? 'auto' : 'agent',
                hasProject: !!projectUuid,
            },
        });
        submitPrompt(prompt, toolHints, context, optimisticContext);
    };

    const handleStartDeepResearch = useCallback(
        async ({ question }: StartDeepResearchArgs) => {
            if (!projectUuid || !selectedAgent) {
                return;
            }
            const thread = await createAgentThread({
                agentUuid: selectedAgent.uuid,
                prompt: question,
                skipAgentResponse: true,
            });
            await startDeepResearch({
                question,
                agentUuid: selectedAgent.uuid,
                threadUuid: thread.uuid,
                promptUuid: thread.firstMessage.uuid,
            });
        },
        [createAgentThread, projectUuid, selectedAgent, startDeepResearch],
    );

    const handleChipPick = (chip: AgentSuggestion, index: number) => {
        const organizationId = user.data?.organizationUuid;
        if (organizationId && projectUuid && referenceAgent?.uuid) {
            track({
                name: EventName.AI_AGENT_SUGGESTION_CLICK,
                properties: {
                    organizationId,
                    projectId: projectUuid,
                    agentId: referenceAgent.uuid,
                    chipLabel: chip.label,
                    chipKind: chip.kind,
                    chipTool: chip.kind === 'prompt' ? chip.tool : undefined,
                    chipIndex: index,
                    mode: 'empty-state',
                    placement: 'homepage_hero',
                },
            });
        }
        if (chip.kind === 'navigate') {
            void navigate(chip.url);
            return;
        }
        submitPrompt(chip.label, [chip.tool]);
    };

    // Sliced at the source so the impression/click analytics count what the
    // viewer actually saw.
    const chips = (suggestionsQuery.data?.chips ?? []).slice(
        0,
        HOMEPAGE_SUGGESTION_LIMIT,
    );
    const impressionFiredRef = useRef(false);
    useEffect(() => {
        if (impressionFiredRef.current) return;
        if (!isTrackingReady) return;
        if (hideSuggestions) return;
        if (!projectUuid || !referenceAgent?.uuid) return;
        if (chips.length === 0) return;
        impressionFiredRef.current = true;
        track({
            name: EventName.AI_AGENT_SUGGESTION_IMPRESSION,
            properties: {
                projectId: projectUuid,
                agentId: referenceAgent.uuid,
                chipCount: chips.length,
                placement: 'homepage_hero',
            },
        });
    }, [
        isTrackingReady,
        chips.length,
        projectUuid,
        referenceAgent?.uuid,
        hideSuggestions,
        track,
    ]);

    const isComposerLoading = isLoadingAgents || isLoadingPreferences;

    if (!isComposerLoading && projectUuid && (!agents || agents.length === 0)) {
        return (
            <div className={blockClasses.dashedEmpty}>
                Set up an AI agent to enable Ask AI here —{' '}
                <Anchor size="xs" href="/generalSettings/ai/agents">
                    go to settings
                </Anchor>
                .
            </div>
        );
    }

    return (
        // In the builder (preview) the composer stays visually active but the
        // whole subtree is `inert`: no focus, no typing, no submit — it just
        // shows what viewers will get.
        <div className={classes.composer} inert={preview}>
            {/* The hold sits in the input's own slot rather than replacing the
                whole block, so the hint and chip row keep their place and the
                composer resolves without moving anything around it. */}
            {isComposerLoading ? (
                <Skeleton className={inputHoldClass(projectUuid)} radius="lg" />
            ) : (
                <AgentChatInput
                    projectUuid={projectUuid ?? undefined}
                    agentUuid={selectedAgent?.uuid}
                    agents={agents}
                    selectedAgent={activeSelection ?? agents?.[0]}
                    placeholder={
                        activeSelection === 'auto'
                            ? 'Ask anything about your data…'
                            : activeSelection
                              ? `Ask ${activeSelection.name}…`
                              : 'Ask anything about your data…'
                    }
                    onSubmit={handleSubmit}
                    onStartDeepResearch={
                        selectedAgent && deepResearchFlag.data?.enabled
                            ? handleStartDeepResearch
                            : undefined
                    }
                    loading={isCreatingThread}
                    showSuggestions={false}
                    fullWidth
                    revealControlsOnFocus
                    dense
                    disabled={!projectUuid || !canCreateThread}
                    disabledReason={
                        projectUuid && !canCreateThread
                            ? "Your role can view AI agents but can't start conversations. Ask a workspace admin for access."
                            : undefined
                    }
                />
            )}
            {!projectUuid && (
                <Text size="xs" c="dimmed" ta="center" mt={10}>
                    {canManageProject
                        ? 'Connect your data to start asking questions'
                        : 'An organisation admin will need to connect to the data warehouse before you can ask questions'}
                </Text>
            )}
            {!hideSuggestions && (canCreateThread || preview) && (
                <SuggestionPills
                    chips={chips}
                    loading={suggestionsQuery.isLoading}
                    onPick={handleChipPick}
                />
            )}
        </div>
    );
};

// No local Provider/AbortController wrap: AiAgentsGlobalProvider already
// wraps the whole app once.
export const DayOneAskInput: FC<Props> = (props) => (
    <DayOneAskInputInner {...props} />
);
