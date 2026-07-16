import {
    type AgentSuggestion,
    type AiPromptContextInput,
    type AiPromptContextItem,
    type AiModelOption,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Paper, Text, Tooltip } from '@mantine-8/core';
import { RichTextEditor } from '@mantine/tiptap';
import {
    IconArrowUp,
    IconPlayerStop,
    IconReportSearch,
    IconTerminal2,
} from '@tabler/icons-react';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ModelSelector } from '../../../../../components/common/ModelSelector/ModelSelector';
import useUser from '../../../../../hooks/user/useUser';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { subscribeToDeepResearchComposerPrompt } from '../../deepResearch/deepResearchRegistry';
import {
    type DeepResearchDepth,
    type StartDeepResearchArgs,
} from '../../deepResearch/types';
import { useAgentSuggestions } from '../../hooks/useAgentSuggestions';
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
    // Reveals the agent selector on first focus instead of showing it always.
    revealAgentSelectorOnFocus?: boolean;
    // Shrinks padding/min-heights for a more compact composer.
    dense?: boolean;
    deepResearchControlPlacement?: 'composer' | 'page_header';
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
    revealAgentSelectorOnFocus = false,
    dense = false,
    deepResearchControlPlacement = 'composer',
}: AgentChatInputProps) => {
    const user = useUser(true);
    const [value, setValueState] = useState(defaultValue ?? '');
    const [hasClickedInput, setHasClickedInput] = useState(
        !revealAgentSelectorOnFocus,
    );
    const handleInputCardMouseDown = useCallback(() => {
        if (revealAgentSelectorOnFocus) setHasClickedInput(true);
    }, [revealAgentSelectorOnFocus]);
    const [composerMode, setComposerMode] = useState<AgentComposerMode>('ask');
    const [deepResearchDepth, setDeepResearchDepth] =
        useState<DeepResearchDepth>('standard');
    const [isStartingDeepResearch, setIsStartingDeepResearch] = useState(false);
    const [deepResearchHeaderTarget, setDeepResearchHeaderTarget] =
        useState<Element | null>(null);
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
    const canSteerRef = useRef(false);
    const handleSubmitRef = useRef<() => void>(() => undefined);
    const projectUuidRef = useRef(projectUuid);
    projectUuidRef.current = projectUuid;
    const contentMentionPriorityItemsRef = useRef(contentMentionPriorityItems);
    contentMentionPriorityItemsRef.current = contentMentionPriorityItems;
    // Tracks whether the @-mention dropdown is open, sourced from the suggestion
    // render lifecycle. Enter must select from the dropdown (or be a no-op while
    // it loads), never submit, so we guard on this in addition to the plugin's
    // `active` flag — which can read stale in the keydown vs async-items race.
    const contentMentionPopupOpenRef = useRef(false);

    useEffect(() => {
        if (deepResearchControlPlacement !== 'page_header') {
            setDeepResearchHeaderTarget(null);
            return;
        }

        setDeepResearchHeaderTarget(
            document.querySelector('[data-deep-research-control-target]'),
        );
    }, [deepResearchControlPlacement]);

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

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                bulletList: false,
                orderedList: false,
                blockquote: false,
                codeBlock: false,
                horizontalRule: false,
            }),
            Placeholder.configure({ placeholder }),
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
        editable: !disabled,
        autofocus: true,
        content: defaultValue ?? '',
        onUpdate: ({ editor: ed }) => {
            const text = ed.getText();
            setValueState(text);
            onValueChangeRef.current?.(text);
        },
        editorProps: {
            handleKeyDown: (_, event) => {
                if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.isComposing
                ) {
                    const ed = editorRef.current;
                    if (
                        isContentMentionSuggestionActive(ed) ||
                        contentMentionPopupOpenRef.current
                    ) {
                        return false;
                    }
                    if (
                        disabledRef.current ||
                        (loadingRef.current && !canSteerRef.current)
                    ) {
                        return true;
                    }
                    if (!ed) return false;
                    const text = ed.getText().trim();
                    if (!text) return true;
                    event.preventDefault();
                    handleSubmitRef.current();
                    return true;
                }
                return false;
            },
        },
    });
    editorRef.current = editor;

    useEffect(() => {
        if (!editor) return;
        editor.setEditable(!disabled);
    }, [editor, disabled]);

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
                },
            });
        },
        [track, projectUuid, agentUuid],
    );

    const hasValue = value.trim().length > 0;
    const showMinimalPlaceholder = isMinimalMode && !hasValue;
    const showDisabledBanner = disabled && disabledReason;
    const isThreadInput = Boolean(threadUuid);
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
    canSteerRef.current = canSteer;

    const handleStartDeepResearch = async () => {
        const ed = editorRef.current;
        const question = ed?.getText().trim() ?? '';
        if (!question || !onStartDeepResearch || isStartingDeepResearch) {
            return;
        }

        setIsStartingDeepResearch(true);
        try {
            await onStartDeepResearch({
                question,
                depth: deepResearchDepth,
            });
            if (clearOnSubmitRef.current) {
                ed?.commands.clearContent();
                setValueState('');
            }
        } finally {
            setIsStartingDeepResearch(false);
        }
    };

    const handleSubmit = () => {
        const ed = editorRef.current;
        if (!ed) return;
        const text = ed.getText().trim();
        if (!text || disabled) return;
        if (composerMode === 'deep_research' && onStartDeepResearch) {
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
    handleSubmitRef.current = handleSubmit;

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

    const deepResearchControlElement = onStartDeepResearch ? (
        <DeepResearchModeControl
            mode={composerMode}
            onModeChange={setComposerMode}
        />
    ) : null;
    const deepResearchControl =
        deepResearchControlPlacement === 'composer'
            ? deepResearchControlElement
            : null;
    const deepResearchPreflight =
        composerMode === 'deep_research' && onStartDeepResearch ? (
            <DeepResearchPreflight
                depth={deepResearchDepth}
                onDepthChange={setDeepResearchDepth}
            />
        ) : null;
    const deepResearchControlPortal =
        deepResearchControlElement &&
        deepResearchControlPlacement === 'page_header' &&
        deepResearchHeaderTarget
            ? createPortal(deepResearchControlElement, deepResearchHeaderTarget)
            : null;

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

    if (isMinimalMode) {
        return (
            <Box
                className={`${styles.minimalContainer} ${
                    fullWidth ? styles.minimalContainerFullWidth : ''
                }`}
                ref={rootRef}
            >
                {deepResearchControlPortal}
                {isThreadInput && renderChipRow(styles.threadChipFlow)}

                <Box className={styles.threadInputStack}>
                    <Box
                        className={`${styles.minimalInputWrapper} ${
                            composerMode === 'deep_research'
                                ? styles.deepResearchInput
                                : ''
                        }`}
                        pos="relative"
                    >
                        {composerMode === 'deep_research' && (
                            <Box
                                className={styles.minimalResearchIndicator}
                                aria-label="Deep research mode"
                            >
                                <MantineIcon
                                    icon={IconReportSearch}
                                    size={15}
                                    stroke={1.8}
                                />
                            </Box>
                        )}
                        <RichTextEditor
                            editor={editor}
                            classNames={{
                                root: styles.editorRoot,
                                content: styles.minimalEditorContent,
                            }}
                        >
                            <RichTextEditor.Content />
                        </RichTextEditor>

                        {showMinimalPlaceholder && (
                            <Text
                                aria-hidden
                                className={styles.minimalPlaceholder}
                            >
                                {placeholder}
                            </Text>
                        )}

                        {canSteer && hasValue ? (
                            <ActionIcon
                                variant="filled"
                                size="md"
                                className={`${styles.minimalSubmitButton} ${styles.minimalStreamActionButton}`}
                                disabled={steerMutation.isLoading}
                                loading={steerMutation.isLoading}
                                onClick={handleSubmit}
                                aria-label="Send guidance"
                            >
                                <MantineIcon
                                    icon={IconArrowUp}
                                    color="ldGray.0"
                                    size={18}
                                    stroke={2}
                                />
                            </ActionIcon>
                        ) : canInterrupt ? (
                            <ActionIcon
                                variant="filled"
                                color="red"
                                size="md"
                                className={`${styles.minimalSubmitButton} ${styles.minimalStreamActionButton}`}
                                disabled={hasRequestedInterrupt}
                                loading={
                                    interruptMutation.isLoading ||
                                    hasRequestedInterrupt
                                }
                                onClick={() => void handleInterrupt()}
                                aria-label="Stop agent"
                            >
                                <MantineIcon
                                    icon={IconPlayerStop}
                                    color="ldGray.0"
                                    size={18}
                                    stroke={2}
                                />
                            </ActionIcon>
                        ) : (
                            <ActionIcon
                                right={12}
                                bottom={10}
                                variant="filled"
                                size="md"
                                className={`${styles.minimalSubmitButton} ${
                                    composerMode === 'deep_research'
                                        ? styles.deepResearchSubmitButton
                                        : ''
                                }`}
                                disabled={disabled || !hasValue}
                                loading={
                                    composerMode === 'deep_research'
                                        ? isStartingDeepResearch
                                        : loading
                                }
                                onClick={handleSubmit}
                                aria-label={
                                    composerMode === 'deep_research'
                                        ? 'Start research'
                                        : 'Send message'
                                }
                            >
                                <MantineIcon
                                    icon={
                                        composerMode === 'deep_research'
                                            ? IconReportSearch
                                            : IconArrowUp
                                    }
                                    color="ldGray.0"
                                    size={18}
                                    stroke={2}
                                />
                            </ActionIcon>
                        )}
                    </Box>
                    {deepResearchPreflight}
                </Box>

                {showSqlModeControl && (
                    <Box className={styles.threadBelowControls}>
                        <Group gap="xs">
                            {deepResearchControl}
                            {renderSqlModeControl({
                                actionSize: 'sm',
                                iconSize: 14,
                            })}
                        </Group>
                    </Box>
                )}

                {!showSqlModeControl && deepResearchControl && (
                    <Box className={styles.threadBelowControls}>
                        {deepResearchControl}
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
            {deepResearchControlPortal}
            {isThreadInput && renderChipRow(styles.threadChipFlow)}

            <Box
                className={`${styles.inputCard} ${
                    composerMode === 'deep_research'
                        ? styles.deepResearchInput
                        : ''
                }`}
                onMouseDown={handleInputCardMouseDown}
            >
                {composerMode === 'deep_research' && (
                    <Group
                        gap={6}
                        className={styles.deepResearchIndicator}
                        aria-label="Deep research mode"
                    >
                        <MantineIcon
                            icon={IconReportSearch}
                            size={15}
                            stroke={1.8}
                        />
                        <Text size="xs" fw={600}>
                            Deep research
                        </Text>
                    </Group>
                )}
                <RichTextEditor
                    editor={editor}
                    classNames={{
                        root: styles.editorRoot,
                        content: `${styles.editorContent} ${
                            composerMode === 'deep_research'
                                ? styles.deepResearchEditorContent
                                : ''
                        }`,
                    }}
                >
                    <RichTextEditor.Content />
                </RichTextEditor>

                <Box className={styles.toolbar}>
                    <Box className={styles.toolbarActions}>
                        {!isThreadInput && deepResearchControl}
                        {!isThreadInput &&
                            renderSqlModeControl({
                                actionSize: 30,
                                iconSize: 15,
                            })}
                    </Box>

                    <Group gap="xs" align="center" wrap="nowrap">
                        {showAgentSelector && (
                            <Box
                                className={styles.agentSelectorReveal}
                                data-visible={hasClickedInput}
                            >
                                <AgentSelector
                                    projectUuid={projectUuid!}
                                    agents={agents!}
                                    selectedAgent={selectedAgent!}
                                    compact
                                />
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

                        {canSteer && hasValue ? (
                            <ActionIcon
                                variant="filled"
                                size="lg"
                                className={styles.submitButton}
                                disabled={steerMutation.isLoading}
                                loading={steerMutation.isLoading}
                                onClick={handleSubmit}
                                aria-label="Send guidance"
                            >
                                <MantineIcon
                                    icon={IconArrowUp}
                                    color="ldGray.0"
                                    size={20}
                                    stroke={2}
                                />
                            </ActionIcon>
                        ) : canInterrupt ? (
                            <ActionIcon
                                variant="filled"
                                color="red"
                                size="lg"
                                className={styles.submitButton}
                                disabled={hasRequestedInterrupt}
                                loading={
                                    interruptMutation.isLoading ||
                                    hasRequestedInterrupt
                                }
                                onClick={() => void handleInterrupt()}
                                aria-label="Stop agent"
                            >
                                <MantineIcon
                                    icon={IconPlayerStop}
                                    color="ldGray.0"
                                    size={20}
                                    stroke={2}
                                />
                            </ActionIcon>
                        ) : (
                            <ActionIcon
                                variant="filled"
                                size="lg"
                                className={`${styles.submitButton} ${
                                    composerMode === 'deep_research'
                                        ? styles.deepResearchSubmitButton
                                        : ''
                                }`}
                                disabled={disabled || !hasValue}
                                loading={
                                    composerMode === 'deep_research'
                                        ? isStartingDeepResearch
                                        : loading
                                }
                                onClick={handleSubmit}
                                aria-label={
                                    composerMode === 'deep_research'
                                        ? 'Start research'
                                        : 'Send message'
                                }
                            >
                                <MantineIcon
                                    icon={
                                        composerMode === 'deep_research'
                                            ? IconReportSearch
                                            : IconArrowUp
                                    }
                                    color="ldGray.0"
                                    size={20}
                                    stroke={2}
                                />
                            </ActionIcon>
                        )}
                    </Group>
                </Box>
            </Box>

            {deepResearchPreflight}

            {isThreadInput
                ? (showSqlModeControl || deepResearchControl) && (
                      <Box className={styles.threadBelowControls}>
                          <Group gap="xs">
                              {deepResearchControl}
                              {showSqlModeControl &&
                                  renderSqlModeControl({
                                      actionSize: 'sm',
                                      iconSize: 14,
                                  })}
                          </Group>
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
