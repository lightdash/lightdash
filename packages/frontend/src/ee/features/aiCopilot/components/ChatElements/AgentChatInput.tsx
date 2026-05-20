import {
    FeatureFlags,
    type AgentSuggestion,
    type AiModelOption,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Switch,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { RichTextEditor } from '@mantine/tiptap';
import { IconArrowUp, IconBrain, IconTerminal2 } from '@tabler/icons-react';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ModelSelector } from '../../../../../components/common/ModelSelector/ModelSelector';
import useUser from '../../../../../hooks/user/useUser';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { useAgentSuggestions } from '../../hooks/useAgentSuggestions';
import styles from './AgentChatInput.module.css';
import { AgentSuggestionChips } from './AgentSuggestionChips';

const MAX_RECOMMENDED_THREAD_MESSAGE_COUNT = 15;

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
    const isMinimalMode = !showModelSelector;

    const suggestionsFlag = useServerFeatureFlag(
        FeatureFlags.AiAgentSuggestions,
    );

    const emptyStateMode =
        !isMinimalMode &&
        messageCount === 0 &&
        suggestionsFlag.data?.enabled === true;
    const postResponseMode =
        messageCount > 0 &&
        !loading &&
        !!threadUuid &&
        !!latestAssistantMessageUuid &&
        suggestionsFlag.data?.enabled === true;

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
                    if (loadingRef.current || disabledRef.current) {
                        return true;
                    }
                    const ed = editorRef.current;
                    if (!ed) return false;
                    const text = ed.getText().trim();
                    if (!text) return true;
                    event.preventDefault();
                    onSubmitRef.current({
                        message: text,
                        toolHints: extractToolHints(ed),
                    });
                    ed.commands.clearContent();
                    setValueState('');
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
            editor?.commands.clearContent();
            setValueState('');
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

    const { data: contextCompactionFlag } = useServerFeatureFlag(
        FeatureFlags.AiContextCompaction,
    );

    const hasValue = value.trim().length > 0;
    const showWarningBanner =
        messageCount > MAX_RECOMMENDED_THREAD_MESSAGE_COUNT &&
        !contextCompactionFlag?.enabled;
    const showDisabledBanner = disabled && disabledReason;

    const handleSubmit = () => {
        const ed = editorRef.current;
        if (!ed) return;
        const text = ed.getText().trim();
        if (!text || disabled || loading) return;
        onSubmitRef.current({
            message: text,
            toolHints: extractToolHints(ed),
        });
        ed.commands.clearContent();
        setValueState('');
    };

    const chipRow = useMemo(() => {
        if (!emptyStateMode && !postResponseMode) return null;
        if (suggestionsQuery.isError) return null;
        const chips = suggestionsQuery.data?.chips ?? [];
        if (!suggestionsQuery.isLoading && chips.length === 0) return null;
        return (
            <AgentSuggestionChips
                chips={chips}
                isLoading={suggestionsQuery.isLoading}
                loadingVariant={postResponseMode ? 'follow-up' : 'skeleton'}
                onChipClick={handleChipClick}
                onImpression={handleImpression}
            />
        );
    }, [
        emptyStateMode,
        postResponseMode,
        suggestionsQuery.isError,
        suggestionsQuery.isLoading,
        suggestionsQuery.data,
        handleChipClick,
        handleImpression,
    ]);

    if (isMinimalMode) {
        return (
            <Box
                className={`${styles.minimalContainer} ${
                    fullWidth ? styles.minimalContainerFullWidth : ''
                }`}
                ref={rootRef}
            >
                {showWarningBanner && (
                    <Paper className={styles.warningBanner}>
                        <Text size="xs" c="ldGray.7" ta="center">
                            Agent performance degrades if a thread is too long.
                            Please start a{' '}
                            <Anchor
                                size="xs"
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (projectUuid && agentUuid) {
                                        void navigate(
                                            `/projects/${projectUuid}/ai-agents/${agentUuid}/threads`,
                                        );
                                    }
                                }}
                            >
                                new thread
                            </Anchor>
                        </Text>
                    </Paper>
                )}

                {chipRow && (
                    <Box
                        className={`${styles.chipReveal} ${
                            chipsNearBottom ? '' : styles.chipHidden
                        }`}
                        aria-hidden={!chipsNearBottom}
                    >
                        {chipRow}
                    </Box>
                )}

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

                {onSqlModeChange && !disabled && (
                    <Group justify="flex-end" px="xs" pt="xs">
                        <Tooltip
                            multiline
                            w={260}
                            withArrow
                            position="top"
                            label="Let the agent reach for raw SQL when the question can't be answered from the semantic layer alone. Each query still asks for your approval before running."
                        >
                            <Group gap={6} align="center" wrap="nowrap">
                                <MantineIcon
                                    icon={IconTerminal2}
                                    size={14}
                                    color={sqlMode ? 'indigo.5' : 'ldGray.6'}
                                />
                                <Text
                                    size="xs"
                                    c={sqlMode ? 'indigo.5' : 'dimmed'}
                                    fw={500}
                                >
                                    SQL mode
                                </Text>
                                <Switch
                                    size="xs"
                                    color="indigo"
                                    checked={sqlMode}
                                    onChange={(e) =>
                                        onSqlModeChange(e.currentTarget.checked)
                                    }
                                    aria-label="Toggle SQL mode"
                                />
                            </Group>
                        </Tooltip>
                    </Group>
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
                showWarningBanner ? styles.warningBannerVisible : ''
            } ${showDisabledBanner ? styles.disabledBannerVisible : ''}`}
        >
            {chipRow && (
                <Box
                    className={`${styles.chipReveal} ${
                        chipsNearBottom ? '' : styles.chipHidden
                    }`}
                    aria-hidden={!chipsNearBottom}
                >
                    {chipRow}
                </Box>
            )}

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

                <hr className={styles.divider} />

                <Box className={styles.toolbar}>
                    <Box className={styles.toolbarActions}>
                        {showModelSelector && (
                            <ModelSelector
                                models={models}
                                value={selectedModelId ?? null}
                                onChange={onModelChange}
                            />
                        )}

                        {onExtendedThinkingChange && (
                            <Group>
                                <Divider orientation="vertical" />
                                <Button
                                    variant="subtle"
                                    size="compact-sm"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconBrain}
                                            color={
                                                extendedThinking
                                                    ? 'indigo.5'
                                                    : 'ldGray.7'
                                            }
                                        />
                                    }
                                    className={
                                        styles.thinkingButton +
                                        ' ' +
                                        (extendedThinking
                                            ? styles.thinkingButtonOn
                                            : '')
                                    }
                                    onClick={() =>
                                        onExtendedThinkingChange(
                                            !extendedThinking,
                                        )
                                    }
                                >
                                    Thinking
                                </Button>
                            </Group>
                        )}
                    </Box>

                    <Group gap="md" align="center" wrap="nowrap">
                        {onSqlModeChange && !disabled && (
                            <Tooltip
                                multiline
                                w={260}
                                withArrow
                                position="top"
                                label="Let the agent reach for raw SQL when the question can't be answered from the semantic layer alone. Each query still asks for your approval before running."
                            >
                                <Group gap={6} align="center" wrap="nowrap">
                                    <MantineIcon
                                        icon={IconTerminal2}
                                        size={14}
                                        color={
                                            sqlMode ? 'indigo.5' : 'ldGray.6'
                                        }
                                    />
                                    <Text
                                        size="xs"
                                        c={sqlMode ? 'indigo.5' : 'dimmed'}
                                        fw={500}
                                    >
                                        SQL mode
                                    </Text>
                                    <Switch
                                        size="xs"
                                        color="indigo"
                                        checked={sqlMode}
                                        onChange={(e) =>
                                            onSqlModeChange(
                                                e.currentTarget.checked,
                                            )
                                        }
                                        aria-label="Toggle SQL mode"
                                    />
                                </Group>
                            </Tooltip>
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
