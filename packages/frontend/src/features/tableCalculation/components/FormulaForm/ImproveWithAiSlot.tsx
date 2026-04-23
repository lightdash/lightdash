import { type Explore, type MetricQuery } from '@lightdash/common';
import { ActionIcon, Box, Transition } from '@mantine-8/core';
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

    const submit = useCallback(
        (text: string) => {
            if (!text.trim()) return;
            onSubmit(text);
            setShouldClearEditor(true);
            setOpened(false);
        },
        [onSubmit],
    );

    const handleArrowClick = useCallback(() => {
        const text = editorRef.current?.getText() ?? '';
        if (text.trim()) submit(text);
    }, [submit]);

    const close = useCallback(() => setOpened(false), []);

    useEffect(() => {
        if (!opened) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [opened, close]);

    const triggerDisabled = !currentFormula || isGenerating;

    return (
        <>
            <Transition mounted={!opened} transition="fade" duration={100}>
                {(style) => (
                    <button
                        type="button"
                        className={styles.trigger}
                        style={style}
                        onClick={() => setOpened(true)}
                        aria-label="Improve with AI"
                        disabled={triggerDisabled}
                    >
                        <MantineIcon icon={IconSparkles} size="xs" />
                        Improve with AI
                    </button>
                )}
            </Transition>
            <Transition mounted={opened} transition="slide-down" duration={150}>
                {(style) => (
                    <Box style={style}>
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
                            <Box className={styles.promptRow}>
                                <Box className={styles.promptField}>
                                    <AiPromptEditor
                                        explore={explore}
                                        metricQuery={metricQuery}
                                        onUpdate={handleEditorUpdate}
                                        onSubmit={submit}
                                        shouldClear={shouldClearEditor}
                                        onCleared={handleEditorCleared}
                                        disabled={isGenerating}
                                    />
                                </Box>
                                <ActionIcon
                                    size="sm"
                                    radius="xl"
                                    onClick={handleArrowClick}
                                    disabled={isGenerating}
                                    loading={isGenerating}
                                    aria-label="Submit"
                                >
                                    <MantineIcon
                                        icon={IconArrowUp}
                                        color="ldGray.0"
                                        size={14}
                                        stroke={2}
                                    />
                                </ActionIcon>
                            </Box>
                        </AiSlot>
                    </Box>
                )}
            </Transition>
        </>
    );
};
