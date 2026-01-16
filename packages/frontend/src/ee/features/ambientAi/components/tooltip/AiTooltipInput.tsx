import { ActionIcon, Box, Group, Text, Textarea } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconArrowUp, IconSparkles } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useGenerateTooltip } from '../../../../../hooks/useGenerateTooltip';
import styles from './AiTooltipInput.module.css';

type Props = {
    fields: string[];
    currentHtml?: string;
    onApply: (html: string) => void;
};

export const AiTooltipInput: FC<Props> = ({ fields, currentHtml, onApply }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [prompt, setPrompt] = useState('');

    const handleSuccess = useCallback(
        (result: { html: string }) => {
            onApply(result.html);
            setPrompt('');
        },
        [onApply],
    );

    const { generate, isLoading, error } = useGenerateTooltip({
        projectUuid,
        fields,
        onSuccess: handleSuccess,
    });

    const handleGenerate = useCallback(() => {
        const effectivePrompt = prompt.trim() || 'generate a helpful tooltip';
        generate(effectivePrompt, currentHtml);
    }, [generate, prompt, currentHtml]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
            }
        },
        [handleGenerate],
    );

    // Cmd+Enter / Ctrl+Enter to generate
    useHotkeys([['mod+Enter', handleGenerate]], [], true);

    return (
        <Box className={styles.container}>
            <Group spacing="xs" mb="xs">
                <MantineIcon icon={IconSparkles} color="indigo.4" />
                <Text size="xs" c="ldDark.9" fw={500}>
                    {currentHtml
                        ? 'Improve your tooltip code with AI'
                        : 'Generate tooltip with AI'}
                </Text>
            </Group>

            <Box className={styles.inputContainer}>
                <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe what you want to show in the tooltip..."
                    disabled={isLoading}
                    classNames={{
                        root: styles.textareaRoot,
                        input: styles.textareaInput,
                    }}
                    minRows={2}
                    maxRows={4}
                    autosize
                />
                <ActionIcon
                    size="sm"
                    radius="xl"
                    onClick={handleGenerate}
                    disabled={isLoading || (!prompt.trim() && !!currentHtml)}
                    loading={isLoading}
                    className={styles.generateButton}
                >
                    <MantineIcon
                        icon={IconArrowUp}
                        color="ldGray.0"
                        size={16}
                        stroke={2}
                    />
                </ActionIcon>
            </Box>

            {error && (
                <Text size="xs" c="red" mt="xs">
                    Failed to generate. Please try again.
                </Text>
            )}
        </Box>
    );
};
