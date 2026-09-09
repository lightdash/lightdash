import { Anchor, Stack, Text, Title } from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import MantineModal from '../../components/common/MantineModal';
import {
    markdownSanitizeRehypePlugins,
    rehypeRemoveHeaderLinks,
    useMdEditorStyle,
} from '../../utils/markdownUtils';
import { type ConceptLesson } from './conceptLesson';
import classes from './ConceptLessonModal.module.css';

export const ConceptLessonModal: FC<{
    lesson: ConceptLesson;
    completed: boolean;
    onClose: () => void;
    onComplete: () => void;
}> = ({ lesson, completed, onClose, onComplete }) => {
    const markdownStyle = useMdEditorStyle();
    return (
        <MantineModal
            opened
            onClose={onClose}
            title={lesson.title}
            subtitle="Concept lesson"
            size="xl"
            modalContentProps={{ className: classes.modal }}
            onConfirm={onComplete}
            confirmLabel={
                completed ? 'Read again — complete' : 'I have read this lesson'
            }
        >
            <Stack gap="lg" className={classes.content}>
                <Text size="sm" c="dimmed">
                    Completion records that you have read this lesson. It does
                    not verify a product action or change your permissions.
                </Text>
                {lesson.sections.map((section) => (
                    <Stack
                        key={section.sourceUrl}
                        gap="sm"
                        className={classes.content}
                    >
                        <Title order={3}>{section.heading}</Title>
                        <MarkdownPreview
                            className={classes.markdown}
                            source={section.body}
                            rehypePlugins={markdownSanitizeRehypePlugins}
                            rehypeRewrite={rehypeRemoveHeaderLinks}
                            style={markdownStyle}
                        />
                        <Anchor
                            href={section.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            size="sm"
                        >
                            Source: {section.sourceLabel}
                        </Anchor>
                    </Stack>
                ))}
            </Stack>
        </MantineModal>
    );
};
