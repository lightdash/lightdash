import { formatAskUserAnswers, type AskUserQuestion } from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Group,
    Kbd,
    Radio,
    Stack,
    Text,
    Textarea,
} from '@mantine/core';
import {
    useEffect,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
} from 'react';
import composerStyles from '../../../../../components/common/PromptComposer/PromptComposer.module.css';
import styles from './AskUserQuestionCard.module.css';

const isTypingTarget = (target: EventTarget) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA');

const isOptionOrCard = ({ target, currentTarget }: KeyboardEvent) =>
    target === currentTarget ||
    (target instanceof HTMLElement &&
        ['radio', 'checkbox'].includes(target.getAttribute('role') ?? ''));

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

    const setSelected = (selected: string[]) =>
        setAnswers((all) =>
            all.map((value, i) =>
                i === index ? { selected, custom: '' } : value,
            ),
        );

    const setCustom = (custom: string) =>
        setAnswers((all) =>
            all.map((value, i) =>
                i === index ? { selected: [], custom } : value,
            ),
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

    const pick = (label: string) => {
        if (!question.multiSelect) {
            setSelected([label]);
            return;
        }
        setSelected(
            current.selected.includes(label)
                ? current.selected.filter((value) => value !== label)
                : [...current.selected, label],
        );
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (
            event.metaKey ||
            event.ctrlKey ||
            event.altKey ||
            isTypingTarget(event.target)
        ) {
            return;
        }
        // Enter on the card or an option moves on; Space still toggles an option.
        if (event.key === 'Enter' && isOptionOrCard(event)) {
            event.preventDefault();
            advance();
            return;
        }
        const option = question.options[Number(event.key) - 1];
        if (!option) return;
        event.preventDefault();
        pick(option.label);
    };

    const groupName = `ask-user-question-${index}`;
    const options = question.options.map((option, i) => {
        const OptionCard = question.multiSelect ? Checkbox.Card : Radio.Card;
        const Indicator = question.multiSelect
            ? Checkbox.Indicator
            : Radio.Indicator;
        return (
            <OptionCard
                key={option.label}
                value={option.label}
                className={styles.option}
            >
                <Group wrap="nowrap" align="flex-start">
                    <Indicator />
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
                    <Kbd size="xs" aria-hidden>
                        {i + 1}
                    </Kbd>
                </Group>
            </OptionCard>
        );
    });

    return (
        <Box
            ref={cardRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            data-variant="card"
            className={`${composerStyles.root} ${styles.card}`}
        >
            <Stack gap="sm" p="md" className={styles.body}>
                <Group justify="space-between" wrap="nowrap">
                    <Text fz="xs" fw={500} c="dimmed">
                        {question.header}
                    </Text>
                    {questions.length > 1 && (
                        <Text fz="xs" c="dimmed">
                            {index + 1} of {questions.length}
                        </Text>
                    )}
                </Group>
                <Box>
                    <Text fw={500}>{question.question}</Text>
                    {question.multiSelect && (
                        <Text fz="xs" c="dimmed">
                            Select all that apply
                        </Text>
                    )}
                </Box>
                {question.multiSelect ? (
                    <Checkbox.Group
                        value={current.selected}
                        onChange={setSelected}
                        aria-label={question.question}
                    >
                        <Stack gap="xs">{options}</Stack>
                    </Checkbox.Group>
                ) : (
                    <Radio.Group
                        name={groupName}
                        value={current.selected[0] ?? null}
                        onChange={(label) => setSelected([label])}
                        aria-label={question.question}
                    >
                        <Stack gap="xs">{options}</Stack>
                    </Radio.Group>
                )}
                <Textarea
                    autosize
                    minRows={1}
                    maxRows={4}
                    aria-label="Your own answer"
                    placeholder="Or type your own answer…"
                    value={current.custom}
                    onChange={(event) => setCustom(event.currentTarget.value)}
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
        </Box>
    );
};
