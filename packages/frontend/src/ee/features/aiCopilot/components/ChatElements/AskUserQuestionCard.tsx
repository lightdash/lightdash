import { formatAskUserAnswers, type AskUserQuestion } from '@lightdash/common';
import {
    Button,
    Checkbox,
    Group,
    Kbd,
    Paper,
    Radio,
    Stack,
    Text,
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
};

/** One question at a time; the answers go out as the next user message. */
export const AskUserQuestionCard: FC<Props> = ({ questions, onSubmit }) => {
    const [index, setIndex] = useState(0);
    const [selected, setSelected] = useState<string[][]>(() =>
        questions.map(() => []),
    );
    const question = questions[index];
    const isLast = index === questions.length - 1;
    const current = selected[index];

    const submit = (answers: string[][]) =>
        onSubmit(
            formatAskUserAnswers(
                questions.map(({ header }, i) => ({
                    header,
                    answer: answers[i].join(', '),
                })),
            ),
        );

    const toggle = (label: string) => {
        const next = question.multiSelect
            ? current.includes(label)
                ? current.filter((value) => value !== label)
                : [...current, label]
            : [label];
        setSelected((all) =>
            all.map((value, i) => (i === index ? next : value)),
        );
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
        <Paper p="md" className={styles.card}>
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
                        const checked = current.includes(option.label);
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
                <Group justify="space-between" wrap="nowrap">
                    <Text fz="xs" c="dimmed">
                        Or type your own answer below
                    </Text>
                    <Group gap="xs" wrap="nowrap">
                        {index > 0 && (
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() => setIndex(index - 1)}
                            >
                                Back
                            </Button>
                        )}
                        <Button
                            size="xs"
                            disabled={current.length === 0}
                            onClick={() =>
                                isLast ? submit(selected) : setIndex(index + 1)
                            }
                        >
                            {isLast
                                ? questions.length > 1
                                    ? 'Submit answers'
                                    : 'Submit answer'
                                : 'Next'}
                        </Button>
                    </Group>
                </Group>
            </Stack>
        </Paper>
    );
};
