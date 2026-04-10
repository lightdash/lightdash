import type { GeneratedFormulaTableCalculation } from '@lightdash/common';
import { ActionIcon, Box, Group, Text } from '@mantine-8/core';
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
import { useGenerateFormulaTableCalculation } from '../../../../../../hooks/useGenerateFormulaTableCalculation';
import { useProject } from '../../../../../../hooks/useProject';
import useApp from '../../../../../../providers/App/useApp';
import useTracking from '../../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../../types/Events';
import { AiPromptEditor } from './AiPromptInput';
import styles from './AiTableCalculationInput.module.css';

type Props = {
    currentFormula?: string;
    onApply: (result: GeneratedFormulaTableCalculation) => void;
};

export const AiFormulaTableCalculationInput: FC<Props> = ({
    currentFormula,
    onApply,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const { data: explore } = useExplore(tableName);
    const { data: project } = useProject(projectUuid);
    const { user } = useApp();
    const { track } = useTracking();

    const [shouldClearEditor, setShouldClearEditor] = useState(false);
    const editorRef = useRef<Editor | null>(null);

    const handleSuccess = useCallback(
        (result: GeneratedFormulaTableCalculation) => {
            onApply(result);
            setShouldClearEditor(true);
        },
        [onApply],
    );

    const { generate, isLoading, error } = useGenerateFormulaTableCalculation({
        projectUuid,
        explore,
        metricQuery,
        onSuccess: handleSuccess,
    });

    const trackGenerateClicked = useCallback(() => {
        if (
            !projectUuid ||
            !project?.organizationUuid ||
            !user?.data?.userUuid
        ) {
            return;
        }
        track({
            name: EventName.FORMULA_TABLE_CALCULATION_AI_GENERATE_CLICKED,
            properties: {
                userId: user.data.userUuid,
                organizationId: project.organizationUuid,
                projectId: projectUuid,
                isEdit: !!currentFormula,
            },
        });
    }, [
        track,
        projectUuid,
        project?.organizationUuid,
        user?.data?.userUuid,
        currentFormula,
    ]);

    const handleGenerate = useCallback(() => {
        if (!editorRef.current) return;
        const promptText = editorRef.current.getText();
        if (promptText.trim()) {
            trackGenerateClicked();
            generate(promptText, currentFormula);
        }
    }, [generate, currentFormula, trackGenerateClicked]);

    const handleEditorUpdate = useCallback((editor: Editor | null) => {
        editorRef.current = editor;
    }, []);

    const handleSubmit = useCallback(
        (text: string) => {
            if (text.trim()) {
                trackGenerateClicked();
                generate(text, currentFormula);
            }
        },
        [generate, currentFormula, trackGenerateClicked],
    );

    return (
        <Box className={styles.container}>
            <Group gap="xs" mb="xs">
                <MantineIcon icon={IconSparkles} color="indigo.4" />
                <Text size="xs" c="ldDark.9" fw={500}>
                    Generate and improve your formula with AI
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
