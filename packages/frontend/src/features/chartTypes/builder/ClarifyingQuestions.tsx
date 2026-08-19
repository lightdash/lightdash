import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconPencil, IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import ClarificationQuestionList from '../../apps/components/ClarificationQuestionList';
import classes from './ClarifyingQuestions.module.css';

type Props = {
    /** The prompt the questions were asked about. */
    prompt: string;
    questions: string[];
    answers: string[];
    onAnswer: (index: number, value: string) => void;
    /** Hands the prompt back to the composer, round dropped. */
    onEditPrompt: () => void;
    onSkip: () => void;
    onBuild: () => void;
};

/** The clarifying round, grown upward out of the composer. Partial answers are
 *  fine: both Skip and Build lead to the same build. */
const ClarifyingQuestions: FC<Props> = ({
    prompt,
    questions,
    answers,
    onAnswer,
    onEditPrompt,
    onSkip,
    onBuild,
}) => {
    const answeredCount = answers.filter(
        (answer) => answer.trim().length > 0,
    ).length;

    return (
        <Box
            className={classes.sheet}
            role="group"
            aria-label="Questions before building"
        >
            <Box className={classes.sheetHeader}>
                <MantineIcon icon={IconSparkles} size={14} color="ldGray.6" />
                <Text
                    className={classes.sheetPrompt}
                    fz="xs"
                    c="ldGray.8"
                    fw={500}
                    lineClamp={1}
                >
                    {prompt}
                </Text>
                <Tooltip withArrow label="Edit the prompt instead">
                    <ActionIcon
                        variant="subtle"
                        color="ldGray"
                        size="xs"
                        aria-label="Edit the prompt instead"
                        onClick={onEditPrompt}
                    >
                        <MantineIcon icon={IconPencil} size={13} />
                    </ActionIcon>
                </Tooltip>
            </Box>
            <ClarificationQuestionList
                questions={questions}
                answers={answers}
                onAnswer={onAnswer}
            />
            <Group gap="xs" justify="flex-end" align="center">
                <Anchor
                    className={classes.skipLink}
                    component="button"
                    type="button"
                    size="xs"
                    c="dimmed"
                    fw={500}
                    onClick={onSkip}
                >
                    Skip and build anyway
                </Anchor>
                <Text fz="xs" c="dimmed">
                    {answeredCount} of {questions.length} answered
                </Text>
                <Button size="xs" onClick={onBuild}>
                    Build
                </Button>
            </Group>
        </Box>
    );
};

export default ClarifyingQuestions;
