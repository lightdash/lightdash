import {
    ActionIcon,
    Group,
    Paper,
    Stack,
    Text,
    Textarea,
} from '@mantine-8/core';
import { IconArrowUp } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState } from 'react';

interface AgentChatInputProps {
    onSubmit: (message: string) => void;
    loading?: boolean;
    disabled?: boolean;
    disabledReason?: string;
}

export const AgentChatInput = ({
    onSubmit,
    loading = false,
    disabled = false,
    disabledReason,
}: AgentChatInputProps) => {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [value, setValue] = useState('');
    useLayoutEffect(() => {
        if (!inputRef.current) return;
        const elem = inputRef.current;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && !disabled && !loading) {
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
    }, [onSubmit, disabled, loading, value]);

    return (
        <Paper
            bg="gray.0"
            gap={0}
            p={0}
            component={Stack}
            radius="0.75rem"
            style={{
                position: 'relative',
            }}
        >
            <Textarea
                autoFocus
                ref={inputRef}
                placeholder={disabled ? undefined : 'Ask Anything'}
                autosize
                minRows={4}
                radius="0.75rem"
                disabled={disabled}
                size="md"
                styles={(theme) => ({
                    input: {
                        '--input-bd-focus': theme.colors.violet[5],
                    },
                })}
                m={-1}
                onChange={(e) => setValue(e.target.value)}
                value={value}
                rightSection={
                    <ActionIcon
                        variant="filled"
                        size="md"
                        radius="md"
                        style={{
                            position: 'absolute',
                            bottom: 12,
                            right: 12,
                        }}
                        color="violet"
                        disabled={disabled}
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
            <Group px="sm" py="xs" gap="xs">
                {!disabled && (
                    <Text size="xs" c="dimmed">
                        Agent can make mistakes. Please double-check responses.
                    </Text>
                )}
                {disabled && disabledReason && (
                    <Text size="xs" c="dimmed" style={{ flex: 1 }} ta="right">
                        {disabledReason}
                    </Text>
                )}
            </Group>
        </Paper>
    );
};
