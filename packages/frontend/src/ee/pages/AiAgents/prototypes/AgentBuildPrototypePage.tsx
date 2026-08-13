import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Progress,
    ScrollArea,
    Select,
    Stack,
    Text,
    Textarea,
    ThemeIcon,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconArrowRight,
    IconBolt,
    IconBrandDatabricks,
    IconChartDots,
    IconCheck,
    IconPlayerPause,
    IconPlayerPlay,
    IconRefresh,
    IconRobot,
    IconSend,
    IconSparkles,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useSearchParams } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import classes from './AgentBuildPrototypePage.module.css';
import {
    agentBuildPrototypeReducer,
    initialAgentBuildPrototypeState,
    type AgentBuildPrototypeAction,
    type AgentBuildPrototypeState,
    type PrototypeBuildKind,
    type PrototypeDestination,
    type PrototypeWorkstream,
} from './agentBuildPrototypeState';

type VariantKey = 'split' | 'inline' | 'workbench';

const variants: Array<{ key: VariantKey; name: string }> = [
    { key: 'split', name: 'Split canvas' },
    { key: 'inline', name: 'Inline workstreams' },
    { key: 'workbench', name: 'Multi-build workbench' },
];

const statusColor: Record<PrototypeWorkstream['status'], string> = {
    drafting: 'grape',
    confirming: 'yellow',
    queued: 'blue',
    building: 'violet',
    ready: 'green',
    failed: 'red',
    cancelled: 'gray',
};

const getVariant = (value: string | null): VariantKey =>
    variants.some((variant) => variant.key === value)
        ? (value as VariantKey)
        : 'split';

const BuildIcon = ({ kind }: { kind: PrototypeBuildKind }) => (
    <ThemeIcon variant="light" color={kind === 'dataApp' ? 'violet' : 'cyan'}>
        <MantineIcon
            icon={kind === 'dataApp' ? IconBrandDatabricks : IconChartDots}
        />
    </ThemeIcon>
);

const BuildStarter = ({
    onCreate,
}: {
    onCreate: (kind: PrototypeBuildKind) => void;
}) => (
    <Group gap="xs" wrap="wrap">
        <Button
            size="xs"
            variant="light"
            color="violet"
            leftSection={<MantineIcon icon={IconBrandDatabricks} />}
            onClick={() => onCreate('dataApp')}
        >
            Draft Data App
        </Button>
        <Button
            size="xs"
            variant="light"
            color="cyan"
            leftSection={<MantineIcon icon={IconChartDots} />}
            onClick={() => onCreate('chartType')}
        >
            Draft chart type
        </Button>
    </Group>
);

const BuildBrief = ({ workstream }: { workstream: PrototypeWorkstream }) => (
    <Stack gap="xs">
        <Box>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Goal
            </Text>
            <Text size="sm">{workstream.brief.goal}</Text>
        </Box>
        <Box className={classes.briefGrid}>
            <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    Output
                </Text>
                <Text size="sm">{workstream.brief.output}</Text>
            </Box>
            <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    Data contract
                </Text>
                {workstream.brief.dataContext.map((item) => (
                    <Text size="xs" key={item}>
                        {item}
                    </Text>
                ))}
            </Box>
            <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    Interactions
                </Text>
                {workstream.brief.interactions.map((item) => (
                    <Text size="xs" key={item}>
                        {item}
                    </Text>
                ))}
            </Box>
            <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    Constraints
                </Text>
                {workstream.brief.constraints.map((item) => (
                    <Text size="xs" key={item}>
                        {item}
                    </Text>
                ))}
            </Box>
        </Box>
    </Stack>
);

const BuildActions = ({
    workstream,
    dispatch,
}: {
    workstream: PrototypeWorkstream;
    dispatch: React.Dispatch<AgentBuildPrototypeAction>;
}) => {
    const pendingInstruction = workstream.instructions.find(
        (instruction) => instruction.status === 'pending',
    );

    return (
        <Group gap="xs" wrap="wrap">
            {workstream.status === 'drafting' && (
                <Button
                    size="xs"
                    variant="light"
                    leftSection={<MantineIcon icon={IconSparkles} />}
                    onClick={() =>
                        dispatch({
                            type: 'finishDraft',
                            workstreamId: workstream.id,
                        })
                    }
                >
                    Finish draft brief
                </Button>
            )}
            {workstream.status === 'confirming' && (
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconCheck} />}
                    onClick={() =>
                        dispatch({
                            type: 'confirmBuild',
                            workstreamId: workstream.id,
                        })
                    }
                >
                    Confirm build
                </Button>
            )}
            {workstream.status === 'queued' && (
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlayerPlay} />}
                    onClick={() =>
                        dispatch({
                            type: 'startBuild',
                            workstreamId: workstream.id,
                        })
                    }
                >
                    Start simulated job
                </Button>
            )}
            {workstream.status === 'building' && (
                <>
                    <Button
                        size="xs"
                        variant="light"
                        color="red"
                        leftSection={<MantineIcon icon={IconX} />}
                        onClick={() =>
                            dispatch({
                                type: 'cancelBuild',
                                workstreamId: workstream.id,
                            })
                        }
                    >
                        Cancel
                    </Button>
                    <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() =>
                            dispatch({
                                type: 'failBuild',
                                workstreamId: workstream.id,
                            })
                        }
                    >
                        Simulate failure
                    </Button>
                </>
            )}
            {(workstream.status === 'failed' ||
                workstream.status === 'cancelled') && (
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconRefresh} />}
                    onClick={() =>
                        dispatch({
                            type: 'retryBuild',
                            workstreamId: workstream.id,
                        })
                    }
                >
                    Retry
                </Button>
            )}
            {workstream.status === 'ready' && pendingInstruction && (
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlayerPlay} />}
                    onClick={() =>
                        dispatch({
                            type: 'startQueuedVersion',
                            workstreamId: workstream.id,
                        })
                    }
                >
                    Build queued changes
                </Button>
            )}
            {workstream.status === 'building' && pendingInstruction && (
                <Tooltip label="Cancels the current version and starts a new one. This is not true steering.">
                    <Button
                        size="xs"
                        variant="light"
                        color="orange"
                        leftSection={<MantineIcon icon={IconPlayerPause} />}
                        onClick={() =>
                            dispatch({
                                type: 'interruptWithInstruction',
                                workstreamId: workstream.id,
                                instructionId: pendingInstruction.id,
                            })
                        }
                    >
                        Interrupt and apply
                    </Button>
                </Tooltip>
            )}
        </Group>
    );
};

const WorkstreamCard = ({
    workstream,
    dispatch,
    compact = false,
}: {
    workstream: PrototypeWorkstream;
    dispatch: React.Dispatch<AgentBuildPrototypeAction>;
    compact?: boolean;
}) => (
    <Paper withBorder radius="md" p={compact ? 'sm' : 'md'}>
        <Stack gap="sm">
            <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                    <BuildIcon kind={workstream.kind} />
                    <Box>
                        <Text fw={700} size="sm">
                            {workstream.title}
                        </Text>
                        <Text size="xs" c="dimmed">
                            Version {workstream.version} ·{' '}
                            {workstream.kind === 'dataApp'
                                ? 'Data App'
                                : 'Chart type'}
                        </Text>
                    </Box>
                </Group>
                <Badge color={statusColor[workstream.status]} variant="light">
                    {workstream.status}
                </Badge>
            </Group>

            {workstream.status === 'building' && (
                <Progress
                    value={workstream.progress}
                    color="violet"
                    animated
                    aria-label={`Build ${workstream.progress}% complete`}
                />
            )}

            {!compact && <BuildBrief workstream={workstream} />}

            {workstream.instructions.length > 0 && (
                <Stack gap={4}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        Instructions
                    </Text>
                    {workstream.instructions.map((instruction) => (
                        <Group key={instruction.id} gap="xs" wrap="nowrap">
                            <Badge
                                size="xs"
                                variant="dot"
                                color={
                                    instruction.status === 'pending'
                                        ? 'yellow'
                                        : 'green'
                                }
                            >
                                {instruction.delivery}
                            </Badge>
                            <Text
                                size="xs"
                                td={
                                    instruction.status === 'applied'
                                        ? 'line-through'
                                        : undefined
                                }
                            >
                                {instruction.text}
                            </Text>
                        </Group>
                    ))}
                </Stack>
            )}

            <BuildActions workstream={workstream} dispatch={dispatch} />
        </Stack>
    </Paper>
);

const Conversation = ({ state }: { state: AgentBuildPrototypeState }) => (
    <Stack gap="sm">
        {state.messages.map((message) => (
            <Box
                key={message.id}
                className={
                    message.role === 'user'
                        ? classes.userMessage
                        : classes.agentMessage
                }
            >
                <Group gap={6} mb={4}>
                    <MantineIcon
                        icon={message.role === 'user' ? IconSend : IconRobot}
                        size="xs"
                    />
                    <Text size="xs" fw={700} c="dimmed">
                        {message.role === 'user' ? 'You' : 'Agent'}
                        {message.workstreamId
                            ? ` → ${
                                  state.workstreams.find(
                                      (item) =>
                                          item.id === message.workstreamId,
                                  )?.title ?? 'Build'
                              }`
                            : ''}
                    </Text>
                </Group>
                <Text size="sm">{message.text}</Text>
            </Box>
        ))}
    </Stack>
);

const DestinationComposer = ({
    state,
    dispatch,
}: {
    state: AgentBuildPrototypeState;
    dispatch: React.Dispatch<AgentBuildPrototypeAction>;
}) => {
    const [value, setValue] = useState('');
    const destinationValue =
        state.destination.type === 'agent'
            ? 'agent'
            : state.destination.workstreamId;
    const destinationOptions = [
        { value: 'agent', label: 'Agent · normal conversation' },
        ...state.workstreams.map((workstream) => ({
            value: workstream.id,
            label: `${workstream.title} · queue a change`,
        })),
    ];

    const submit = () => {
        dispatch({ type: 'submitMessage', text: value });
        setValue('');
    };

    return (
        <Paper withBorder radius="md" p="xs" className={classes.composer}>
            <Stack gap="xs">
                <Select
                    size="xs"
                    label="Send to"
                    value={destinationValue}
                    data={destinationOptions}
                    allowDeselect={false}
                    onChange={(nextValue) => {
                        if (!nextValue) return;
                        const destination: PrototypeDestination =
                            nextValue === 'agent'
                                ? { type: 'agent' }
                                : {
                                      type: 'workstream',
                                      workstreamId: nextValue,
                                  };
                        dispatch({ type: 'setDestination', destination });
                    }}
                />
                <Group gap="xs" align="flex-end" wrap="nowrap">
                    <Textarea
                        value={value}
                        onChange={(event) =>
                            setValue(event.currentTarget.value)
                        }
                        placeholder={
                            state.destination.type === 'agent'
                                ? 'Ask a question without changing the build…'
                                : 'Queue an instruction for this build…'
                        }
                        autosize
                        minRows={1}
                        maxRows={3}
                        className={classes.composerInput}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                submit();
                            }
                        }}
                    />
                    <ActionIcon
                        size="lg"
                        variant="filled"
                        aria-label="Send message"
                        disabled={!value.trim()}
                        onClick={submit}
                    >
                        <MantineIcon icon={IconSend} />
                    </ActionIcon>
                </Group>
            </Stack>
        </Paper>
    );
};

const EmptyBuilds = ({
    onCreate,
}: {
    onCreate: (kind: PrototypeBuildKind) => void;
}) => (
    <Paper withBorder radius="md" p="xl" className={classes.emptyBuilds}>
        <Stack align="center" gap="sm">
            <ThemeIcon size="xl" variant="light" color="violet">
                <MantineIcon icon={IconSparkles} />
            </ThemeIcon>
            <Text fw={700}>No build workstream yet</Text>
            <Text size="sm" c="dimmed" ta="center">
                Draft a plan first. Nothing expensive starts until you confirm
                it.
            </Text>
            <BuildStarter onCreate={onCreate} />
        </Stack>
    </Paper>
);

const Preview = ({ workstream }: { workstream?: PrototypeWorkstream }) => (
    <Paper withBorder radius="md" className={classes.preview}>
        {workstream ? (
            <Stack h="100%" gap="sm">
                <Group justify="space-between">
                    <Box>
                        <Text fw={700}>{workstream.title}</Text>
                        <Text size="xs" c="dimmed">
                            Latest ready preview remains visible during rebuilds
                        </Text>
                    </Box>
                    <Badge variant="outline">v{workstream.version}</Badge>
                </Group>
                <Box className={classes.previewCanvas}>
                    <Box className={classes.mockMetric}>
                        <Text size="xs" c="dimmed">
                            Net revenue
                        </Text>
                        <Title order={2}>£2.48m</Title>
                        <Text size="xs" c="green">
                            +18.4% year over year
                        </Text>
                    </Box>
                    <Box className={classes.mockChart}>
                        {[44, 62, 49, 78, 67, 88, 74, 94].map(
                            (height, index) => (
                                <span
                                    key={index}
                                    style={{ height: `${height}%` }}
                                />
                            ),
                        )}
                    </Box>
                </Box>
            </Stack>
        ) : (
            <Stack align="center" justify="center" h="100%" gap="xs">
                <MantineIcon icon={IconChartDots} size="xl" color="gray" />
                <Text size="sm" c="dimmed">
                    Select a build to preview it
                </Text>
            </Stack>
        )}
    </Paper>
);

type VariantProps = {
    state: AgentBuildPrototypeState;
    dispatch: React.Dispatch<AgentBuildPrototypeAction>;
    createWorkstream: (kind: PrototypeBuildKind) => void;
};

const SplitVariant = ({ state, dispatch, createWorkstream }: VariantProps) => {
    const selected =
        state.workstreams.find(
            (item) => item.id === state.selectedWorkstreamId,
        ) ?? state.workstreams.at(-1);

    return (
        <Box className={classes.splitLayout}>
            <Stack className={classes.chatColumn} gap="md">
                <Group justify="space-between">
                    <Box>
                        <Text fw={700}>Conversation</Text>
                        <Text size="xs" c="dimmed">
                            The agent stays responsive while builds run.
                        </Text>
                    </Box>
                    <BuildStarter onCreate={createWorkstream} />
                </Group>
                <ScrollArea className={classes.flexScroll} offsetScrollbars>
                    <Conversation state={state} />
                </ScrollArea>
                <DestinationComposer state={state} dispatch={dispatch} />
            </Stack>
            <Stack className={classes.buildColumn} gap="md">
                <Group justify="space-between">
                    <Box>
                        <Text fw={700}>Build canvas</Text>
                        <Text size="xs" c="dimmed">
                            Plan, progress and preview stay together.
                        </Text>
                    </Box>
                    {state.workstreams.length > 1 && (
                        <Select
                            size="xs"
                            value={selected?.id}
                            data={state.workstreams.map((item) => ({
                                value: item.id,
                                label: item.title,
                            }))}
                            onChange={(workstreamId) =>
                                workstreamId &&
                                dispatch({
                                    type: 'selectWorkstream',
                                    workstreamId,
                                })
                            }
                            allowDeselect={false}
                        />
                    )}
                </Group>
                {selected ? (
                    <ScrollArea className={classes.flexScroll} offsetScrollbars>
                        <Stack gap="md">
                            <WorkstreamCard
                                workstream={selected}
                                dispatch={dispatch}
                            />
                            <Preview workstream={selected} />
                        </Stack>
                    </ScrollArea>
                ) : (
                    <EmptyBuilds onCreate={createWorkstream} />
                )}
            </Stack>
        </Box>
    );
};

const InlineVariant = ({ state, dispatch, createWorkstream }: VariantProps) => (
    <Box className={classes.inlineLayout}>
        <Stack gap="md" className={classes.inlineFeed}>
            <Group justify="space-between">
                <Box>
                    <Text fw={700}>One continuous conversation</Text>
                    <Text size="xs" c="dimmed">
                        Builds are durable messages in the thread.
                    </Text>
                </Box>
                <BuildStarter onCreate={createWorkstream} />
            </Group>
            <ScrollArea className={classes.flexScroll} offsetScrollbars>
                <Stack gap="md">
                    <Conversation state={state} />
                    {state.workstreams.map((workstream) => (
                        <Box
                            key={workstream.id}
                            className={classes.inlineBuild}
                        >
                            <WorkstreamCard
                                workstream={workstream}
                                dispatch={dispatch}
                            />
                        </Box>
                    ))}
                    {state.workstreams.length === 0 && (
                        <EmptyBuilds onCreate={createWorkstream} />
                    )}
                </Stack>
            </ScrollArea>
            <DestinationComposer state={state} dispatch={dispatch} />
        </Stack>
    </Box>
);

const WorkbenchVariant = ({
    state,
    dispatch,
    createWorkstream,
}: VariantProps) => {
    const selected =
        state.workstreams.find(
            (item) => item.id === state.selectedWorkstreamId,
        ) ?? state.workstreams.at(-1);

    return (
        <Box className={classes.workbenchLayout}>
            <Stack className={classes.workstreamRail} gap="sm">
                <Text fw={700}>Workstreams</Text>
                <BuildStarter onCreate={createWorkstream} />
                <Divider />
                <ScrollArea className={classes.flexScroll} offsetScrollbars>
                    <Stack gap="xs">
                        {state.workstreams.map((workstream) => (
                            <button
                                type="button"
                                key={workstream.id}
                                className={`${classes.railButton} ${
                                    selected?.id === workstream.id
                                        ? classes.railButtonSelected
                                        : ''
                                }`}
                                onClick={() =>
                                    dispatch({
                                        type: 'selectWorkstream',
                                        workstreamId: workstream.id,
                                    })
                                }
                            >
                                <Group justify="space-between" wrap="nowrap">
                                    <Text size="xs" fw={700} ta="left">
                                        {workstream.title}
                                    </Text>
                                    <Badge
                                        size="xs"
                                        color={statusColor[workstream.status]}
                                        variant="dot"
                                    >
                                        {workstream.status}
                                    </Badge>
                                </Group>
                            </button>
                        ))}
                        {state.workstreams.length === 0 && (
                            <Text size="xs" c="dimmed">
                                Start a build to add a workstream.
                            </Text>
                        )}
                    </Stack>
                </ScrollArea>
            </Stack>
            <Stack className={classes.workbenchCanvas} gap="md">
                {selected ? (
                    <>
                        <WorkstreamCard
                            workstream={selected}
                            dispatch={dispatch}
                            compact
                        />
                        <Preview workstream={selected} />
                    </>
                ) : (
                    <EmptyBuilds onCreate={createWorkstream} />
                )}
            </Stack>
            <Stack className={classes.workbenchChat} gap="md">
                <Box>
                    <Text fw={700}>Agent</Text>
                    <Text size="xs" c="dimmed">
                        Conversation remains independent of selection.
                    </Text>
                </Box>
                <ScrollArea className={classes.flexScroll} offsetScrollbars>
                    <Conversation state={state} />
                </ScrollArea>
                <DestinationComposer state={state} dispatch={dispatch} />
            </Stack>
        </Box>
    );
};

const PrototypeSwitcher = ({ current }: { current: VariantKey }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const currentIndex = variants.findIndex(
        (variant) => variant.key === current,
    );

    const selectVariant = useCallback(
        (offset: number) => {
            const nextIndex =
                (currentIndex + offset + variants.length) % variants.length;
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set('prototype', 'agent-builds');
            nextParams.set('variant', variants[nextIndex].key);
            setSearchParams(nextParams, { replace: true });
        },
        [currentIndex, searchParams, setSearchParams],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (
                target?.matches(
                    'input, textarea, select, [contenteditable="true"]',
                )
            ) {
                return;
            }
            if (event.key === 'ArrowLeft') selectVariant(-1);
            if (event.key === 'ArrowRight') selectVariant(1);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectVariant]);

    const variant = variants[currentIndex];

    return (
        <Box className={classes.variantSwitcher}>
            <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Previous prototype variant"
                onClick={() => selectVariant(-1)}
            >
                <MantineIcon icon={IconArrowLeft} />
            </ActionIcon>
            <Text size="sm" fw={700} c="white">
                {currentIndex + 1}/{variants.length} · {variant.name}
            </Text>
            <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Next prototype variant"
                onClick={() => selectVariant(1)}
            >
                <MantineIcon icon={IconArrowRight} />
            </ActionIcon>
        </Box>
    );
};

const StateInspector = ({ state }: { state: AgentBuildPrototypeState }) => (
    <details className={classes.stateInspector}>
        <summary>Prototype state</summary>
        <pre>{JSON.stringify(state, null, 2)}</pre>
    </details>
);

const AgentBuildPrototypePage = () => {
    const [searchParams] = useSearchParams();
    const variant = getVariant(searchParams.get('variant'));
    const [state, dispatch] = useReducer(
        agentBuildPrototypeReducer,
        initialAgentBuildPrototypeState,
    );

    const createWorkstream = (kind: PrototypeBuildKind) =>
        dispatch({ type: 'createWorkstream', kind });

    const buildingWorkstreams = useMemo(
        () => state.workstreams.filter((item) => item.status === 'building'),
        [state.workstreams],
    );

    useEffect(() => {
        if (buildingWorkstreams.length === 0) return undefined;

        const timeout = window.setTimeout(() => {
            buildingWorkstreams.forEach((workstream) => {
                dispatch({
                    type:
                        workstream.progress >= 84
                            ? 'completeBuild'
                            : 'advanceBuild',
                    workstreamId: workstream.id,
                });
            });
        }, 1800);

        return () => window.clearTimeout(timeout);
    }, [buildingWorkstreams]);

    return (
        <Box className={classes.page}>
            <Group className={classes.prototypeHeader} justify="space-between">
                <Group gap="sm">
                    <ThemeIcon variant="light" color="orange">
                        <MantineIcon icon={IconBolt} />
                    </ThemeIcon>
                    <Box>
                        <Group gap="xs">
                            <Title order={4}>Agent-led builds</Title>
                            <Badge color="orange" variant="light">
                                Throwaway POC
                            </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                            Does one conversation stay clear while it owns async
                            build workstreams?
                        </Text>
                    </Box>
                </Group>
                <Group gap="xs">
                    <Text size="xs" c="dimmed" className={classes.guideText}>
                        1 Draft · 2 Confirm · 3 Keep chatting · 4 Target a build
                    </Text>
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconRefresh} />}
                        onClick={() => dispatch({ type: 'reset' })}
                    >
                        Reset
                    </Button>
                </Group>
            </Group>

            <Box className={classes.variantHost}>
                {variant === 'split' && (
                    <SplitVariant
                        state={state}
                        dispatch={dispatch}
                        createWorkstream={createWorkstream}
                    />
                )}
                {variant === 'inline' && (
                    <InlineVariant
                        state={state}
                        dispatch={dispatch}
                        createWorkstream={createWorkstream}
                    />
                )}
                {variant === 'workbench' && (
                    <WorkbenchVariant
                        state={state}
                        dispatch={dispatch}
                        createWorkstream={createWorkstream}
                    />
                )}
            </Box>

            <StateInspector state={state} />
            <PrototypeSwitcher current={variant} />
        </Box>
    );
};

export default AgentBuildPrototypePage;
