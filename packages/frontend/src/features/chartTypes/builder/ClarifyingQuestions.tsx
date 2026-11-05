import { type AppClarifyQuestion } from '@lightdash/common';
import { ActionIcon, Box, Text, Tooltip } from '@mantine/core';
import { IconPencil, IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import ClarificationStepper from '../../apps/components/ClarificationStepper';
import classes from './ClarifyingQuestions.module.css';

type Props = {
    /** The prompt the questions were asked about. */
    prompt: string;
    questions: AppClarifyQuestion[];
    answers: string[];
    onAnswer: (index: number, value: string) => void;
    /** Hands the prompt back to the composer, round dropped. */
    onEditPrompt: () => void;
    onSkip: () => void;
    onBuild: () => void;
};

/** The clarifying round, grown upward out of the composer. */
const ClarifyingQuestions: FC<Props> = ({
    prompt,
    questions,
    answers,
    onAnswer,
    onEditPrompt,
    onSkip,
    onBuild,
}) => (
    <Box
        className={classes.sheet}
        role="group"
        aria-label="Questions before building"
    >
        <Box className={classes.sheetHeader}>
            <MantineIcon icon={IconSparkles} size={14} color="dimmed" />
            <Text
                className={classes.sheetPrompt}
                fz="xs"
                fw={500}
                lineClamp={1}
            >
                {prompt}
            </Text>
            <Tooltip label="Edit the prompt instead">
                <ActionIcon
                    color="ldGray"
                    size="xs"
                    aria-label="Edit the prompt instead"
                    onClick={onEditPrompt}
                >
                    <MantineIcon icon={IconPencil} size={13} />
                </ActionIcon>
            </Tooltip>
        </Box>
        <ClarificationStepper
            questions={questions}
            answers={answers}
            onAnswer={onAnswer}
            onSkip={onSkip}
            onBuild={onBuild}
        />
    </Box>
);

export default ClarifyingQuestions;
