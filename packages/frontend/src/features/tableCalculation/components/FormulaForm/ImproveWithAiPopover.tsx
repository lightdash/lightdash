import { type Explore, type MetricQuery } from '@lightdash/common';
import { ActionIcon, Popover, Text } from '@mantine-8/core';
import { IconArrowUp, IconSparkles } from '@tabler/icons-react';
import { type Editor } from '@tiptap/react';
import { useCallback, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { AiPromptEditor } from '../../../../ee/features/ambientAi/components/tableCalculation/components/AiPromptInput';
import styles from './ImproveWithAiPopover.module.css';

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    currentFormula: string;
    isGenerating: boolean;
    generationError: string | null;
    onSubmit: (prompt: string) => void;
};

export const ImproveWithAiPopover: FC<Props> = ({
    explore,
    metricQuery,
    currentFormula,
    isGenerating,
    generationError,
    onSubmit,
}) => {
    const [opened, setOpened] = useState(false);
    const [shouldClearEditor, setShouldClearEditor] = useState(false);
    const editorRef = useRef<Editor | null>(null);

    const handleEditorUpdate = useCallback((editor: Editor | null) => {
        editorRef.current = editor;
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

    const disabled = !currentFormula || isGenerating;

    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom-end"
            withinPortal
            trapFocus
        >
            <Popover.Target>
                <button
                    type="button"
                    className={styles.trigger}
                    onClick={() => setOpened((o) => !o)}
                    aria-label="Improve with AI"
                    disabled={disabled}
                >
                    <MantineIcon icon={IconSparkles} size="xs" />
                    Improve with AI
                </button>
            </Popover.Target>
            <Popover.Dropdown className={styles.dropdown}>
                <AiPromptEditor
                    explore={explore}
                    metricQuery={metricQuery}
                    onUpdate={handleEditorUpdate}
                    onSubmit={submit}
                    shouldClear={shouldClearEditor}
                    onCleared={() => setShouldClearEditor(false)}
                    disabled={isGenerating}
                />
                <ActionIcon
                    size="sm"
                    radius="xl"
                    onClick={handleArrowClick}
                    disabled={isGenerating}
                    loading={isGenerating}
                    style={{ alignSelf: 'flex-end' }}
                    aria-label="Submit"
                >
                    <MantineIcon
                        icon={IconArrowUp}
                        color="ldGray.0"
                        size={14}
                        stroke={2}
                    />
                </ActionIcon>
                {generationError && (
                    <Text className={styles.error}>{generationError}</Text>
                )}
            </Popover.Dropdown>
        </Popover>
    );
};
