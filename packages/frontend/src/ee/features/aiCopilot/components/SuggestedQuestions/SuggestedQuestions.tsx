import {
    Paper,
    SimpleGrid,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import shuffle from 'lodash/shuffle';
import { type FC, useMemo } from 'react';
import classes from './SuggestedQuestions.module.css';
import { getLeastSimilar } from './getLeastSimilar';

type SuggestedQuestion = {
    question: string;
    uuid: string;
};

type SuggestedQuestionsProps = {
    questions: SuggestedQuestion[];
    onQuestionClick: (question: string) => void;
    isLoading?: boolean;
};

const MIN_AVAILABLE_QUESTIONS = 6;
const MIN_SUGGESTED_QUESTIONS = 2;

export const SuggestedQuestions: FC<SuggestedQuestionsProps> = ({
    questions,
    onQuestionClick,
    isLoading,
}) => {
    const selectedQuestions = useMemo(() => {
        if (questions.length <= MIN_AVAILABLE_QUESTIONS) {
            return [];
        }

        const shuffled = shuffle(questions);
        return getLeastSimilar(
            shuffled,
            (q) => q.question,
            MIN_SUGGESTED_QUESTIONS,
        );
    }, [questions]);

    if (selectedQuestions.length < MIN_SUGGESTED_QUESTIONS) {
        return null;
    }

    return (
        <Stack gap="xs">
            <Text size="sm" c="dimmed" fw={500}>
                Suggested questions
            </Text>
            <SimpleGrid cols={2} spacing="xs">
                {selectedQuestions.map((q) => (
                    <Paper
                        key={q.uuid}
                        withBorder
                        shadow="xs"
                        radius="md"
                        className={classes.questionCard}
                    >
                        <UnstyledButton
                            onClick={() => onQuestionClick(q.question)}
                            disabled={isLoading}
                            className={classes.questionButton}
                        >
                            <Text size="sm" lh={1.4}>
                                {q.question}
                            </Text>
                        </UnstyledButton>
                    </Paper>
                ))}
            </SimpleGrid>
        </Stack>
    );
};
