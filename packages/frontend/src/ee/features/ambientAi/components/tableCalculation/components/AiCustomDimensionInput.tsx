import type { GeneratedCustomDimension } from '@lightdash/common';
import { ActionIcon, Text } from '@mantine-8/core';
import { useHotkeys } from '@mantine/hooks';
import { IconArrowUp } from '@tabler/icons-react';
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
import { useGenerateCustomDimension } from '../../../../../../hooks/useGenerateCustomDimension';
import { AiPromptEditor } from './AiPromptInput';
import styles from './AiTableCalculationInput.module.css';

type Props = {
    currentSql?: string;
    onApply: (result: GeneratedCustomDimension) => void;
};

export const AiCustomDimensionInputBody: FC<Props> = ({
    currentSql,
    onApply,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const { data: explore } = useExplore(tableName);
    const [shouldClearEditor, setShouldClearEditor] = useState(false);
    const editorRef = useRef<Editor | null>(null);

    const handleSuccess = useCallback(
        (result: GeneratedCustomDimension) => {
            onApply(result);
            setShouldClearEditor(true);
        },
        [onApply],
    );
    const { generate, isLoading, error } = useGenerateCustomDimension({
        projectUuid,
        explore,
        onSuccess: handleSuccess,
    });

    const handleGenerate = useCallback(() => {
        const prompt = editorRef.current?.getText() ?? '';
        if (prompt.trim()) generate(prompt, currentSql);
    }, [generate, currentSql]);

    useHotkeys([['mod+Enter', handleGenerate]], [], true);

    return (
        <>
            <AiPromptEditor
                explore={explore}
                metricQuery={metricQuery}
                fieldSuggestionScope="allDimensions"
                placeholder="Describe your dimension (type @ to reference fields)..."
                onUpdate={(editor) => {
                    editorRef.current = editor;
                }}
                onSubmit={(prompt) => generate(prompt, currentSql)}
                shouldClear={shouldClearEditor}
                onCleared={() => setShouldClearEditor(false)}
                disabled={isLoading}
            />
            <ActionIcon
                variant="filled"
                size="sm"
                radius="xl"
                onClick={handleGenerate}
                disabled={isLoading}
                loading={isLoading}
                className={styles.generateButton}
                aria-label="Generate custom dimension"
            >
                <MantineIcon
                    icon={IconArrowUp}
                    color="ldGray.0"
                    size={16}
                    stroke={2}
                />
            </ActionIcon>
            {error && (
                <Text size="xs" c="red" mt="xs">
                    Failed to generate. Please try again.
                </Text>
            )}
        </>
    );
};
