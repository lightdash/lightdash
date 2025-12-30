import type { GeneratedTableCalculation } from '@lightdash/common';
import { ActionIcon, Box, Group, Text } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconArrowUp, IconSparkles } from '@tabler/icons-react';
import { type Editor } from '@tiptap/react';
import { useCallback, useRef, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    selectMetricQuery,
    selectTableName,
    useExplorerSelector,
} from '../../../../../../features/explorer/store';
import { useExplore } from '../../../../../../hooks/useExplore';
import { useGenerateTableCalculation } from '../../../../../../hooks/useGenerateTableCalculation';
import { AiPromptEditor } from './AiPromptInput';
import styles from './AiTableCalculationInput.module.css';

type Props = {
    currentSql?: string;
    onApply: (result: GeneratedTableCalculation) => void;
};

export const AiTableCalculationInput: FC<Props> = ({ currentSql, onApply }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const { data: explore } = useExplore(tableName);

    const [shouldClearEditor, setShouldClearEditor] = useState(false);
    const editorRef = useRef<Editor | null>(null);

    const handleSuccess = useCallback(
        (result: GeneratedTableCalculation) => {
            onApply(result);
            setShouldClearEditor(true);
        },
        [onApply],
    );

    const { generate, isLoading, error } = useGenerateTableCalculation({
        projectUuid,
        explore,
        metricQuery,
        onSuccess: handleSuccess,
    });

    const handleGenerate = useCallback(() => {
        if (!editorRef.current) return;
        const promptText = editorRef.current.getText();
        if (promptText.trim()) {
            generate(promptText, currentSql);
        }
    }, [generate, currentSql]);

    const handleEditorUpdate = useCallback((editor: Editor | null) => {
        editorRef.current = editor;
    }, []);

    const handleSubmit = useCallback(
        (text: string) => {
            if (text.trim()) {
                generate(text, currentSql);
            }
        },
        [generate, currentSql],
    );

    // Cmd+Enter / Ctrl+Enter to generate
    useHotkeys([['mod+Enter', handleGenerate]], [], true);

    return (
        <Box className={styles.container}>
            <Group spacing="xs" mb="xs">
                <MantineIcon icon={IconSparkles} color="indigo.4" />
                <Text size="xs" c="ldDark.9" fw={500}>
                    Generate and improve your table calculation with AI
                </Text>
            </Group>

            <Box className={styles.editorContainer}>
                <AiPromptEditor
                    explore={explore}
                    metricQuery={metricQuery}
                    onUpdate={handleEditorUpdate}
                    onSubmit={handleSubmit}
                    shouldClear={shouldClearEditor}
                    onCleared={() => setShouldClearEditor(false)}
                    disabled={isLoading}
                />
                <ActionIcon
                    size="sm"
                    radius="xl"
                    onClick={handleGenerate}
                    disabled={isLoading}
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
