import type { AiModelOption } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Text,
    Textarea,
} from '@mantine-8/core';
import { IconArrowUp, IconBrain } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ModelSelector } from '../../../../../components/common/ModelSelector/ModelSelector';
import styles from './AgentChatInput.module.css';

const MAX_RECOMMENDED_THREAD_MESSAGE_COUNT = 15;

interface AgentChatInputProps {
    onSubmit: (message: string) => void;
    loading?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    placeholder?: string;
    messageCount?: number;
    projectUuid?: string;
    agentUuid?: string;
    models?: AiModelOption[];
    selectedModelId?: string | null;
    onModelChange?: (modelId: string) => void;
    extendedThinking?: boolean;
    onExtendedThinkingChange?: (enabled: boolean) => void;
}

export const AgentChatInput = ({
    onSubmit,
    loading = false,
    disabled = false,
    disabledReason,
    placeholder = 'Ask anything',
    messageCount = 0,
    projectUuid,
    agentUuid,
    models,
    selectedModelId,
    onModelChange,
    extendedThinking = false,
    onExtendedThinkingChange,
}: AgentChatInputProps) => {
    // this is a workaround to prevent the enter key from being pressed when
    // the user is composing a character
    // see https://developer.mozilla.org/en-US/docs/Web/API/CompositionEvent for more details
    const [isComposing, setIsComposing] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [value, setValue] = useState('');
    const navigate = useNavigate();

    const hasValue = value.trim().length > 0;
    const showWarningBanner =
        messageCount > MAX_RECOMMENDED_THREAD_MESSAGE_COUNT;
    const showDisabledBanner = disabled && disabledReason;

    // Use minimal mode when there's no model selector (existing thread)
    const showModelSelector =
        models && models.length > 1 && onModelChange !== undefined;
    const isMinimalMode = !showModelSelector;

    useLayoutEffect(() => {
        if (!inputRef.current) return;
        const elem = inputRef.current;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !disabled &&
                !loading &&
                !isComposing
            ) {
                e.preventDefault();
                const valueToSubmit = value.trim();
                if (valueToSubmit) {
                    onSubmit(valueToSubmit);
                    setValue('');
                }
            }
        };
        inputRef.current.addEventListener('keydown', handleKeyDown);

        return () => {
            elem.removeEventListener('keydown', handleKeyDown);
        };
    }, [onSubmit, disabled, loading, value, isComposing]);

    useLayoutEffect(() => {
        if (!inputRef.current) return;
        const elem = inputRef.current;

        function handleCompositionStart() {
            setIsComposing(true);
        }
        function handleCompositionEnd() {
            setIsComposing(false);
        }

        elem.addEventListener('compositionstart', handleCompositionStart);
        elem.addEventListener('compositionend', handleCompositionEnd);

        return () => {
            elem.removeEventListener(
                'compositionstart',
                handleCompositionStart,
            );
            elem.removeEventListener('compositionend', handleCompositionEnd);
        };
    }, []);

    const handleSubmit = () => {
        const valueToSubmit = value.trim();
        if (valueToSubmit && !disabled && !loading && !isComposing) {
            onSubmit(valueToSubmit);
            setValue('');
        }
    };

    // For existing threads
    if (isMinimalMode) {
        return (
            <Box className={styles.minimalContainer}>
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

                <Box className={styles.minimalInputWrapper} pos="relative">
                    <Textarea
                        autoFocus
                        w="100%"
                        ref={inputRef}
                        placeholder={placeholder}
                        autosize
                        minRows={1}
                        maxRows={6}
                        disabled={disabled}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        classNames={{
                            input: styles.minimalTextarea,
                            wrapper: styles.minimalTextareaWrapper,
                        }}
                    />

                    <ActionIcon
                        style={{ position: 'absolute' }}
                        right={12}
                        bottom={10}
                        variant="filled"
                        size="md"
                        className={styles.minimalSubmitButton}
                        disabled={disabled || isComposing || !hasValue}
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

                {showDisabledBanner && (
                    <Text size="xs" c="dimmed" ta="right" mt="xs" px="sm">
                        {disabledReason}
                    </Text>
                )}
            </Box>
        );
    }

    // New thread mode
    return (
        <Box
            className={`${styles.container} ${
                showWarningBanner ? styles.warningBannerVisible : ''
            } ${showDisabledBanner ? styles.disabledBannerVisible : ''}`}
        >
            {/* Main input card */}
            <Box className={styles.inputCard}>
                {/* Textarea */}
                <Textarea
                    autoFocus
                    ref={inputRef}
                    placeholder={placeholder}
                    autosize
                    minRows={2}
                    maxRows={8}
                    disabled={disabled}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    classNames={{
                        input: styles.textarea,
                        wrapper: styles.textareaWrapper,
                    }}
                    styles={{
                        input: {
                            border: 'none',
                            '&:focus': {
                                border: 'none',
                                outline: 'none',
                            },
                        },
                    }}
                />

                {/* Dotted divider */}
                <hr className={styles.divider} />

                {/* Toolbar */}
                <Box className={styles.toolbar}>
                    <Box className={styles.toolbarActions}>
                        {/* Model selector */}
                        {showModelSelector && (
                            <ModelSelector
                                models={models}
                                value={selectedModelId ?? null}
                                onChange={onModelChange}
                            />
                        )}

                        {/* Extended thinking toggle */}
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

                    {/* Submit button */}
                    <ActionIcon
                        variant="filled"
                        size="lg"
                        className={styles.submitButton}
                        disabled={disabled || isComposing || !hasValue}
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
                </Box>
            </Box>

            {/* Disabled reason banner */}
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
