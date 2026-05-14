import { type Explore, type MetricQuery } from '@lightdash/common';
import { ActionIcon, Box } from '@mantine-8/core';
import { IconArrowUp, IconSparkles, IconX } from '@tabler/icons-react';
import { type Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { AiPromptEditor } from '../../../../ee/features/ambientAi/components/tableCalculation/components/AiPromptInput';
import { AiSlot } from '../../../../ee/features/ambientAi/components/tableCalculation/components/AiSlot/AiSlot';
import styles from './ImproveWithAiSlot.module.css';

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    currentFormula: string;
    isGenerating: boolean;
    onSubmit: (prompt: string) => void;
};

export const ImproveWithAiSlot: FC<Props> = ({
    explore,
    metricQuery,
    currentFormula,
    isGenerating,
    onSubmit,
}) => {
    const [opened, setOpened] = useState(false);
    const [shouldClearEditor, setShouldClearEditor] = useState(false);
    const editorRef = useRef<Editor | null>(null);

    const handleEditorUpdate = useCallback((editor: Editor | null) => {
        editorRef.current = editor;
    }, []);

    const handleEditorCleared = useCallback(() => {
        setShouldClearEditor(false);
    }, []);

    const close = useCallback(() => setOpened(false), []);
    const open = useCallback(() => setOpened(true), []);

    const submit = useCallback(
        (text: string) => {
            if (!text.trim()) return;
            onSubmit(text);
            setShouldClearEditor(true);
            close();
        },
        [onSubmit, close],
    );

    const handleArrowClick = useCallback(() => {
        const text = editorRef.current?.getText() ?? '';
        if (text.trim()) submit(text);
    }, [submit]);

    useEffect(() => {
        if (!opened) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [opened, close]);

    const triggerDisabled = !currentFormula || isGenerating;

    if (!opened) {
        return (
            <button
                type="button"
                className={styles.trigger}
                onClick={open}
                aria-label="Improve with AI"
                disabled={triggerDisabled}
            >
                <MantineIcon icon={IconSparkles} size="xs" />
                Improve with AI
            </button>
        );
    }

    return (
        <AiSlot
            icon={IconSparkles}
            iconColor="indigo.4"
            title="Describe the change"
            rightSlot={
                <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={close}
                    aria-label="Close AI prompt"
                >
                    <MantineIcon icon={IconX} size="sm" />
                </ActionIcon>
            }
        >
            <Box className={styles.editorContainer}>
                <AiPromptEditor
                    explore={explore}
                    metricQuery={metricQuery}
                    onUpdate={handleEditorUpdate}
                    onSubmit={submit}
                    shouldClear={shouldClearEditor}
                    onCleared={handleEditorCleared}
                    disabled={isGenerating}
                />
                <ActionIcon
                    size="sm"
                    radius="xl"
                    onClick={handleArrowClick}
                    disabled={isGenerating}
                    loading={isGenerating}
                    className={styles.generateButton}
                    aria-label="Submit"
                >
                    <MantineIcon
                        icon={IconArrowUp}
                        color="ldGray.0"
                        size={16}
                        stroke={2}
                    />
                </ActionIcon>
            </Box>
        </AiSlot>
    );
};
