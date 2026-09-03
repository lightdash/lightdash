import { subject } from '@casl/ability';
import {
    FeatureFlags,
    getExternalSourceDisplayName,
    isSpaceRestrictedAgent,
    type AgentSuggestion,
    type AiPromptContextInput,
    type AiPromptContextItem,
    type AiPromptContextItemInput,
    type AiModelOption,
    type ExternalSource,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    FileButton,
    Group,
    Menu,
    Paper,
    Text,
} from '@mantine/core';
import {
    IconArrowUp,
    IconCheck,
    IconPaperclip,
    IconPlayerStop,
    IconPlus,
    IconTelescope,
    IconTerminal2,
} from '@tabler/icons-react';
import Mention from '@tiptap/extension-mention';
import { type AnyExtension, type Editor } from '@tiptap/react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ModelSelector } from '../../../../../components/common/ModelSelector/ModelSelector';
import {
    ComposerSubmitButton,
    PromptComposer,
} from '../../../../../components/common/PromptComposer';
import useUser from '../../../../../hooks/user/useUser';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../../providers/App/useApp';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { subscribeToDeepResearchComposerPrompt } from '../../deepResearch/deepResearchRegistry';
import {
    canShowDeepResearchNudge,
    dismissDeepResearchNudgeForSession,
    isDeepResearchDraft,
    markDeepResearchNudgeShown,
} from '../../deepResearch/draftNudge';
import { type StartDeepResearchArgs } from '../../deepResearch/types';
import { isEmbedAiAgentRoute } from '../../hooks/aiAgentRouting';
import { useAgentSuggestions } from '../../hooks/useAgentSuggestions';
import { useCsvSourceAttachment } from '../../hooks/useCsvSourceAttachment';
import { useHasActiveDeepResearchRun } from '../../hooks/useDeepResearch';
import { useDeepResearchComposer } from '../../hooks/useDeepResearchComposer';
import {
    useCreateAiAgentThreadMessageSteerMutation,
    useInterruptAiAgentThreadMessageMutation,
    useProjectAiAgent,
} from '../../hooks/useProjectAiAgents';
import {
    clearThreadElementReferences,
    removeThreadElementReference,
    selectThreadElementReferences,
    type ThreadElementReference,
} from '../../store/aiAgentThreadElementRefsSlice';
import { isAiAgentThreadStreamActive } from '../../store/aiAgentThreadStreamSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { useAiAgentThreadStreamQuery } from '../../streaming/useAiAgentThreadStreamQuery';
import { AgentSelector } from '../AgentSelector';
import { type Agent } from '../AgentSelector/AgentSelectorUtils';
import styles from './AgentChatInput.module.css';
import { AgentSuggestionChips } from './AgentSuggestionChips';
import {
    CLOSED_CONTENT_MENTION_MENU,
    contentMentionMenuOwnsEnter,
    createContentMentionExtension,
    extractContentMentionContext,
    isContentMentionSuggestionActive,
    type ContentMentionMenuState,
    type ContentMentionSuggestionItem,
} from './contentMentions';
import {
    PromptAttachments,
    type ExternalSourceAttachment,
} from './PromptAttachments';
import { getAgentSuggestionModes } from './suggestionModes';

const SUGGESTION_CHIP_MENTION_NAME = 'suggestionChip';

type SubmitContext = {
    context?: AiPromptContextInput;
    optimisticContext?: AiPromptContextItem[];
};

/** Context the composer submits with a prompt; keys are omitted when empty. */
const buildSubmitContext = ({
    mentionContext,
    externalSources,
    elementReferences,
}: {
    mentionContext: SubmitContext;
    externalSources: ExternalSourceAttachment[];
    elementReferences: ThreadElementReference[];
}): SubmitContext => {
    const context: AiPromptContextItemInput[] = [
        ...(mentionContext.context ?? []),
        ...externalSources.map(({ sourceUuid }) => ({
            type: 'external_source' as const,
            sourceUuid,
        })),
        ...elementReferences.map(({ appUuid, version, tag, text, loc }) => ({
            type: 'data_app_element' as const,
            appUuid,
            version,
            tag,
            text,
            loc,
        })),
    ];
    const optimisticContext: AiPromptContextItem[] = [
        ...(mentionContext.optimisticContext ?? []),
        ...externalSources,
        ...elementReferences.map(
            ({
                appUuid,
                appSlug,
                appDisplayName,
                version,
                tag,
                text,
                loc,
            }) => ({
                type: 'data_app_element' as const,
                appUuid,
                version,
                tag,
                text,
                loc,
                appSlug,
                displayName: appDisplayName,
            }),
        ),
    ];
    return {
        ...(context.length > 0 ? { context } : {}),
        ...(optimisticContext.length > 0 ? { optimisticContext } : {}),
    };
};
const ACTIVE_DEEP_RESEARCH_DISABLED_REASON =
    'Only one deep research run can be active in a thread at a time.';

type AgentComposerMode = 'ask' | 'deep_research';

const SuggestionChipMention = Mention.extend({
    name: SUGGESTION_CHIP_MENTION_NAME,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-id'),
                renderHTML: (attributes) =>
                    attributes.id ? { 'data-id': attributes.id } : {},
            },
            label: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-label'),
                renderHTML: (attributes) =>
                    attributes.label ? { 'data-label': attributes.label } : {},
            },
        };
    },
});

type SubmitArgs = SubmitContext & {
    message: string;
    toolHints: string[];
};

interface AgentChatInputProps {
    onSubmit: (args: SubmitArgs) => void;
    onStartDeepResearch?: (args: StartDeepResearchArgs) => Promise<void>;
    loading?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    placeholder?: string;
    messageCount?: number;
    projectUuid?: string;
    agentUuid?: string;
    threadUuid?: string;
    latestAssistantMessageUuid?: string;
    agents?: Agent[];
    selectedAgent?: Agent | 'auto';
    models?: AiModelOption[];
    selectedModelId?: string | null;
    onModelChange?: (modelId: string) => void;
    extendedThinking?: boolean;
    onExtendedThinkingChange?: (enabled: boolean) => void;
    sqlMode?: boolean;
    onSqlModeChange?: (enabled: boolean) => void;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    fullWidth?: boolean;
    clearOnSubmit?: boolean;
    showSuggestions?: boolean;
    contentMentionPriorityItems?: ContentMentionSuggestionItem[];
    // Reveals the deep research and agent controls on first focus instead of
    // showing them always.
    revealControlsOnFocus?: boolean;
    // Shrinks padding/min-heights for a more compact composer.
    dense?: boolean;
    // Rendered below the input, right-aligned like the disabled-reason banner.
    footerNotice?: ReactNode;
}

const extractToolHints = (editor: Editor | null): string[] => {
    if (!editor) return [];
    const hints: string[] = [];
    editor.state.doc.descendants((node) => {
        if (
            node.type.name === SUGGESTION_CHIP_MENTION_NAME &&
            typeof node.attrs.id === 'string'
        ) {
            hints.push(node.attrs.id);
        }
    });
    return hints;
};

export const AgentChatInput = ({
    onSubmit,
    onStartDeepResearch,
    loading = false,
    disabled = false,
    disabledReason,
    placeholder = 'Ask anything',
    messageCount = 0,
    projectUuid,
    agentUuid,
    threadUuid,
    latestAssistantMessageUuid,
    agents,
    selectedAgent,
    models,
    selectedModelId,
    onModelChange,
    extendedThinking = false,
    onExtendedThinkingChange,
    sqlMode = false,
    onSqlModeChange,
    defaultValue,
    onValueChange,
    fullWidth = false,
    clearOnSubmit = true,
    showSuggestions = true,
    contentMentionPriorityItems = [],
    revealControlsOnFocus = false,
    dense = false,
    footerNotice,
}: AgentChatInputProps) => {
    const user = useUser(true);
    const app = useApp();
    const [value, setValueState] = useState(defaultValue ?? '');
    const [externalSourceAttachments, setExternalSourceAttachments] = useState<
        ExternalSourceAttachment[]
    >([]);
    // Picked in the thread's data app preview panel.
    const storeDispatch = useAiAgentStoreDispatch();
    const elementReferences = useAiAgentStoreSelector(
        selectThreadElementReferences(threadUuid),
    );
    const clearElementReferences = useCallback(() => {
        if (threadUuid) {
            storeDispatch(clearThreadElementReferences({ threadUuid }));
        }
    }, [storeDispatch, threadUuid]);
    const resetCsvFileInputRef = useRef<() => void>(null);
    const { data: externalSourcesFlag } = useServerFeatureFlag(
        FeatureFlags.ExternalSources,
    );
    const { data: multiSourceQueryFlag } = useServerFeatureFlag(
        FeatureFlags.MultiSourceQuery,
    );
    const { data: composeSqlRunnerFlag } = useServerFeatureFlag(
        FeatureFlags.ComposeSqlRunner,
    );
    const handleExternalSourceReady = useCallback((source: ExternalSource) => {
        setExternalSourceAttachments((attachments) => [
            ...attachments.filter(
                (attachment) => attachment.sourceUuid !== source.sourceUuid,
            ),
            {
                type: 'external_source',
                sourceUuid: source.sourceUuid,
                displayName: getExternalSourceDisplayName(source),
                sourceType: source.type,
                tables: source.tables.map((table) => ({
                    tableUuid: table.tableUuid,
                    tableName: table.name,
                    displayName: table.label,
                })),
            },
        ]);
    }, []);
    const {
        attachFiles: attachCsvFiles,
        discardSource: discardCsvSource,
        isPreparing: isPreparingCsv,
        pendingFiles: pendingCsvFiles,
        retainSources: retainCsvSources,
    } = useCsvSourceAttachment({
        projectUuid,
        onReady: handleExternalSourceReady,
    });
    const [hasClickedInput, setHasClickedInput] = useState(
        !revealControlsOnFocus,
    );
    const handleInputCardMouseDown = useCallback(() => {
        if (revealControlsOnFocus) setHasClickedInput(true);
    }, [revealControlsOnFocus]);
    const [composerMode, setComposerMode] = useState<AgentComposerMode>('ask');
    // 'idle' → watching the draft; 'shown' → pulsing; 'done' → over for this
    // composer instance.
    const [nudgeState, setNudgeState] = useState<'idle' | 'shown' | 'done'>(
        'idle',
    );
    const navigate = useNavigate();
    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;
    const onValueChangeRef = useRef(onValueChange);
    onValueChangeRef.current = onValueChange;
    const editorRef = useRef<Editor | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const loadingRef = useRef(loading);
    loadingRef.current = loading;
    const disabledRef = useRef(disabled);
    disabledRef.current = disabled;
    const clearOnSubmitRef = useRef(clearOnSubmit);
    clearOnSubmitRef.current = clearOnSubmit;
    const projectUuidRef = useRef(projectUuid);
    projectUuidRef.current = projectUuid;
    const contentMentionPriorityItemsRef = useRef(contentMentionPriorityItems);
    contentMentionPriorityItemsRef.current = contentMentionPriorityItems;
    // A space-restricted agent cannot read personal data apps, so @ hides them.
    const { data: agent } = useProjectAiAgent(projectUuid, agentUuid);
    const hidePersonalDataAppsRef = useRef(false);
    hidePersonalDataAppsRef.current =
        agent !== undefined && isSpaceRestrictedAgent(agent);
    // What the @-mention dropdown is doing, sourced from the suggestion render
    // lifecycle — the plugin's own `active` flag alone can't tell an open
    // menu from a dismissed or empty one.
    const contentMentionMenuRef = useRef<ContentMentionMenuState>(
        CLOSED_CONTENT_MENTION_MENU,
    );

    // Hide the chip strip while the user is scrolled away from the input.
    // Reappears as they scroll back toward the bottom of the thread — chips
    // are noise when reading history.
    const [chipsNearBottom, setChipsNearBottom] = useState(true);
    const [hasRequestedInterrupt, setHasRequestedInterrupt] = useState(false);
    const threadStream = useAiAgentThreadStreamQuery(threadUuid ?? '');
    const interruptMutation = useInterruptAiAgentThreadMessageMutation();
    const steerMutation = useCreateAiAgentThreadMessageSteerMutation();
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return undefined;
        let scrollEl: HTMLElement | null = el.parentElement;
        while (scrollEl) {
            const overflow = window.getComputedStyle(scrollEl).overflowY;
            if (overflow === 'auto' || overflow === 'scroll') break;
            scrollEl = scrollEl.parentElement;
        }
        if (!scrollEl) return undefined;
        // Hysteresis: collapsing the chip strip changes scrollHeight, which
        // can flip the threshold and cause a flicker loop. We hide once the
        // user is past HIDE_PX and only re-show when they're back inside
        // SHOW_PX — the gap absorbs the height change.
        const HIDE_PX = 40;
        const SHOW_PX = 8;
        let raf: number | null = null;
        const measure = () => {
            raf = null;
            if (!scrollEl) return;
            const distance =
                scrollEl.scrollHeight -
                scrollEl.scrollTop -
                scrollEl.clientHeight;
            setChipsNearBottom((prev) => {
                if (prev && distance > HIDE_PX) return false;
                if (!prev && distance < SHOW_PX) return true;
                return prev;
            });
        };
        const onScroll = () => {
            if (raf !== null) return;
            raf = window.requestAnimationFrame(measure);
        };
        measure();
        scrollEl.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            if (raf !== null) window.cancelAnimationFrame(raf);
            scrollEl?.removeEventListener('scroll', onScroll);
        };
    }, []);

    const { track } = useTracking();

    const showModelSelector =
        models && models.length > 1 && onModelChange !== undefined;
    const showAgentSelector = !!(
        agents &&
        selectedAgent &&
        projectUuid &&
        agents.length > 0
    );
    const isMinimalMode = !showModelSelector && !showAgentSelector;

    const { emptyStateMode, postResponseMode } = getAgentSuggestionModes({
        disabled,
        isMinimalMode,
        loading,
        messageCount,
        latestAssistantMessageUuid,
        suggestionsEnabled: showSuggestions,
        threadUuid,
    });

    const suggestionsQuery = useAgentSuggestions({
        projectUuid,
        agentUuid,
        enableSqlMode: sqlMode,
        threadUuid: postResponseMode ? threadUuid : undefined,
        afterMessageUuid: postResponseMode
            ? latestAssistantMessageUuid
            : undefined,
        enabled: emptyStateMode || postResponseMode,
    });

    const [editor, setEditor] = useState<Editor | null>(null);
    editorRef.current = editor;

    const composerExtensions = useMemo<AnyExtension[]>(
        () => [
            SuggestionChipMention.configure({
                renderText: ({ node }) =>
                    typeof node.attrs.label === 'string'
                        ? node.attrs.label
                        : '',
                renderHTML: ({ node }) => [
                    'span',
                    { class: styles.chipMention, 'data-id': node.attrs.id },
                    typeof node.attrs.label === 'string'
                        ? node.attrs.label
                        : '',
                ],
            }),
            createContentMentionExtension({
                getProjectUuid: () => projectUuidRef.current,
                getPriorityItems: () => contentMentionPriorityItemsRef.current,
                getHidePersonalDataApps: () => hidePersonalDataAppsRef.current,
                onMenuStateChange: (state) => {
                    contentMentionMenuRef.current = state;
                },
            }),
        ],
        [],
    );

    // An @-mention dropdown with something to select owns Enter — it selects
    // rather than submits.
    const shouldBlockSubmit = useCallback(
        (ed: Editor | null) =>
            contentMentionMenuOwnsEnter(
                contentMentionMenuRef.current,
                isContentMentionSuggestionActive(ed),
            ),
        [],
    );

    const handleComposerValueChange = useCallback((text: string) => {
        setValueState(text);
        onValueChangeRef.current?.(text);
    }, []);

    useEffect(() => {
        if (!editor || !threadUuid) return undefined;
        return subscribeToDeepResearchComposerPrompt((detail) => {
            if (detail.threadUuid !== threadUuid) return;
            editor.commands.setContent(detail.prompt);
            editor.commands.focus('end');
        });
    }, [editor, threadUuid]);

    const isAgentActive = threadStream
        ? isAiAgentThreadStreamActive(threadStream.connection)
        : false;

    useEffect(() => {
        if (hasRequestedInterrupt && !isAgentActive) {
            setHasRequestedInterrupt(false);
        }
    }, [hasRequestedInterrupt, isAgentActive]);

    const handleChipClick = useCallback(
        (chip: AgentSuggestion, index: number) => {
            const trackClick = () => {
                const organizationId = user.data?.organizationUuid;
                if (!organizationId || !projectUuid || !agentUuid) return;
                track({
                    name: EventName.AI_AGENT_SUGGESTION_CLICK,
                    properties: {
                        organizationId,
                        projectId: projectUuid,
                        agentId: agentUuid,
                        threadId: threadUuid,
                        afterMessageId: latestAssistantMessageUuid,
                        chipLabel: chip.label,
                        chipKind: chip.kind,
                        chipTool:
                            chip.kind === 'prompt' ? chip.tool : undefined,
                        chipIndex: index,
                        mode: emptyStateMode ? 'empty-state' : 'post-response',
                        placement: 'agent_chat',
                    },
                });
            };

            if (chip.kind === 'navigate') {
                trackClick();
                void navigate(chip.url);
                return;
            }

            // Empty-state: insert as a mention so the user can compose around it.
            // Post-response: auto-submit because the user wants exactly that next.
            if (emptyStateMode) {
                if (!editor) return;
                editor
                    .chain()
                    .focus()
                    .insertContent([
                        {
                            type: SUGGESTION_CHIP_MENTION_NAME,
                            attrs: { id: chip.tool, label: chip.label },
                        },
                        { type: 'text', text: ' ' },
                    ])
                    .run();
                trackClick();
                return;
            }

            if (loadingRef.current || disabledRef.current || isPreparingCsv)
                return;
            retainCsvSources(
                externalSourceAttachments.map(({ sourceUuid }) => sourceUuid),
            );
            onSubmitRef.current({
                message: chip.label,
                toolHints: [chip.tool],
                ...buildSubmitContext({
                    mentionContext: {},
                    externalSources: externalSourceAttachments,
                    elementReferences,
                }),
            });
            if (clearOnSubmitRef.current) {
                editor?.commands.clearContent();
                setValueState('');
                setExternalSourceAttachments([]);
                clearElementReferences();
            }
            trackClick();
        },
        [
            editor,
            projectUuid,
            agentUuid,
            threadUuid,
            latestAssistantMessageUuid,
            user.data?.organizationUuid,
            track,
            emptyStateMode,
            navigate,
            externalSourceAttachments,
            elementReferences,
            clearElementReferences,
            isPreparingCsv,
            retainCsvSources,
        ],
    );

    const handleImpression = useCallback(
        (chipCount: number) => {
            if (!projectUuid || !agentUuid) return;
            track({
                name: EventName.AI_AGENT_SUGGESTION_IMPRESSION,
                properties: {
                    projectId: projectUuid,
                    agentId: agentUuid,
                    chipCount,
                    placement: 'agent_chat',
                },
            });
        },
        [track, projectUuid, agentUuid],
    );

    const hasValue = value.trim().length > 0;
    const showDisabledBanner = disabled && disabledReason;
    const isThreadInput = Boolean(threadUuid);
    const canStartDeepResearch = Boolean(
        onStartDeepResearch && !isEmbedAiAgentRoute(),
    );
    const hasActiveDeepResearchRun = useHasActiveDeepResearchRun({
        projectUuid,
        threadUuid,
    });
    const { isStarting: isStartingDeepResearch, startDeepResearch } =
        useDeepResearchComposer({
            canStart:
                canStartDeepResearch &&
                !disabled &&
                !loading &&
                !hasActiveDeepResearchRun,
            onStart: onStartDeepResearch,
        });
    const showSqlModeControl = Boolean(onSqlModeChange && !disabled);
    const activeMessageUuid = isAgentActive
        ? threadStream?.messageUuid
        : undefined;
    const canInterrupt = Boolean(
        projectUuid &&
        agentUuid &&
        threadUuid &&
        isAgentActive &&
        activeMessageUuid,
    );
    const canSteer = canInterrupt && !disabled && !hasRequestedInterrupt;
    const canAttachExternalSource = Boolean(
        projectUuid &&
        externalSourcesFlag?.enabled &&
        multiSourceQueryFlag?.enabled &&
        composeSqlRunnerFlag?.enabled &&
        !isEmbedAiAgentRoute() &&
        app.user.data?.ability.can(
            'manage',
            subject('ExternalSource', {
                organizationUuid: app.user.data.organizationUuid,
                projectUuid,
            }),
        ) &&
        app.user.data?.ability.can(
            'manage',
            subject('Explore', {
                organizationUuid: app.user.data.organizationUuid,
                projectUuid,
            }),
        ),
    );
    const showAttachControl = Boolean(
        canAttachExternalSource && !disabled && !canSteer,
    );
    const canUseAttachControl = showAttachControl && composerMode === 'ask';
    const showDeepResearchInComposerMenu = canStartDeepResearch && !disabled;
    const showComposerActionsMenu = Boolean(
        showSqlModeControl ||
        showAttachControl ||
        showDeepResearchInComposerMenu,
    );

    const handleStartDeepResearch = async () => {
        const ed = editorRef.current;
        const question = ed?.getText().trim() ?? '';
        if (!question) {
            return;
        }
        if (disabled || loading) {
            return;
        }

        const started = await startDeepResearch({ question });
        if (started && clearOnSubmitRef.current) {
            ed?.commands.clearContent();
            setValueState('');
        }
        if (started) {
            setComposerMode('ask');
        }
    };

    const handleSubmit = () => {
        const ed = editorRef.current;
        if (!ed) return;
        const text = ed.getText().trim();
        if (!text || disabled || isPreparingCsv) return;
        if (composerMode === 'deep_research' && canStartDeepResearch) {
            void handleStartDeepResearch();
            return;
        }
        if (canSteer) {
            if (steerMutation.isLoading) return;
            void handleSteer(text);
            return;
        }
        if (loading) return;
        // Sending an investigative draft in plain chat while the nudge is up
        // is an implicit "no thanks" — stop nudging for the whole session.
        if (nudgeState === 'shown') {
            dismissDeepResearchNudgeForSession();
            setNudgeState('done');
        }
        retainCsvSources(
            externalSourceAttachments.map(({ sourceUuid }) => sourceUuid),
        );
        onSubmitRef.current({
            message: text,
            toolHints: extractToolHints(ed),
            ...buildSubmitContext({
                mentionContext: extractContentMentionContext(ed),
                externalSources: externalSourceAttachments,
                elementReferences,
            }),
        });
        if (clearOnSubmitRef.current) {
            ed.commands.clearContent();
            setValueState('');
            setExternalSourceAttachments([]);
            clearElementReferences();
        }
    };

    const handleSteer = async (message: string) => {
        if (!projectUuid || !agentUuid || !threadUuid || !activeMessageUuid) {
            return;
        }

        await steerMutation.mutateAsync({
            projectUuid,
            agentUuid,
            threadUuid,
            messageUuid: activeMessageUuid,
            message,
        });
        editorRef.current?.commands.clearContent();
        setValueState('');
    };

    const handleInterrupt = async () => {
        if (!projectUuid || !agentUuid || !threadUuid || !activeMessageUuid) {
            return;
        }

        await interruptMutation.mutateAsync({
            projectUuid,
            agentUuid,
            threadUuid,
            messageUuid: activeMessageUuid,
        });
        setHasRequestedInterrupt(true);
    };

    useEffect(() => {
        if (!canStartDeepResearch || hasActiveDeepResearchRun) {
            setComposerMode('ask');
        }
    }, [canStartDeepResearch, hasActiveDeepResearchRun]);

    // Pulse once per scope (thread or new-thread composer) when the draft
    // first reads as investigative; a session-wide dismissal (set when the
    // user sends such a draft without enabling Deep Research) silences it
    // everywhere.
    const nudgeScope = threadUuid ?? 'new-thread';
    useEffect(() => {
        if (nudgeState !== 'idle') return;
        if (!canStartDeepResearch || hasActiveDeepResearchRun || disabled) {
            return;
        }
        if (!isDeepResearchDraft(value)) return;
        if (!canShowDeepResearchNudge(nudgeScope)) {
            setNudgeState('done');
            return;
        }
        markDeepResearchNudgeShown(nudgeScope);
        setNudgeState('shown');
    }, [
        nudgeState,
        value,
        canStartDeepResearch,
        hasActiveDeepResearchRun,
        disabled,
        nudgeScope,
    ]);
    const showDeepResearchNudge =
        nudgeState === 'shown' && isDeepResearchDraft(value);

    const chipRow = useMemo(() => {
        if (!emptyStateMode && !postResponseMode) return null;
        if (suggestionsQuery.isError) return null;
        const chips = suggestionsQuery.data?.chips ?? [];
        if (chips.length === 0) return null;
        return (
            <AgentSuggestionChips
                chips={chips}
                onChipClick={handleChipClick}
                onImpression={handleImpression}
                align={isThreadInput ? 'left' : 'center'}
                showPromptAffordance={isThreadInput}
            />
        );
    }, [
        emptyStateMode,
        postResponseMode,
        suggestionsQuery.isError,
        suggestionsQuery.data,
        handleChipClick,
        handleImpression,
        isThreadInput,
    ]);
    const shouldReserveEmptyStateSuggestions =
        !isThreadInput &&
        emptyStateMode &&
        !chipRow &&
        !suggestionsQuery.isError &&
        (suggestionsQuery.isLoading || suggestionsQuery.isFetching);

    const renderChipRow = (extraClassName = '', reserve = false) =>
        (chipRow || reserve) && (
            <Box
                className={`${styles.chipReveal} ${extraClassName} ${
                    chipsNearBottom ? '' : styles.chipHidden
                } ${!chipRow ? styles.chipReserved : ''}`}
                aria-hidden={!chipsNearBottom || !chipRow}
            >
                {chipRow ?? <Box className={styles.chipTrayReserve} />}
            </Box>
        );

    const renderComposerActionsMenu = () => {
        if (!showComposerActionsMenu) {
            return null;
        }

        const deepResearchMenuItem = (
            <Menu.Item
                aria-label={
                    hasActiveDeepResearchRun
                        ? `Deep research unavailable. ${ACTIVE_DEEP_RESEARCH_DISABLED_REASON}`
                        : composerMode === 'deep_research'
                          ? 'Disable deep research'
                          : 'Enable deep research'
                }
                disabled={hasActiveDeepResearchRun}
                closeMenuOnClick={false}
                onClick={() =>
                    setComposerMode(
                        composerMode === 'deep_research'
                            ? 'ask'
                            : 'deep_research',
                    )
                }
                leftSection={
                    <MantineIcon
                        icon={IconTelescope}
                        size={14}
                        color={
                            composerMode === 'deep_research'
                                ? 'indigo.5'
                                : 'ldGray.6'
                        }
                    />
                }
                rightSection={
                    composerMode === 'deep_research' ? (
                        <MantineIcon
                            icon={IconCheck}
                            size={14}
                            color="indigo.5"
                        />
                    ) : null
                }
            >
                <Text component="span" size="sm">
                    Deep research
                </Text>
                {hasActiveDeepResearchRun && (
                    <Text component="span" display="block" size="xs" c="dimmed">
                        {ACTIVE_DEEP_RESEARCH_DISABLED_REASON}
                    </Text>
                )}
            </Menu.Item>
        );

        return (
            <Menu position="bottom-start" width={220}>
                <Menu.Target>
                    <ActionIcon
                        size={30}
                        radius="xl"
                        aria-label="Composer options"
                        className={
                            showDeepResearchNudge &&
                            !hasActiveDeepResearchRun &&
                            composerMode !== 'deep_research'
                                ? styles.deepResearchNudge
                                : undefined
                        }
                    >
                        <MantineIcon icon={IconPlus} size={16} color="dimmed" />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    {showAttachControl && (
                        <>
                            <FileButton
                                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                                multiple
                                resetRef={resetCsvFileInputRef}
                                onChange={(files) => {
                                    resetCsvFileInputRef.current?.();
                                    if (files.length > 0) {
                                        void attachCsvFiles(files);
                                    }
                                }}
                            >
                                {(fileButtonProps) => (
                                    <Menu.Item
                                        {...fileButtonProps}
                                        aria-label={
                                            canUseAttachControl
                                                ? 'Attach a CSV'
                                                : 'Attach a CSV unavailable in deep research'
                                        }
                                        disabled={
                                            isPreparingCsv ||
                                            !canUseAttachControl
                                        }
                                        leftSection={
                                            <MantineIcon
                                                icon={IconPaperclip}
                                                size={14}
                                            />
                                        }
                                    >
                                        Attach a CSV
                                    </Menu.Item>
                                )}
                            </FileButton>
                            {(showSqlModeControl ||
                                showDeepResearchInComposerMenu) && (
                                <Menu.Divider role="separator" mx="sm" />
                            )}
                        </>
                    )}
                    {showSqlModeControl && (
                        <Menu.Item
                            aria-label={
                                sqlMode
                                    ? 'Disable SQL Runner'
                                    : 'Enable SQL Runner'
                            }
                            closeMenuOnClick={false}
                            onClick={() => onSqlModeChange?.(!sqlMode)}
                            leftSection={
                                <MantineIcon
                                    icon={IconTerminal2}
                                    size={14}
                                    color={sqlMode ? 'indigo.5' : 'ldGray.6'}
                                />
                            }
                            rightSection={
                                sqlMode ? (
                                    <MantineIcon
                                        icon={IconCheck}
                                        size={14}
                                        color="indigo.5"
                                    />
                                ) : null
                            }
                        >
                            SQL Runner
                        </Menu.Item>
                    )}
                    {showDeepResearchInComposerMenu && deepResearchMenuItem}
                </Menu.Dropdown>
            </Menu>
        );
    };

    const renderedAttachments =
        externalSourceAttachments.length > 0 ||
        pendingCsvFiles.length > 0 ||
        elementReferences.length > 0 ? (
            <PromptAttachments
                externalSources={externalSourceAttachments}
                pendingCsvFiles={pendingCsvFiles}
                elementRefs={elementReferences}
                onRemoveExternalSource={(sourceUuid) => {
                    setExternalSourceAttachments((attachments) =>
                        attachments.filter(
                            (attachment) =>
                                attachment.sourceUuid !== sourceUuid,
                        ),
                    );
                    void discardCsvSource(sourceUuid);
                }}
                onRemoveElementRef={(reference) => {
                    if (!threadUuid) return;
                    storeDispatch(
                        removeThreadElementReference({
                            threadUuid,
                            reference,
                        }),
                    );
                }}
            />
        ) : undefined;

    const renderComposerAction = (size: 'sm' | 'lg') => {
        if (canSteer && hasValue) {
            return (
                <ComposerSubmitButton
                    icon={IconArrowUp}
                    label="Send guidance"
                    size={size}
                    disabled={steerMutation.isLoading}
                    loading={steerMutation.isLoading}
                    onClick={handleSubmit}
                />
            );
        }
        if (canInterrupt) {
            return (
                <ComposerSubmitButton
                    icon={IconPlayerStop}
                    label="Stop agent"
                    destructive
                    size={size}
                    disabled={hasRequestedInterrupt}
                    loading={
                        interruptMutation.isLoading || hasRequestedInterrupt
                    }
                    onClick={() => void handleInterrupt()}
                />
            );
        }
        const isDeepResearch = composerMode === 'deep_research';
        return (
            <ComposerSubmitButton
                icon={IconArrowUp}
                label={isDeepResearch ? 'Start research' : 'Send message'}
                size={size}
                disabled={
                    disabled ||
                    !hasValue ||
                    loading ||
                    isPreparingCsv ||
                    (isDeepResearch && isStartingDeepResearch)
                }
                loading={isDeepResearch ? isStartingDeepResearch : loading}
                onClick={handleSubmit}
            />
        );
    };

    const composerCommonProps = {
        placeholder,
        defaultValue,
        autoFocus: true,
        disabled,
        submitDisabled: disabled || isPreparingCsv || (loading && !canSteer),
        extensions: composerExtensions,
        onEditorReady: setEditor,
        onValueChange: handleComposerValueChange,
        shouldBlockSubmit,
        onSubmit: handleSubmit,
    };

    if (isMinimalMode) {
        return (
            <Box
                className={`${styles.minimalContainer} ${
                    fullWidth ? styles.minimalContainerFullWidth : ''
                }`}
                ref={rootRef}
            >
                {isThreadInput && renderChipRow(styles.threadChipFlow)}

                <Box className={styles.threadInputStack}>
                    <PromptComposer
                        {...composerCommonProps}
                        variant="inline"
                        attachments={renderedAttachments}
                        toolbarLeft={renderComposerActionsMenu()}
                        toolbarRight={
                            <Group gap={4} align="center" wrap="nowrap">
                                {renderComposerAction('sm')}
                            </Group>
                        }
                    />
                </Box>

                {!isThreadInput &&
                    renderChipRow(
                        styles.chipTray,
                        shouldReserveEmptyStateSuggestions,
                    )}

                {showDisabledBanner && (
                    <Text size="xs" c="dimmed" ta="right" mt="xs" px="sm">
                        {disabledReason}
                    </Text>
                )}

                {!disabled && footerNotice && (
                    <Box className={styles.footerNotice}>{footerNotice}</Box>
                )}
            </Box>
        );
    }

    return (
        <Box
            ref={rootRef}
            className={`${styles.container} ${
                showDisabledBanner ? styles.disabledBannerVisible : ''
            }`}
            data-dense={dense}
        >
            {isThreadInput && renderChipRow(styles.threadChipFlow)}

            <PromptComposer
                {...composerCommonProps}
                variant="card"
                size={dense ? 'sm' : 'lg'}
                className={styles.agentComposer}
                onMouseDown={handleInputCardMouseDown}
                attachments={renderedAttachments}
                toolbarLeft={
                    <Group gap="xs" align="center" wrap="nowrap">
                        {renderComposerActionsMenu()}
                    </Group>
                }
                toolbarRight={
                    <Group gap="xs" align="center" wrap="nowrap">
                        <Box className={styles.toolbarSelectors}>
                            {showAgentSelector && (
                                <Box
                                    className={styles.controlsReveal}
                                    data-visible={hasClickedInput}
                                >
                                    <Group
                                        gap="xs"
                                        align="center"
                                        wrap="nowrap"
                                    >
                                        <AgentSelector
                                            projectUuid={projectUuid!}
                                            agents={agents!}
                                            selectedAgent={selectedAgent!}
                                            compact
                                        />
                                    </Group>
                                </Box>
                            )}

                            {(showModelSelector || onExtendedThinkingChange) &&
                                models &&
                                onModelChange && (
                                    <Box className={styles.modelGroup}>
                                        <ModelSelector
                                            models={models}
                                            value={selectedModelId ?? null}
                                            onChange={onModelChange}
                                            variant="subtle"
                                            color="gray"
                                            size="xs"
                                            reasoningEnabled={extendedThinking}
                                            onReasoningChange={
                                                onExtendedThinkingChange
                                            }
                                        />
                                    </Box>
                                )}
                        </Box>

                        {renderComposerAction('lg')}
                    </Group>
                }
            />

            {!isThreadInput &&
                renderChipRow(
                    styles.chipTray,
                    shouldReserveEmptyStateSuggestions,
                )}

            {showDisabledBanner && (
                <Paper className={styles.disabledBanner} px="md" py="xs">
                    <Text size="xs" c="dimmed" ta="right">
                        {disabledReason}
                    </Text>
                </Paper>
            )}

            {!disabled && footerNotice && (
                <Box className={styles.footerNotice}>{footerNotice}</Box>
            )}
        </Box>
    );
};
