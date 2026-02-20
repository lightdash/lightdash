import { ActionIcon, Group, Textarea } from '@mantine-8/core';
import { IconArrowUp } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';

interface AgentCodingChatInputProps {
    onSubmit: (message: string) => void;
    loading?: boolean;
    disabled?: boolean;
    placeholder?: string;
}

export const AgentCodingChatInput: FC<AgentCodingChatInputProps> = ({
    onSubmit,
    loading = false,
    disabled = false,
    placeholder = 'Send a message...',
}) => {
    const [value, setValue] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = useCallback(() => {
        if (!value.trim() || disabled || loading || isComposing) return;
        onSubmit(value.trim());
        setValue('');
    }, [value, disabled, loading, isComposing, onSubmit]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
            }
        },
        [handleSubmit],
    );

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const handleCompositionStart = () => setIsComposing(true);
        const handleCompositionEnd = () => setIsComposing(false);

        textarea.addEventListener('compositionstart', handleCompositionStart);
        textarea.addEventListener('compositionend', handleCompositionEnd);

        return () => {
            textarea.removeEventListener(
                'compositionstart',
                handleCompositionStart,
            );
            textarea.removeEventListener(
                'compositionend',
                handleCompositionEnd,
            );
        };
    }, []);

    return (
        <Group gap="sm" align="flex-end">
            <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled || loading}
                autosize
                minRows={1}
                maxRows={8}
                flex={1}
            />
            <ActionIcon
                variant="filled"
                color="dark"
                size="lg"
                onClick={handleSubmit}
                disabled={!value.trim() || disabled || loading}
            >
                <IconArrowUp size={16} />
            </ActionIcon>
        </Group>
    );
};
