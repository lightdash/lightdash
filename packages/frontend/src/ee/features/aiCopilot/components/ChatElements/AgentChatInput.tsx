import {
    ActionIcon,
    alpha,
    Box,
    Paper,
    rem,
    Text,
    Textarea,
} from '@mantine-8/core';
import { IconArrowUp } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState } from 'react';

import styles from './AgentChatInput.module.css';

interface AgentChatInputProps {
    onSubmit: (message: string) => void;
    loading?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    placeholder?: string;
}

export const AgentChatInput = ({
    onSubmit,
    loading = false,
    disabled = false,
    disabledReason,
    placeholder = 'Ask anything about your data...',
}: AgentChatInputProps) => {
    // this is a workaround to prevent the enter key from being pressed when
    // the user is composing a character
    // see https://developer.mozilla.org/en-US/docs/Web/API/CompositionEvent for more details
    const [isComposing, setIsComposing] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [value, setValue] = useState('');

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
                rightSection={
                    <ActionIcon
                        variant="filled"
                        size="md"
                        radius="xl"
                        style={{
                            position: 'absolute',
                            bottom: 12,
                            right: 12,
                        }}
                        color="violet"
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
                }
            />

            {!disabled || (disabled && disabledReason) ? (
                <Paper
                    px="sm"
                    py={rem(4)}
                    bg={alpha('var(--mantine-color-gray-1)', 0.5)}
                    mx="md"
                    style={{
                        borderTopLeftRadius: 0,
                        borderTopRightRadius: 0,
                        borderBottomLeftRadius: rem(12),
                        borderBottomRightRadius: rem(12),
                    }}
                >
                    {!disabled && (
                        <Text size="xs" c="dimmed">
                            Agent can make mistakes. Please double-check
                            responses.
                        </Text>
                    )}
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
