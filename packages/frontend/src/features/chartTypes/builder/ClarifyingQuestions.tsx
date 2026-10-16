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
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('chartTypes');
    const answeredCount = answers.filter(
        (answer) => answer.trim().length > 0,
    ).length;

    return (
        <Box
            className={classes.sheet}
            role="group"
            aria-label={t('clarifying.aria')}
        >
            <Box className={classes.sheetHeader}>
                <MantineIcon icon={IconSparkles} size={14} color="dimmed" />
                <Text
                    className={classes.sheetPrompt}
                    fz="xs"
                    c="ldGray.8"
                    fw={500}
                    lineClamp={1}
                >
                    {prompt}
                </Text>
                <Tooltip label={t('clarifying.editPrompt')}>
                    <ActionIcon
                        color="ldGray"
                        size="xs"
                        aria-label={t('clarifying.editPrompt')}
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
                    {t('clarifying.skip')}
                </Anchor>
                <Text fz="xs" c="dimmed">
                    {t('clarifying.answered', {
                        answered: answeredCount,
                        total: questions.length,
                    })}
                </Text>
                <Button size="xs" onClick={onBuild}>
                    {t('clarifying.build')}
                </Button>
            </Group>
        </Box>
    );
};

export default ClarifyingQuestions;
