import { formatAskUserAnswers, type AskUserQuestion } from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Group,
    Paper,
    Radio,
    Stack,
    Text,
    Textarea,
} from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import {
    useContext,
    useEffect,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
} from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './AskUserQuestionCard.module.css';
import { QuietCardsContext } from './ToolCalls/quietCards';

const isTypingTarget = (target: EventTarget) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA');

const isOptionOrCard = ({ target, currentTarget }: KeyboardEvent) =>
    target === currentTarget ||
    (target instanceof HTMLElement &&
        ['radio', 'checkbox'].includes(target.getAttribute('role') ?? ''));

export type AskUserSubmission = {
    /** Sent as the next user message. */
    text: string;
    /** Answers typed into the own-answer box rather than picked. */
    typedAnswerCount: number;
};

type Props = {
    questions: AskUserQuestion[];
    onSubmit: (submission: AskUserSubmission) => void;
};

type Answer = { selected: string[]; custom: string };

const getAnswerText = ({ selected, custom }: Answer) =>
    custom.trim() || selected.join(', ');

/** Sits above the composer: one question at a time, answers sent as the next message. */
export const AskUserQuestionCard: FC<Props> = ({ questions, onSubmit }) => {
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<Answer[]>(() =>
        questions.map(() => ({ selected: [], custom: '' })),
    );
    const question = questions[index];
    const isLast = index === questions.length - 1;
    const current = answers[index];
    const canAdvance = getAnswerText(current) !== '';
    // A lone question is already the reply above the card, so a narrow chat shows the choices only.
    const isBare = useContext(QuietCardsContext) && questions.length === 1;

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
        onSubmit({
            text: formatAskUserAnswers(
                questions.map(({ header }, i) => ({
                    header,
                    answer: getAnswerText(answers[i]),
                })),
            ),
            typedAnswerCount: answers.filter(({ custom }) => custom.trim())
                .length,
        });
    };

    // Picking a picked option again unpicks it, for pick-one too.
    const pick = (label: string) => {
        const others = current.selected.filter((value) => value !== label);
        const wasPicked = others.length < current.selected.length;
        if (wasPicked) {
            setSelected(others);
            return;
        }
        setSelected(question.multiSelect ? [...others, label] : [label]);
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
                withBorder={false}
                className={styles.optionRow}
            >
                <Box component="span" className={styles.optionMark}>
                    <Indicator size="xs" />
                </Box>
                <Box>
                    <Text size="sm" fw={500}>
                        {option.label}
                    </Text>
                    {option.description && (
                        <Text fz="xs" c="dimmed">
                            {option.description}
                        </Text>
                    )}
                </Box>
                <Box component="span" className={styles.optionKey} aria-hidden>
                    {i + 1}
                </Box>
            </OptionCard>
        );
    });
    const optionList = <Stack gap="xxs">{options}</Stack>;
    // A label, so a click anywhere on the row focuses the input.
    const ownAnswer = (
        <Box component="label" className={styles.ownAnswerRow}>
            <Box component="span" className={styles.optionMark} aria-hidden>
                <MantineIcon icon={IconPencil} size={14} color="dimmed" />
            </Box>
            <Textarea
                autosize
                minRows={1}
                maxRows={4}
                variant="unstyled"
                classNames={{ input: styles.ownAnswerInput }}
                aria-label="Your own answer"
                placeholder="Something else…"
                value={current.custom}
                onChange={(event) => setCustom(event.currentTarget.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        advance();
                    }
                }}
            />
        </Box>
    );

    return (
        <Paper
            ref={cardRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className={styles.card}
        >
            <Stack gap="xs" p="xs">
                {isBare ? null : (
                    <Group
                        justify="space-between"
                        wrap="nowrap"
                        px="xs"
                        pt="xxs"
                    >
                        <Text fz="xs" fw={500} c="dimmed">
                            {question.header}
                        </Text>
                        {questions.length > 1 && (
                            <Text fz="xs" c="dimmed">
                                {index + 1} of {questions.length}
                            </Text>
                        )}
                    </Group>
                )}
                {isBare && !question.multiSelect ? null : (
                    <Box px="xs">
                        {isBare ? null : (
                            <Text fz="sm" fw={500}>
                                {question.question}
                            </Text>
                        )}
                        {question.multiSelect && (
                            <Text fz="xs" c="dimmed">
                                Select all that apply
                            </Text>
                        )}
                    </Box>
                )}
                <Stack gap="xxs">
                    {question.multiSelect ? (
                        <Checkbox.Group
                            value={current.selected}
                            onChange={setSelected}
                            aria-label={question.question}
                        >
                            {optionList}
                        </Checkbox.Group>
                    ) : (
                        <Radio.Group
                            name={groupName}
                            value={current.selected[0] ?? null}
                            onChange={pick}
                            aria-label={question.question}
                        >
                            {optionList}
                        </Radio.Group>
                    )}
                    {ownAnswer}
                </Stack>
                <Group
                    justify="space-between"
                    wrap="nowrap"
                    className={styles.footer}
                >
                    {isBare ? null : (
                        <Text fz="xs" c="dimmed" className={styles.keyHint}>
                            1–{question.options.length} to pick, Enter to
                            continue
                        </Text>
                    )}
                    <Group gap="xs" wrap="nowrap" ml="auto">
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
                            disabled={!canAdvance}
                            onClick={advance}
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
