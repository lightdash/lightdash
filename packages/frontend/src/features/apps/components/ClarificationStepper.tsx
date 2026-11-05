import { type AppClarifyQuestion } from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import { useId, useState, type FC } from 'react';
import classes from './ClarificationStepper.module.css';

type Props = {
    questions: AppClarifyQuestion[];
    /** Answers by question index; blank means the agent decides. */
    answers: string[];
    onAnswer: (index: number, value: string) => void;
    onSkip: () => void;
    onBuild: () => void;
};

/** The pre-build questions, one at a time with suggested answers. Shared by
 *  the app builder's chat and the chart type builder's composer sheet. */
const ClarificationStepper: FC<Props> = ({
    questions,
    answers,
    onAnswer,
    onSkip,
    onBuild,
}) => {
    const [step, setStep] = useState(0);
    const questionId = useId();
    const current = questions[step];
    if (!current) return null;

    const isLast = step === questions.length - 1;
    const answer = answers[step] ?? '';
    const customAnswer = current.options.includes(answer) ? '' : answer;
    const next = () => (isLast ? onBuild() : setStep(step + 1));
    const choose = (value: string) => {
        onAnswer(step, value);
        if (!isLast) setStep(step + 1);
    };

    return (
        <Box className={classes.stepper}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="xs" className={classes.counter}>
                    {questions.length > 1
                        ? `Question ${step + 1} of ${questions.length}`
                        : 'One question before building'}
                </Text>
                <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    className={classes.skip}
                    onClick={onSkip}
                >
                    Skip, use defaults
                </Anchor>
            </Group>
            <Text size="sm" fw={500} lh={1.4} id={questionId}>
                {current.question}
            </Text>
            <Box
                className={classes.options}
                role="group"
                aria-labelledby={questionId}
            >
                {current.options.map((option) => (
                    <UnstyledButton
                        key={option}
                        className={classes.option}
                        aria-pressed={answer === option}
                        onClick={() => choose(option)}
                    >
                        {option}
                    </UnstyledButton>
                ))}
                <UnstyledButton
                    className={classes.option}
                    data-quiet
                    onClick={() => choose('')}
                >
                    You decide
                </UnstyledButton>
            </Box>
            <TextInput
                size="xs"
                // Remounts per question so autofocus follows the step.
                key={step}
                autoFocus={current.options.length === 0}
                placeholder={
                    current.options.length > 0
                        ? 'Or type your own answer'
                        : 'Type your answer'
                }
                aria-labelledby={questionId}
                value={customAnswer}
                onChange={(event) => onAnswer(step, event.currentTarget.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                        next();
                }}
            />
            <Group justify="space-between" gap="xs">
                {step > 0 ? (
                    <Button
                        variant="subtle"
                        color="gray"
                        size="xs"
                        onClick={() => setStep(step - 1)}
                    >
                        Back
                    </Button>
                ) : (
                    <span />
                )}
                <Button size="xs" onClick={next}>
                    {isLast ? 'Build' : 'Next'}
                </Button>
            </Group>
        </Box>
    );
};

export default ClarificationStepper;
