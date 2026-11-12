import { formatAskUserAnswers, type AskUserQuestion } from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Group,
    Kbd,
    Paper,
    Radio,
    Stack,
    Text,
    Textarea,
} from '@mantine/core';
import { useEffect, useRef, useState, type FC } from 'react';
import styles from './AskUserQuestionCard.module.css';

const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA');

type Props = {
    questions: AskUserQuestion[];
    onSubmit: (answer: string) => void;
    /** Hands the composer back for a message that answers nothing. */
    onSkip: () => void;
};

type Answer = { selected: string[]; custom: string };

const getAnswerText = ({ selected, custom }: Answer) =>
    custom.trim() || selected.join(', ');

/** Takes the composer's place: one question at a time, answers sent as the next message. */
export const AskUserQuestionCard: FC<Props> = ({
    questions,
    onSubmit,
    onSkip,
}) => {
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<Answer[]>(() =>
        questions.map(() => ({ selected: [], custom: '' })),
    );
    const question = questions[index];
    const isLast = index === questions.length - 1;
    const current = answers[index];
    const canAdvance = getAnswerText(current) !== '';

    // Focus the card so number keys pick options without a click first.
    const cardRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        cardRef.current?.focus({ preventScroll: true });
    }, []);

    const setCurrent = (answer: Answer) =>
        setAnswers((all) =>
            all.map((value, i) => (i === index ? answer : value)),
        );

    const advance = () => {
        if (!canAdvance) return;
        if (!isLast) {
            setIndex(index + 1);
            return;
        }
        onSubmit(
            formatAskUserAnswers(
                questions.map(({ header }, i) => ({
                    header,
                    answer: getAnswerText(answers[i]),
                })),
            ),
        );
    };

    const toggle = (label: string) => {
        const selected = question.multiSelect
            ? current.selected.includes(label)
                ? current.selected.filter((value) => value !== label)
                : [...current.selected, label]
            : [label];
        setCurrent({ selected, custom: '' });
        if (!question.multiSelect && !isLast) setIndex(index + 1);
    };

    const toggleRef = useRef(toggle);
    toggleRef.current = toggle;
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (
                event.metaKey ||
                event.ctrlKey ||
                event.altKey ||
                isTypingTarget(event.target)
            ) {
                return;
            }
            const option = question.options[Number(event.key) - 1];
            if (!option) return;
            event.preventDefault();
            toggleRef.current(option.label);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [question]);

    const Indicator = question.multiSelect
        ? Checkbox.Indicator
        : Radio.Indicator;

    return (
        <Paper ref={cardRef} tabIndex={-1} p="md" className={styles.card}>
            <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap">
                    <Text fz="xs" fw={500} c="dimmed">
                        {question.header}
                    </Text>
                    {questions.length > 1 && (
                        <Text fz="xs" c="dimmed">
                            {index + 1}/{questions.length}
                        </Text>
                    )}
                </Group>
                <Text fw={500}>{question.question}</Text>
                <Stack gap="xs">
                    {question.options.map((option, i) => {
                        const checked = current.selected.includes(option.label);
                        const OptionCard = question.multiSelect
                            ? Checkbox.Card
                            : Radio.Card;
                        return (
                            <OptionCard
                                key={option.label}
                                checked={checked}
                                onClick={() => toggle(option.label)}
                                className={styles.option}
                                aria-label={option.label}
                            >
                                <Group wrap="nowrap" align="flex-start">
                                    <Indicator checked={checked} />
                                    <Stack gap={0} flex={1}>
                                        <Text fz="sm" fw={500}>
                                            {option.label}
                                        </Text>
                                        {option.description && (
                                            <Text fz="xs" c="dimmed">
                                                {option.description}
                                            </Text>
                                        )}
                                    </Stack>
                                    <Kbd size="xs">{i + 1}</Kbd>
                                </Group>
                            </OptionCard>
                        );
                    })}
                </Stack>
                <Textarea
                    autosize
                    minRows={1}
                    maxRows={4}
                    aria-label="Your own answer"
                    placeholder="Type your own answer, or leave this blank to use the selected option"
                    value={current.custom}
                    onChange={(event) =>
                        setCurrent({
                            selected: [],
                            custom: event.currentTarget.value,
                        })
                    }
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            advance();
                        }
                    }}
                />
                <Group gap="xs" wrap="nowrap">
                    <Button size="xs" variant="subtle" onClick={onSkip}>
                        Skip
                    </Button>
                    <Box flex={1} />
                    {index > 0 && (
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() => setIndex(index - 1)}
                        >
                            Back
                        </Button>
                    )}
                    <Button size="xs" disabled={!canAdvance} onClick={advance}>
                        {isLast
                            ? questions.length > 1
                                ? 'Submit answers'
                                : 'Submit answer'
                            : 'Next'}
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
};
