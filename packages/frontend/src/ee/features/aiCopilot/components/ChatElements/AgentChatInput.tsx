import type { AiModelOption } from '@lightdash/common';
import {
    ActionIcon,
    alpha,
    Anchor,
    Box,
    Group,
    Paper,
    rem,
    Text,
    Textarea,
    Tooltip,
} from '@mantine-8/core';
import { IconArrowUp, IconClock } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

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
    placeholder = 'Ask anything about your data...',
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

    return (
        <Box pos="relative" pb="lg" className={styles.backdropBackground}>
            {messageCount > MAX_RECOMMENDED_THREAD_MESSAGE_COUNT && (
                <Paper
                    px="sm"
                    py={rem(4)}
                    bg={alpha('var(--mantine-color-gray-1)', 0.5)}
                    mx="md"
                    style={{
                        borderTopLeftRadius: rem(12),
                        borderTopRightRadius: rem(12),
                        borderBottomLeftRadius: 0,
                        borderBottomRightRadius: 0,
                    }}
                >
                    <Text size="xs" c="dimmed" style={{ flex: 1 }} ta="center">
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
            <Box pos="relative">
                <Textarea
                    autoFocus
                    classNames={{ input: styles.input }}
                    ref={inputRef}
                    placeholder={placeholder}
                    autosize
                    minRows={4}
                    radius="0.75rem"
                    disabled={disabled}
                    size="md"
                    m={-1}
                    onChange={(e) => setValue(e.target.value)}
                    value={value}
                />

                <Group
                    pos="absolute"
                    bottom={12}
                    right={12}
                    gap="xs"
                    style={{ zIndex: 1 }}
                >
                    {onExtendedThinkingChange && (
                        <Tooltip label="Extended thinking" withArrow>
                            <ActionIcon
                                variant={extendedThinking ? 'light' : 'subtle'}
                                color={extendedThinking ? 'blue' : 'gray'}
                                size="md"
                                radius="md"
                                onClick={() =>
                                    onExtendedThinkingChange(!extendedThinking)
                                }
                            >
                                <IconClock size={18} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    {models && models.length > 0 && onModelChange && (
                        <ModelSelector
                            models={models}
                            value={selectedModelId ?? null}
                            onChange={onModelChange}
                        />
                    )}
                    <ActionIcon
                        variant="filled"
                        size="md"
                        radius="xl"
                        color="ldDark.5"
                        disabled={disabled || isComposing}
                        loading={loading}
                        onClick={() => {
                            const valueToSubmit = value.trim();
                            if (valueToSubmit) {
                                onSubmit(valueToSubmit);
                                setValue('');
                            }
                        }}
                    >
                        <IconArrowUp size={18} />
                    </ActionIcon>
                </Group>
            </Box>

            {disabled && disabledReason ? (
                <Paper
                    px="sm"
                    py={rem(4)}
                    bg={alpha('var(--mantine-color-foreground)', 0.5)}
                    mx="md"
                    style={{
                        borderTopLeftRadius: 0,
                        borderTopRightRadius: 0,
                        borderBottomLeftRadius: rem(12),
                        borderBottomRightRadius: rem(12),
                    }}
                >
                    {disabled && disabledReason && (
                        <Text
                            size="xs"
                            c="dimmed"
                            style={{ flex: 1 }}
                            ta="right"
                        >
                            {disabledReason}
                        </Text>
                    )}
                </Paper>
            ) : null}
        </Box>
    );
};
