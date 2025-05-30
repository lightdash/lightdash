import { ActionIcon, Paper, Stack, Textarea } from '@mantine-8/core';
import { IconArrowUp } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState } from 'react';

interface AgentChatInputProps {
    onSubmit: (message: string) => void;
    loading?: boolean;
    disabled?: boolean;
}

export const AgentChatInput = ({
    onSubmit,
    loading = false,
    disabled = false,
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
            bg="gray.1"
            gap={0}
            p={0}
            component={Stack}
            radius="md"
            style={{
                position: 'relative',
            }}
        >
            <Textarea
                autoFocus
                ref={inputRef}
                placeholder="Ask Anything"
                autosize
                minRows={4}
                radius="md"
                disabled={disabled}
                size="md"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rightSection={
                    <ActionIcon
                        variant="filled"
                        size="lg"
                        radius="md"
                        style={{
                            position: 'absolute',
                            bottom: 12,
                            right: 12,
                        }}
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
                        <IconArrowUp />
                    </ActionIcon>
                }
            />
        </Paper>
    );
};
