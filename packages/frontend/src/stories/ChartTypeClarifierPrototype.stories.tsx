import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Text,
    Textarea,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconArrowUp,
    IconChartHistogram,
    IconHistory,
    IconPaperclip,
    IconPencil,
    IconPlayerStop,
    IconSparkles,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import { ComposerSubmitButton } from '../components/common/PromptComposer/ComposerSubmitButton';
import PromptComposer, {
    type PromptComposerHandle,
} from '../components/common/PromptComposer/PromptComposer';
import builderCanvas from '../features/apps/builder/BuilderCanvas.module.css';
import promptBar from '../features/apps/builder/BuilderPromptBar.module.css';
import promptExamples from '../features/apps/builder/BuilderPromptExamples.module.css';
import header from '../features/apps/builder/ChartTypeBuilderHeader.module.css';
import classes from './ChartTypeClarifierPrototype.module.css';

// PROTOTYPE — clarifying questions before the first chart type build. The
// composer grows upward into a sheet: the answers are folded into the prompt
// server-side, so the round is still prompt composition, not a queued item.

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const PALETTE = ['#7262FF', '#1A7F64', '#E8912D', '#CE4E4E'];

const AMBIGUOUS_PROMPT = 'show revenue split by team';

/** What the viz clarifier returns for the prompt above. */
const QUESTIONS = [
    'Should teams be compared side by side, or stacked into one total?',
    'Is revenue shown over time, or as a single period per team?',
    'How should teams beyond the top few be handled — grouped into “Other”, or all shown?',
    'Should the chart show absolute revenue, or each team’s share of the total?',
];

type Phase =
    | 'idle' // empty builder, nothing submitted
    | 'clarifying' // prompt sent, waiting on the clarifier
    | 'questions' // questions on screen, awaiting answers
    | 'building'; // build running, with or without answers

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

const SKELETON_BARS = [
    { x: 8, y: 34, height: 26 },
    { x: 34, y: 16, height: 44 },
    { x: 60, y: 25, height: 35 },
    { x: 86, y: 2, height: 58 },
    { x: 112, y: 19, height: 41 },
    { x: 138, y: 10, height: 50 },
];

const SkeletonBars: FC = () => (
    <svg viewBox="0 0 160 64" className={builderCanvas.skeleton} aria-hidden>
        {SKELETON_BARS.map((bar) => (
            <rect
                key={bar.x}
                {...bar}
                width="20"
                rx="3"
                fill={PALETTE[0]}
                className={builderCanvas.skeletonBar}
            />
        ))}
    </svg>
);

const EXAMPLE_PROMPTS = [
    'A stream graph of share over time',
    'A funnel of signup steps',
    'A calendar heatmap of daily orders',
    'A waterfall of revenue changes',
];

/** Stand-in for BuilderPromptExamples, without the palette hook's network. */
const ExampleCards: FC<{ onPick: (prompt: string) => void }> = ({ onPick }) => (
    <Group gap="sm" align="stretch" justify="center">
        {EXAMPLE_PROMPTS.map((prompt, index) => (
            <UnstyledButton
                key={prompt}
                className={promptExamples.card}
                onClick={() => onPick(prompt)}
            >
                <svg
                    viewBox="0 0 160 64"
                    className={promptExamples.thumbnail}
                    aria-hidden
                >
                    {[0, 1, 2, 3, 4].map((bar) => (
                        <rect
                            key={bar}
                            x={10 + bar * 30}
                            y={8 + ((bar + index) % 4) * 10}
                            width="22"
                            height={48 - ((bar + index) % 4) * 10}
                            rx="3"
                            fill={PALETTE[(bar + index) % PALETTE.length]}
                            opacity="0.9"
                        />
                    ))}
                </svg>
                <Text fz={13} fw={500} c="ldGray.8" lh={1.35}>
                    {prompt}
                </Text>
            </UnstyledButton>
        ))}
    </Group>
);

type QuestionListProps = {
    questions: string[];
    answers: string[];
    onAnswer: (index: number, value: string) => void;
};

const QuestionList: FC<QuestionListProps> = ({
    questions,
    answers,
    onAnswer,
}) => (
    <Stack gap={6}>
        {questions.map((question, index) => (
            <Box
                key={question}
                className={classes.questionField}
                data-answered={(answers[index] ?? '').trim().length > 0}
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
                    classNames={{ input: classes.questionInput }}
                    aria-label={question}
                />
            </Box>
        ))}
    </Stack>
);

const ClarifyActions: FC<{
    answeredCount: number;
    total: number;
    onSkip: () => void;
    onBuild: () => void;
}> = ({ answeredCount, total, onSkip, onBuild }) => (
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
            {answeredCount} of {total} answered
        </Text>
        <Button size="xs" onClick={onBuild}>
            Build
        </Button>
    </Group>
);

/* ------------------------------------------------------------------ *
 * The prototype
 * ------------------------------------------------------------------ */

type PrototypeProps = {
    /** The fallthrough: the clarifier errors and the build starts anyway. */
    clarifierFails: boolean;
    /** How long the clarifier round trip takes, in ms. */
    clarifyLatency: number;
};

const ChartTypeClarifierPrototype: FC<PrototypeProps> = ({
    clarifierFails,
    clarifyLatency,
}) => {
    const composerRef = useRef<PromptComposerHandle>(null);
    const [phase, setPhase] = useState<Phase>('idle');
    const [isEmpty, setIsEmpty] = useState(true);
    const [submittedPrompt, setSubmittedPrompt] = useState('');
    const [answers, setAnswers] = useState<string[]>([]);
    const [fellThrough, setFellThrough] = useState(false);
    const [buildLabel, setBuildLabel] = useState<string | null>(null);

    // Prototype-only: fakes the clarify round trip.
    useEffect(() => {
        if (phase !== 'clarifying') return;
        const timer = setTimeout(() => {
            if (clarifierFails) {
                setFellThrough(true);
                setBuildLabel(null);
                setPhase('building');
                return;
            }
            setAnswers(QUESTIONS.map(() => ''));
            setPhase('questions');
        }, clarifyLatency);
        return () => clearTimeout(timer);
    }, [phase, clarifierFails, clarifyLatency]);

    const handleSubmit = () => {
        const text = composerRef.current?.getText().trim() ?? '';
        if (!text) return;
        composerRef.current?.clear();
        setSubmittedPrompt(text);
        setFellThrough(false);
        setPhase('clarifying');
    };

    const startBuild = (skip: boolean) => {
        const answered = answers.filter((a) => a.trim().length > 0).length;
        setBuildLabel(
            skip
                ? 'no answers · skipped'
                : `${answered} of ${QUESTIONS.length} answers folded in`,
        );
        setPhase('building');
    };

    const reset = () => {
        setPhase('idle');
        setSubmittedPrompt('');
        setAnswers([]);
        setFellThrough(false);
        setBuildLabel(null);
        composerRef.current?.clear();
    };

    const answeredCount = answers.filter((a) => a.trim().length > 0).length;
    const showQuestions = phase === 'questions';
    const isBuilding = phase === 'building';

    /* --- canvas ------------------------------------------------------ */

    const canvasBody = (() => {
        if (isBuilding) {
            return (
                <Stack gap="xl" align="center">
                    <SkeletonBars />
                    <Stack gap={4} align="center">
                        <Text size="md" fw={600} c="ldGray.8">
                            Building your chart type…
                        </Text>
                        {fellThrough ? (
                            <Text fz="xs" c="dimmed" ta="center" maw={340}>
                                Couldn’t reach the clarifier, so this is
                                building from your prompt as written.
                            </Text>
                        ) : (
                            buildLabel && (
                                <Text fz="xs" c="dimmed">
                                    {buildLabel}
                                </Text>
                            )
                        )}
                    </Stack>
                </Stack>
            );
        }

        // Once a prompt is in flight the examples recede rather than
        // competing with the questions.
        const isQuiet = phase === 'clarifying' || showQuestions;

        return (
            <Stack
                gap="xl"
                align="center"
                className={isQuiet ? classes.canvasQuiet : undefined}
                inert={isQuiet}
            >
                <Text fz="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4}>
                    Start from an example
                </Text>
                <ExampleCards
                    onPick={(prompt) => {
                        composerRef.current?.clear();
                        composerRef.current?.insertContent([
                            { type: 'text', text: prompt },
                        ]);
                        composerRef.current?.focus();
                    }}
                />
            </Stack>
        );
    })();

    /* --- composer ---------------------------------------------------- */

    // Read-only, not just unsubmittable: it's the one input that can't lead
    // anywhere, so text typed into it would only be lost.
    const composerLocked = showQuestions;

    const composerPlaceholder = composerLocked
        ? 'Answer the questions, or skip, to build…'
        : phase === 'clarifying'
          ? 'Reading your prompt…'
          : isBuilding
            ? 'Ask for another change…'
            : 'Describe a new chart type…';

    return (
        <Box className={classes.shell}>
            {/* Header — a stand-in for ChartTypeBuilderHeader. */}
            <Box className={header.header}>
                <Box className={header.side}>
                    <MantineIcon
                        icon={IconChartHistogram}
                        size={18}
                        color="ldGray.7"
                    />
                    <Text size="sm" fw={600} c="ldGray.9">
                        New chart type
                    </Text>
                    <Box className={header.divider} />
                    <Text fz="xs" c="dimmed">
                        {isBuilding ? 'Building' : 'Draft'}
                    </Text>
                </Box>
                <Box className={header.side}>
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={
                            <MantineIcon icon={IconHistory} size={14} />
                        }
                        disabled
                    >
                        History
                    </Button>
                </Box>
            </Box>

            <Box className={classes.shellMain}>
                <Box className={classes.shellContent}>
                    <Box className={builderCanvas.canvas}>{canvasBody}</Box>

                    <Box className={promptBar.wrap}>
                        <Box className={promptBar.pillHost}>
                            {showQuestions && (
                                <Box className={classes.sheet}>
                                    <Box className={classes.sheetHeader}>
                                        <MantineIcon
                                            icon={IconSparkles}
                                            size={14}
                                            color="ldGray.6"
                                        />
                                        <Text
                                            className={classes.sheetPrompt}
                                            fz="xs"
                                            c="ldGray.8"
                                            fw={500}
                                            lineClamp={1}
                                        >
                                            {submittedPrompt}
                                        </Text>
                                        <Tooltip
                                            withArrow
                                            label="Edit the prompt instead"
                                        >
                                            <ActionIcon
                                                variant="subtle"
                                                color="ldGray"
                                                size="xs"
                                                aria-label="Edit the prompt instead"
                                                onClick={() => {
                                                    setPhase('idle');
                                                    composerRef.current?.insertContent(
                                                        [
                                                            {
                                                                type: 'text',
                                                                text: submittedPrompt,
                                                            },
                                                        ],
                                                    );
                                                    composerRef.current?.focus();
                                                }}
                                            >
                                                <MantineIcon
                                                    icon={IconPencil}
                                                    size={13}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Box>
                                    <QuestionList
                                        questions={QUESTIONS}
                                        answers={answers}
                                        onAnswer={(index, value) =>
                                            setAnswers((current) => {
                                                const next = [...current];
                                                next[index] = value;
                                                return next;
                                            })
                                        }
                                    />
                                    <ClarifyActions
                                        answeredCount={answeredCount}
                                        total={QUESTIONS.length}
                                        onSkip={() => startBuild(true)}
                                        onBuild={() => startBuild(false)}
                                    />
                                </Box>
                            )}

                            {/* The clarify wait and the build report on the
                                same status row the queue already owns. */}
                            {(phase === 'clarifying' || isBuilding) && (
                                <Box className={promptBar.queue} data-building>
                                    <Box
                                        className={`${promptBar.stackRow} ${promptBar.buildingStatus}`}
                                    >
                                        <Loader size={13} color="ldGray.6" />
                                        <Text
                                            fz="xs"
                                            fw={600}
                                            c="ldGray.9"
                                            inherit
                                        >
                                            {phase === 'clarifying'
                                                ? 'Reading your prompt…'
                                                : 'Building…'}
                                        </Text>
                                        <Text
                                            className={promptBar.buildingPrompt}
                                            fz="xs"
                                            c="dimmed"
                                            lineClamp={1}
                                        >
                                            “{submittedPrompt}”
                                        </Text>
                                        <Anchor
                                            className={promptBar.cancelBuild}
                                            component="button"
                                            type="button"
                                            size="xs"
                                            c="dimmed"
                                            fw={500}
                                            onClick={reset}
                                        >
                                            Cancel
                                        </Anchor>
                                    </Box>
                                </Box>
                            )}

                            <PromptComposer
                                ref={composerRef}
                                variant="inline"
                                placeholder={composerPlaceholder}
                                disabled={composerLocked}
                                onEmptyChange={setIsEmpty}
                                onSubmit={handleSubmit}
                                toolbarRight={
                                    <Group
                                        gap="calc(var(--mantine-spacing-xs) / 2)"
                                        align="center"
                                        wrap="nowrap"
                                    >
                                        {composerLocked ? (
                                            <Text fz="xs" c="dimmed">
                                                Answer or skip first
                                            </Text>
                                        ) : (
                                            <Text fz="xs" c="dimmed">
                                                Sonnet 4.5
                                            </Text>
                                        )}
                                        <Tooltip
                                            withArrow
                                            label="Attach an image or file"
                                        >
                                            <ActionIcon
                                                variant="subtle"
                                                color="ldGray"
                                                size="sm"
                                                aria-label="Attach"
                                            >
                                                <MantineIcon
                                                    icon={IconPaperclip}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                        {isBuilding && isEmpty ? (
                                            <ComposerSubmitButton
                                                icon={IconPlayerStop}
                                                label="Stop generation"
                                                size="sm"
                                                destructive
                                                onClick={reset}
                                            />
                                        ) : (
                                            <ComposerSubmitButton
                                                icon={IconArrowUp}
                                                label="Send"
                                                size="sm"
                                                disabled={
                                                    isEmpty || composerLocked
                                                }
                                                onClick={handleSubmit}
                                            />
                                        )}
                                    </Group>
                                }
                            />
                        </Box>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

/* ------------------------------------------------------------------ *
 * Harness — prototype scaffolding, not part of the design
 * ------------------------------------------------------------------ */

const Harness: FC<PrototypeProps> = (props) => {
    // Remount on any control change so each run starts from `idle`.
    const key = `${props.clarifierFails}-${props.clarifyLatency}`;
    return (
        <Box className={classes.harness}>
            <Box className={classes.harnessBar}>
                <Badge size="sm" variant="light" color="ldGray">
                    Prototype
                </Badge>
                <Text fz="xs" c="dimmed">
                    Type a prompt (try “{AMBIGUOUS_PROMPT}”) and hit send. Use
                    the Storybook controls to slow the clarifier down or make it
                    fail.
                </Text>
            </Box>
            <ChartTypeClarifierPrototype key={key} {...props} />
        </Box>
    );
};

const meta: Meta<typeof Harness> = {
    title: 'Prototypes/Chart type clarifier',
    component: Harness,
    parameters: { layout: 'fullscreen' },
    argTypes: {
        clarifierFails: {
            name: 'Clarifier fails',
            control: 'boolean',
        },
        clarifyLatency: {
            name: 'Clarifier latency (ms)',
            control: { type: 'range', min: 0, max: 6000, step: 250 },
        },
    },
    args: {
        clarifierFails: false,
        clarifyLatency: 1200,
    },
};

export default meta;

type Story = StoryObj<typeof Harness>;

/** The chosen design: the composer grows upward into a sheet. */
export const ComposerSheet: Story = {};

/** The clarifier is down: the build starts anyway, with no answers. */
export const ClarifierUnavailable: Story = { args: { clarifierFails: true } };

/** A slow clarifier: is the wait before the questions tolerable? */
export const SlowClarifier: Story = { args: { clarifyLatency: 5000 } };
