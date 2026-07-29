import {
    type AgentSuggestion,
    type AiPromptContextInput,
    type AiPromptContextItem,
    type AiModelOption,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Paper, Text, Tooltip } from '@mantine-8/core';
import {
    IconArrowUp,
    IconPlayerStop,
    IconTerminal2,
} from '@tabler/icons-react';
import Mention from '@tiptap/extension-mention';
import { type AnyExtension, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ModelSelector } from '../../../../../components/common/ModelSelector/ModelSelector';
import {
    ComposerSubmitButton,
    PromptComposer,
} from '../../../../../components/common/PromptComposer';
import useUser from '../../../../../hooks/user/useUser';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { subscribeToDeepResearchComposerPrompt } from '../../deepResearch/deepResearchRegistry';
import {
    type DeepResearchDepth,
    type StartDeepResearchArgs,
} from '../../deepResearch/types';
import { isEmbedAiAgentRoute } from '../../hooks/aiAgentRouting';
import { useAgentSuggestions } from '../../hooks/useAgentSuggestions';
import { useDeepResearchComposer } from '../../hooks/useDeepResearchComposer';
import {
    useCreateAiAgentThreadMessageSteerMutation,
    useInterruptAiAgentThreadMessageMutation,
} from '../../hooks/useProjectAiAgents';
import { useAiAgentThreadStreamQuery } from '../../streaming/useAiAgentThreadStreamQuery';
import { AgentSelector } from '../AgentSelector';
import { type Agent } from '../AgentSelector/AgentSelectorUtils';
import {
    DeepResearchModeControl,
    type AgentComposerMode,
} from '../DeepResearch/DeepResearchModeControl';
import { DeepResearchPreflight } from '../DeepResearch/DeepResearchPreflight';
import styles from './AgentChatInput.module.css';
import { AgentSuggestionChips } from './AgentSuggestionChips';
import {
    createContentMentionExtension,
    extractContentMentionContext,
    isContentMentionSuggestionActive,
    type ContentMentionSuggestionItem,
} from './contentMentions';
import { getAgentSuggestionModes } from './suggestionModes';

const SUGGESTION_CHIP_MENTION_NAME = 'suggestionChip';

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

type SubmitArgs = {
    message: string;
    toolHints: string[];
    context?: AiPromptContextInput;
    optimisticContext?: AiPromptContextItem[];
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
}: AgentChatInputProps) => {
    const user = useUser(true);
    const [value, setValueState] = useState(defaultValue ?? '');
    const [hasClickedInput, setHasClickedInput] = useState(
        !revealControlsOnFocus,
    );
    const handleInputCardMouseDown = useCallback(() => {
        if (revealControlsOnFocus) setHasClickedInput(true);
    }, [revealControlsOnFocus]);
    const [composerMode, setComposerMode] = useState<AgentComposerMode>('ask');
    const [deepResearchDepth, setDeepResearchDepth] =
        useState<DeepResearchDepth>('standard');
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
    // Tracks whether the @-mention dropdown is open, sourced from the suggestion
    // render lifecycle. Enter must select from the dropdown (or be a no-op while
    // it loads), never submit, so we guard on this in addition to the plugin's
    // `active` flag — which can read stale in the keydown vs async-items race.
    const contentMentionPopupOpenRef = useRef(false);

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
                onPopupOpenChange: (open) => {
                    contentMentionPopupOpenRef.current = open;
                },
            }),
        ],
        [],
    );

    // An open @-mention dropdown owns Enter — it selects rather than submits.
    const shouldBlockSubmit = useCallback(
        (ed: Editor | null) =>
            isContentMentionSuggestionActive(ed) ||
            contentMentionPopupOpenRef.current,
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

    useEffect(() => {
        if (hasRequestedInterrupt && !threadStream?.isStreaming) {
            setHasRequestedInterrupt(false);
        }
    }, [hasRequestedInterrupt, threadStream?.isStreaming]);

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

            if (loadingRef.current || disabledRef.current) return;
            onSubmitRef.current({
                message: chip.label,
                toolHints: [chip.tool],
            });
            if (clearOnSubmitRef.current) {
                editor?.commands.clearContent();
                setValueState('');
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
    const {
        isStarting: isStartingDeepResearch,
        isLoadingMcpServers,
        mcpServerError,
        mcpServers,
        selectedMcpServerUuids,
        setSelectedMcpServerUuids,
        startDeepResearch,
    } = useDeepResearchComposer({
        projectUuid,
        agentUuid,
        canStart: canStartDeepResearch && !disabled && !loading,
        enabled: canStartDeepResearch && composerMode === 'deep_research',
        onStart: onStartDeepResearch,
    });
    const showSqlModeControl = Boolean(onSqlModeChange && !disabled);
    const activeMessageUuid = threadStream?.isStreaming
        ? threadStream.messageUuid
        : undefined;
    const canInterrupt = Boolean(
        projectUuid &&
        agentUuid &&
        threadUuid &&
        threadStream?.isStreaming &&
        activeMessageUuid,
    );
    const canSteer = canInterrupt && !disabled && !hasRequestedInterrupt;

    const handleStartDeepResearch = async () => {
        const ed = editorRef.current;
        const question = ed?.getText().trim() ?? '';
        if (!question) {
            return;
        }
        if (disabled || loading) {
            return;
        }

        const started = await startDeepResearch({
            question,
            depth: deepResearchDepth,
            mcpServerUuids: selectedMcpServerUuids,
        });
        if (started && clearOnSubmitRef.current) {
            ed?.commands.clearContent();
            setValueState('');
        }
    };

    const handleSubmit = () => {
        const ed = editorRef.current;
        if (!ed) return;
        const text = ed.getText().trim();
        if (!text || disabled) return;
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
        onSubmitRef.current({
            message: text,
            toolHints: extractToolHints(ed),
            ...extractContentMentionContext(ed),
        });
        if (clearOnSubmitRef.current) {
            ed.commands.clearContent();
            setValueState('');
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
        if (!canStartDeepResearch) {
            setComposerMode('ask');
        }
    }, [canStartDeepResearch]);

    const deepResearchPreflight =
        composerMode === 'deep_research' && canStartDeepResearch ? (
            <DeepResearchPreflight
                depth={deepResearchDepth}
                onDepthChange={setDeepResearchDepth}
                mcpServers={mcpServers}
                selectedMcpServerUuids={selectedMcpServerUuids}
                onSelectedMcpServerUuidsChange={setSelectedMcpServerUuids}
                isLoadingMcpServers={isLoadingMcpServers}
                mcpServerError={mcpServerError}
            />
        ) : null;
    const deepResearchControl = canStartDeepResearch ? (
        <DeepResearchModeControl
            mode={composerMode}
            onModeChange={setComposerMode}
            settings={deepResearchPreflight}
        />
    ) : null;
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

    const renderSqlModeControl = ({
        actionSize,
        iconSize,
    }: {
        actionSize: number | 'sm' | 'md';
        iconSize: number;
    }) => {
        if (!onSqlModeChange || disabled) return null;

        return (
            <Tooltip
                multiline
                w={260}
                withArrow
                position="top"
                label="Let the agent reach for raw SQL when the question can't be answered from the semantic layer alone. Each query still asks for your approval before running."
            >
                <Group gap={6} wrap="nowrap" className={styles.sqlModeControl}>
                    <ActionIcon
                        variant={sqlMode ? 'light' : 'subtle'}
                        color={sqlMode ? 'indigo' : 'gray'}
                        size={actionSize}
                        className={styles.sqlModeButton}
                        onClick={() => onSqlModeChange(!sqlMode)}
                        aria-label="Toggle SQL Runner"
                        aria-pressed={sqlMode}
                    >
                        <MantineIcon
                            icon={IconTerminal2}
                            size={iconSize}
                            color={sqlMode ? 'indigo.5' : 'ldGray.6'}
                        />
                    </ActionIcon>
                </Group>
            </Tooltip>
        );
    };

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
        submitDisabled: disabled || (loading && !canSteer),
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
                        toolbarRight={
                            <Group gap={4} align="center" wrap="nowrap">
                                {deepResearchControl}
                                {renderComposerAction('sm')}
                            </Group>
                        }
                    />
                </Box>

                {showSqlModeControl && (
                    <Box className={styles.threadBelowControls}>
                        {renderSqlModeControl({
                            actionSize: 'sm',
                            iconSize: 14,
                        })}
                    </Box>
                )}

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
                toolbarLeft={
                    !isThreadInput &&
                    renderSqlModeControl({
                        actionSize: 30,
                        iconSize: 15,
                    })
                }
                toolbarRight={
                    <Group gap="xs" align="center" wrap="nowrap">
                        {(deepResearchControl || showAgentSelector) && (
                            <Box
                                className={styles.controlsReveal}
                                data-visible={hasClickedInput}
                            >
                                <Group gap="xs" align="center" wrap="nowrap">
                                    {deepResearchControl}

                                    {showAgentSelector && (
                                        <AgentSelector
                                            projectUuid={projectUuid!}
                                            agents={agents!}
                                            selectedAgent={selectedAgent!}
                                            compact
                                        />
                                    )}
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

                        {renderComposerAction('lg')}
                    </Group>
                }
            />

            {isThreadInput
                ? showSqlModeControl && (
                      <Box className={styles.threadBelowControls}>
                          {renderSqlModeControl({
                              actionSize: 'sm',
                              iconSize: 14,
                          })}
                      </Box>
                  )
                : renderChipRow(
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
        </Box>
    );
};
