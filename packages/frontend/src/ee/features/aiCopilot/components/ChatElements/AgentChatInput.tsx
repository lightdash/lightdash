import {
    type AgentSuggestion,
    type AiPromptContextInput,
    type AiPromptContextItem,
    type AiModelOption,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Paper, Text, Tooltip } from '@mantine-8/core';
import { RichTextEditor } from '@mantine/tiptap';
import { IconArrowUp, IconTerminal2 } from '@tabler/icons-react';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ModelSelector } from '../../../../../components/common/ModelSelector/ModelSelector';
import useUser from '../../../../../hooks/user/useUser';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { useAgentSuggestions } from '../../hooks/useAgentSuggestions';
import { AgentSelector } from '../AgentSelector';
import { type Agent } from '../AgentSelector/AgentSelectorUtils';
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
}: AgentChatInputProps) => {
    const user = useUser(true);
    const [value, setValueState] = useState(defaultValue ?? '');
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
                    if (loadingRef.current || disabledRef.current) {
                        return true;
                    }
                    if (!ed) return false;
                    const text = ed.getText().trim();
                    if (!text) return true;
                    event.preventDefault();
                    const mentionedContext = extractContentMentionContext(ed);
                    onSubmitRef.current({
                        message: text,
                        toolHints: extractToolHints(ed),
                        context: mentionedContext.context,
                        optimisticContext: mentionedContext.optimisticContext,
                    });
                    if (clearOnSubmitRef.current) {
                        ed.commands.clearContent();
                        setValueState('');
                    }
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

    const handleSubmit = () => {
        const ed = editorRef.current;
        if (!ed) return;
        const text = ed.getText().trim();
        if (!text || disabled || loading) return;
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
        labelPosition = 'after',
    }: {
        actionSize: number | 'sm' | 'md';
        iconSize: number;
        labelPosition?: 'before' | 'after';
    }) => {
        if (!onSqlModeChange || disabled) return null;
        const label = sqlMode ? (
            <Text size="xs" fw={600} className={styles.sqlModeLabel}>
                SQL mode on
            </Text>
        ) : null;

        return (
            <Tooltip
                multiline
                w={260}
                withArrow
                position="top"
                label="Let the agent reach for raw SQL when the question can't be answered from the semantic layer alone. Each query still asks for your approval before running."
            >
                <Group gap={6} wrap="nowrap" className={styles.sqlModeControl}>
                    {labelPosition === 'before' && label}
                    <ActionIcon
                        variant={sqlMode ? 'light' : 'subtle'}
                        color={sqlMode ? 'indigo' : 'gray'}
                        size={actionSize}
                        className={styles.sqlModeButton}
                        onClick={() => onSqlModeChange(!sqlMode)}
                        aria-label="Toggle SQL mode"
                        aria-pressed={sqlMode}
                    >
                        <MantineIcon
                            icon={IconTerminal2}
                            size={iconSize}
                            color={sqlMode ? 'indigo.5' : 'ldGray.6'}
                        />
                    </ActionIcon>
                    {labelPosition === 'after' && label}
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
                {isThreadInput && renderChipRow(styles.threadChipFlow)}

                <Box className={styles.threadInputStack}>
                    <Box
                        className={`${styles.minimalInputWrapper} ${
                            sqlMode ? styles.sqlModeActive : ''
                        }`}
                        pos="relative"
                    >
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

                        <ActionIcon
                            right={12}
                            bottom={10}
                            variant="filled"
                            size="md"
                            className={styles.minimalSubmitButton}
                            disabled={disabled || !hasValue}
                            loading={loading}
                            onClick={handleSubmit}
                            aria-label="Send message"
                        >
                            <MantineIcon
                                icon={IconArrowUp}
                                color="ldGray.0"
                                size={18}
                                stroke={2}
                            />
                        </ActionIcon>
                    </Box>
                </Box>

                {showSqlModeControl && (
                    <Box className={styles.threadBelowControls}>
                        {renderSqlModeControl({
                            actionSize: 'sm',
                            iconSize: 14,
                            labelPosition: 'before',
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
        >
            {isThreadInput && renderChipRow(styles.threadChipFlow)}

            <Box
                className={`${styles.inputCard} ${
                    sqlMode ? styles.sqlModeActive : ''
                }`}
            >
                <RichTextEditor
                    editor={editor}
                    classNames={{
                        root: styles.editorRoot,
                        content: styles.editorContent,
                    }}
                >
                    <RichTextEditor.Content />
                </RichTextEditor>

                <Box className={styles.toolbar}>
                    <Box className={styles.toolbarActions}>
                        {!isThreadInput &&
                            renderSqlModeControl({
                                actionSize: 30,
                                iconSize: 15,
                            })}
                    </Box>

                    <Group gap="xs" align="center" wrap="nowrap">
                        {showAgentSelector && (
                            <AgentSelector
                                projectUuid={projectUuid!}
                                agents={agents!}
                                selectedAgent={selectedAgent!}
                                compact
                            />
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

                        <ActionIcon
                            variant="filled"
                            size="lg"
                            className={styles.submitButton}
                            disabled={disabled || !hasValue}
                            loading={loading}
                            onClick={handleSubmit}
                            aria-label="Send message"
                        >
                            <MantineIcon
                                icon={IconArrowUp}
                                color="ldGray.0"
                                size={20}
                                stroke={2}
                            />
                        </ActionIcon>
                    </Group>
                </Box>
            </Box>

            {isThreadInput
                ? showSqlModeControl && (
                      <Box className={styles.threadBelowControls}>
                          {renderSqlModeControl({
                              actionSize: 'sm',
                              iconSize: 14,
                              labelPosition: 'before',
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
