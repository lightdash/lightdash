import { Box, Stack, Text, Textarea } from '@mantine/core';
import { type FC } from 'react';
import classes from './ClarificationQuestionList.module.css';

type Props = {
    questions: string[];
    /** Answers by question index; a missing entry reads as unanswered. */
    answers: string[];
    onAnswer: (index: number, value: string) => void;
};

/** The pre-build clarifying questions, shared by the app builder's chat panel
 *  and the chart type builder's composer sheet. Blank answers are dropped. */
const ClarificationQuestionList: FC<Props> = ({
    questions,
    answers,
    onAnswer,
}) => (
    <Stack gap={6}>
        {questions.map((question, index) => (
            <Box
                // Index-keyed: `answers` is too, and questions can repeat.
                key={index}
                className={classes.field}
                data-answered={
                    (answers[index] ?? '').trim().length > 0 || undefined
                }
            >
                <Text size="sm" c="dimmed" lh={1.4}>
                    {question}
                </Text>
                <Textarea
                    variant="unstyled"
                    autosize
                    minRows={1}
                    maxRows={4}
                    placeholder="Your answer"
                    value={answers[index] ?? ''}
                    autoFocus={index === 0}
                    onChange={(event) =>
                        onAnswer(index, event.currentTarget.value)
                    }
                    classNames={{ input: classes.input }}
                    aria-label={question}
                />
            </Box>
        ))}
    </Stack>
);

export default ClarificationQuestionList;
