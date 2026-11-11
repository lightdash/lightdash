/** What a person needs around a draft before publishing it: what happened under it, who else is in it, each change in order, and what it does to the numbers. */
import {
    getItemId,
    type ApiError,
    type ApiQueryResults,
    type Metric,
    type SemanticLayerDraft,
    type SemanticLayerDraftConflict,
    type SemanticLayerDraftModel,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconCircleCheck,
    IconCircleDashed,
    IconAlertTriangle,
    IconArrowDown,
    IconArrowUp,
    IconGitMerge,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
} from './developmentView';
import classes from './DraftInsights.module.css';
import { describeShift, pickComparedMetrics } from './metricComparison';
import {
    useDiscardDraftChange,
    useKeepDraftModel,
    useMoveDraftChange,
    useTakeLiveDraftPart,
    useSemanticLayerDraftUsage,
} from './useSemanticLayerModel';

const listNames = (names: string[]): string =>
    names.length <= 2
        ? names.join(' and ')
        : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;

const describePath = (path: string): string =>
    path === '' ? 'the whole model' : path;

const SIDES: {
    key: 'base' | 'live' | 'mine';
    label: string;
    absent: string;
}[] = [
    { key: 'base', label: 'When you started', absent: 'Not there' },
    { key: 'live', label: 'Live now', absent: 'Removed' },
    { key: 'mine', label: 'Yours', absent: 'Removed' },
];

/** One part that changed live and in the draft, with each version of it side by side. */
const ConflictSides: FC<{
    projectUuid: string;
    model: string;
    conflict: SemanticLayerDraftConflict;
}> = ({ projectUuid, model, conflict }) => {
    const takeLive = useTakeLiveDraftPart(projectUuid);
    return (
        <Stack gap={4} className={classes.conflict}>
            <Group gap="xs" justify="space-between" wrap="nowrap">
                <Text fz="xs" fw={500} ff="monospace" truncate>
                    {describePath(conflict.path)}
                </Text>
                <Tooltip label="Drops your change to this part and keeps what is live. The rest of your changes stay.">
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        flex="none"
                        loading={takeLive.isLoading}
                        onClick={() =>
                            takeLive.mutate({ model, path: conflict.path })
                        }
                    >
                        Take theirs
                    </Button>
                </Tooltip>
            </Group>
            <Box className={classes.sides}>
                {SIDES.map(({ key, label, absent }) => (
                    <Stack key={key} gap={2} miw={0}>
                        <Text fz="xs" c="dimmed">
                            {label}
                        </Text>
                        <Box component="pre" className={classes.side}>
                            {conflict[key] ?? absent}
                        </Box>
                    </Stack>
                ))}
            </Box>
        </Stack>
    );
};

/** What happened to a model outside this draft: a publish under it, or someone else's work in it. */
export const ModelNotices: FC<{
    projectUuid: string;
    model: SemanticLayerDraftModel;
    onAskAgent: (prompt: string) => void;
}> = ({ projectUuid, model, onAskAgent }) => {
    const publishedAgo = useTimeAgo(model.publishedSince?.at ?? new Date());
    const keep = useKeepDraftModel(projectUuid);
    const conflicts = model.reconciliation?.conflicts ?? [];
    const merged = model.reconciliation?.merged ?? [];
    const publisher = model.publishedSince?.by ?? 'Someone';
    // Kept over what was published: the draft is based on live again.
    const publishedUnder =
        model.reconciliation?.state === 'current' ? null : model.publishedSince;
    if (
        !publishedUnder &&
        model.alsoChanging.length === 0 &&
        conflicts.length === 0
    ) {
        return null;
    }
    return (
        <Stack gap={4} className={classes.notices}>
            {conflicts.length > 0 ? (
                <Stack gap="xs">
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon
                            icon={IconAlertTriangle}
                            size={14}
                            color="yellow"
                        />
                        <Text fz="xs" flex={1}>
                            {publisher} published a change to{' '}
                            {conflicts.length === 1
                                ? 'a part'
                                : `${conflicts.length} parts`}{' '}
                            of this model that you changed too. Choose before
                            publishing: yours would replace theirs.
                        </Text>
                        <Tooltip label="Has the agent propose a version that keeps both changes where it can.">
                            <Button
                                size="compact-xs"
                                variant="default"
                                onClick={() =>
                                    onAskAgent(
                                        [
                                            `Someone published changes to the model ${model.model} in parts my changes in development also change.`,
                                            ...conflicts.map(
                                                ({ path, live, mine }) =>
                                                    `${describePath(path)}: live now is ${live ?? 'removed'}; mine is ${mine ?? 'removed'}.`,
                                            ),
                                            'Read the model as it is live and propose a change that keeps both where they can be combined. Where they cannot, say so and ask me which to keep.',
                                        ].join(' '),
                                    )
                                }
                            >
                                Combine
                            </Button>
                        </Tooltip>
                        <Tooltip label="Keeps your version of every part still listed. It goes live when you publish.">
                            <Button
                                size="compact-xs"
                                variant="default"
                                loading={keep.isLoading}
                                onClick={() => keep.mutate(model.model)}
                            >
                                Keep mine
                            </Button>
                        </Tooltip>
                    </Group>
                    {conflicts.map((conflict) => (
                        <ConflictSides
                            key={conflict.path}
                            projectUuid={projectUuid}
                            model={model.model}
                            conflict={conflict}
                        />
                    ))}
                </Stack>
            ) : null}
            {publishedUnder && conflicts.length === 0 ? (
                <Group gap={6} wrap="nowrap">
                    <MantineIcon icon={IconGitMerge} size={14} color="dimmed" />
                    <Text fz="xs" c="dimmed">
                        {publisher} published a change to this model{' '}
                        {publishedAgo}, after you started
                        {merged.length > 0
                            ? `, in ${listNames(merged.map(describePath))}, which you did not touch`
                            : ''}
                        . Your changes are shown on top of it.
                    </Text>
                </Group>
            ) : null}
            {model.alsoChanging.map(({ name, paths }) => (
                <Group key={name} gap={6} wrap="nowrap">
                    <MantineIcon icon={IconUsers} size={14} color="dimmed" />
                    <Text fz="xs" c="dimmed">
                        {name} is also changing{' '}
                        {paths.length > 0
                            ? listNames(paths.map(describePath))
                            : 'this model'}
                        , in development.
                    </Text>
                </Group>
            ))}
        </Stack>
    );
};

const ChangeRow: FC<{
    projectUuid: string;
    index: number;
    /** How many changes the draft has, to know which way this one can move. */
    count: number;
    change: SemanticLayerDraft['changes'][number];
    onAskAgent: (prompt: string) => void;
}> = ({ projectUuid, index, count, change, onAskAgent }) => {
    const discard = useDiscardDraftChange(projectUuid);
    const move = useMoveDraftChange(projectUuid);
    const ago = useTimeAgo(change.createdAt);
    const failed = change.models.filter(({ error }) => error !== null);
    return (
        <Group gap="sm" wrap="nowrap" className={classes.change}>
            <Text fz="xs" c="dimmed" className={classes.changeIndex}>
                {index + 1}
            </Text>
            <Box miw={0} flex={1}>
                <Text fz="sm" truncate>
                    {change.question ?? 'A change made in the review'}
                </Text>
                <Text fz="xs" c={failed.length > 0 ? 'red' : 'dimmed'} truncate>
                    {failed.length > 0
                        ? `No longer applies to ${listNames(failed.map(({ model }) => model))}`
                        : `${listNames(change.models.map(({ model }) => model))} · ${ago}`}
                </Text>
            </Box>
            {failed.length > 0 ? (
                <Tooltip label="Discards this change and has the agent redo it on the model as it is now.">
                    <Button
                        size="compact-xs"
                        variant="default"
                        loading={discard.isLoading}
                        onClick={() =>
                            // The agent adds changes and cannot repair a stored one, so the stale one goes first.
                            discard.mutate(change.draftChangeUuid, {
                                onSuccess: () =>
                                    onAskAgent(
                                        [
                                            'A change in development stopped applying, so I discarded it.',
                                            change.question
                                                ? `It was asked for with: "${change.question}"`
                                                : null,
                                            `It failed with: ${failed
                                                .map(
                                                    ({ model, error }) =>
                                                        `${model}: ${error}`,
                                                )
                                                .join(' ')}`,
                                            'Read the model as it is now and propose that change again so it applies.',
                                        ]
                                            .filter(Boolean)
                                            .join(' '),
                                    ),
                            })
                        }
                    >
                        Fix it
                    </Button>
                </Tooltip>
            ) : null}
            {count > 1 ? (
                <Group gap={0} wrap="nowrap" flex="none">
                    <Tooltip label="Apply earlier">
                        <ActionIcon
                            size="sm"
                            aria-label="Apply earlier"
                            disabled={index === 0 || move.isLoading}
                            onClick={() =>
                                move.mutate({
                                    draftChangeUuid: change.draftChangeUuid,
                                    direction: 'earlier',
                                })
                            }
                        >
                            <MantineIcon icon={IconArrowUp} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Apply later">
                        <ActionIcon
                            size="sm"
                            aria-label="Apply later"
                            disabled={index === count - 1 || move.isLoading}
                            onClick={() =>
                                move.mutate({
                                    draftChangeUuid: change.draftChangeUuid,
                                    direction: 'later',
                                })
                            }
                        >
                            <MantineIcon icon={IconArrowDown} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            ) : null}
            <ConfirmDeleteButton
                size="sm"
                aria-label="Discard this change"
                tooltip="Click again to discard this change"
                disabled={discard.isLoading}
                onConfirm={() => discard.mutate(change.draftChangeUuid)}
            >
                <MantineIcon icon={IconTrash} />
            </ConfirmDeleteButton>
        </Group>
    );
};

/** The draft as the ordered list it is: each change builds on the ones before it. */
export const ChangeQueue: FC<{
    projectUuid: string;
    draft: SemanticLayerDraft;
    onAskAgent: (prompt: string) => void;
}> = ({ projectUuid, draft, onAskAgent }) => (
    <Paper className={classes.section}>
        <Text fz="sm" fw={500} className={classes.sectionTitle}>
            Changes in order
        </Text>
        {draft.changes.map((change, index) => (
            <ChangeRow
                key={change.draftChangeUuid}
                projectUuid={projectUuid}
                index={index}
                count={draft.changes.length}
                change={change}
                onAskAgent={onAskAgent}
            />
        ))}
    </Paper>
);

const MAX_LISTED_CHARTS = 5;

/** Saved charts that read what the draft redefines or removes: nothing breaks, but their numbers move. */
export const DraftUsage: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data } = useSemanticLayerDraftUsage(projectUuid);
    if (!data || data.fields.length === 0) return null;
    return (
        <Paper className={classes.section}>
            <Text fz="sm" fw={500} className={classes.sectionTitle}>
                Saved content that reads what you changed
            </Text>
            {data.fields.map((field) => (
                <Box key={field.fieldId} className={classes.change}>
                    <Text fz="sm">
                        {field.label}{' '}
                        <Text span inherit c="dimmed">
                            in {field.model},{' '}
                            {field.kind === 'removed'
                                ? 'removed'
                                : 'defined differently'}
                        </Text>
                    </Text>
                    <Text fz="xs" c="dimmed">
                        {field.charts
                            .slice(0, MAX_LISTED_CHARTS)
                            .map((chart, index) => (
                                <Text span inherit key={chart.uuid}>
                                    {index > 0 ? ', ' : ''}
                                    <Anchor
                                        component={Link}
                                        to={`/projects/${projectUuid}/saved/${chart.uuid}`}
                                        target="_blank"
                                        inherit
                                    >
                                        {chart.name}
                                    </Anchor>
                                </Text>
                            ))}
                        {field.charts.length > MAX_LISTED_CHARTS
                            ? ` and ${field.charts.length - MAX_LISTED_CHARTS} more charts`
                            : ''}
                        {field.dashboards > 0
                            ? ` · ${field.dashboards} ${field.dashboards === 1 ? 'dashboard' : 'dashboards'}`
                            : ''}
                        {field.scheduledDeliveries > 0
                            ? ` · ${field.scheduledDeliveries} scheduled ${field.scheduledDeliveries === 1 ? 'delivery' : 'deliveries'}`
                            : ''}
                    </Text>
                </Box>
            ))}
        </Paper>
    );
};

type Totals = Record<string, { raw: unknown; formatted: string }>;

const findComparedMetrics = (
    draft: SemanticLayerDraft,
    model: SemanticLayerDraftModel,
): Metric[] => {
    if (!model.explore) return [];
    const changed = new Set(
        draft.changes
            .flatMap(({ models }) => models)
            .filter((entry) => entry.model === model.model)
            .flatMap(({ changes }) => changes)
            .flatMap(({ path }) => {
                const name = /(?:^|\.)metrics\.([^.]+)/.exec(path)?.[1];
                return name ? [name] : [];
            }),
    );
    return pickComparedMetrics(
        Object.values(
            model.explore.tables[model.explore.baseTable]?.metrics ?? {},
        ),
        changed,
        model.contentBefore === null,
    );
};

const useTotals = (
    projectUuid: string,
    exploreName: string,
    metricIds: string[],
    side: 'live' | 'development',
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<Totals, ApiError>({
        queryKey: [
            'semantic-layer-draft-totals',
            projectUuid,
            exploreName,
            side,
            metricIds,
        ],
        queryFn: async () => {
            const results = await lightdashApi<ApiQueryResults>({
                url: `/projects/${projectUuid}/explores/${exploreName}/runQuery`,
                method: 'POST',
                // Each side says which models it reads, whatever the app is switched to.
                headers: {
                    [DEVELOPMENT_VIEW_HEADER]:
                        side === 'development' ? 'true' : 'false',
                    // A draft is read from the draft itself, never from another project's preview.
                    [DEVELOPMENT_PREVIEW_HEADER]: '',
                },
                body: JSON.stringify({
                    exploreName,
                    dimensions: [],
                    metrics: metricIds,
                    filters: {},
                    sorts: [],
                    limit: 1,
                    tableCalculations: [],
                    additionalMetrics: [],
                }),
            });
            const [row] = results.rows;
            return Object.fromEntries(
                metricIds.map((id) => [
                    id,
                    row?.[id]?.value ?? { raw: null, formatted: '∅' },
                ]),
            );
        },
        enabled,
        retry: false,
        staleTime: 60_000,
    });
};

/** A drafted model's metrics as totals, live against in development, run only when asked for since each side is a warehouse query. */
export const MetricComparison: FC<{
    projectUuid: string;
    draft: SemanticLayerDraft;
    model: SemanticLayerDraftModel;
}> = ({ projectUuid, draft, model }) => {
    const [isAsked, setIsAsked] = useState(false);
    const metrics = findComparedMetrics(draft, model);
    const ids = metrics.map((metric) => getItemId(metric));
    const isNewModel = model.contentBefore === null;
    const development = useTotals(
        projectUuid,
        model.model,
        ids,
        'development',
        isAsked && ids.length > 0,
    );
    // A metric the draft adds does not exist live, so the live side is read one metric at a time and may be missing.
    const live = useTotals(
        projectUuid,
        model.model,
        ids,
        'live',
        isAsked && ids.length > 0 && !isNewModel,
    );
    if (metrics.length === 0) return null;
    if (!isAsked) {
        return (
            <Group className={classes.compare} gap="xs">
                <Button
                    size="compact-xs"
                    variant="default"
                    onClick={() => setIsAsked(true)}
                >
                    {isNewModel ? 'Run the numbers' : 'Compare with live'}
                </Button>
                <Text fz="xs" c="dimmed">
                    {metrics.length === 1
                        ? '1 metric'
                        : `${metrics.length} metrics`}
                    {isNewModel
                        ? ', one warehouse query'
                        : ', one warehouse query each side'}
                </Text>
            </Group>
        );
    }
    return (
        <Box className={classes.compare}>
            <Table verticalSpacing={4} fz="xs">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Metric</Table.Th>
                        {isNewModel ? null : (
                            <Table.Th ta="right">Live</Table.Th>
                        )}
                        <Table.Th ta="right">In development</Table.Th>
                        {isNewModel ? null : <Table.Th ta="right" />}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {metrics.map((metric) => {
                        const id = getItemId(metric);
                        const after = development.data?.[id];
                        const before = live.data?.[id];
                        const shift =
                            before && after
                                ? describeShift(before.raw, after.raw)
                                : null;
                        return (
                            <Table.Tr key={id}>
                                <Table.Td>{metric.label}</Table.Td>
                                {isNewModel ? null : (
                                    <Table.Td ta="right" c="dimmed">
                                        {live.isInitialLoading
                                            ? '…'
                                            : (before?.formatted ?? 'new')}
                                    </Table.Td>
                                )}
                                <Table.Td ta="right">
                                    {development.isInitialLoading
                                        ? '…'
                                        : (after?.formatted ?? '∅')}
                                </Table.Td>
                                {isNewModel ? null : (
                                    <Table.Td
                                        ta="right"
                                        c={shift ? 'orange' : 'dimmed'}
                                    >
                                        {shift ??
                                            (before && after ? 'same' : '')}
                                    </Table.Td>
                                )}
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
            {development.isError ? (
                <Text fz="xs" c="red">
                    Could not run these in development:{' '}
                    {development.error.error.message}
                </Text>
            ) : null}
        </Box>
    );
};

type CheckState = 'ok' | 'attention' | 'unknown';

const CHECK_ICONS = {
    ok: IconCircleCheck,
    attention: IconAlertTriangle,
    unknown: IconCircleDashed,
};
const CHECK_COLORS = { ok: 'green', attention: 'orange', unknown: 'dimmed' };

/** What is worth knowing at the moment of publishing, each as one line. */
export const PublishChecklist: FC<{
    draft: SemanticLayerDraft;
    model: string | null;
    /** Saved content the draft breaks; null while that is not known. */
    breaks: number | null;
    /** Saved charts that read a field the draft defines differently; null while that is not known. */
    chartsThatChange: number | null;
}> = ({ draft, model, breaks, chartsThatChange }) => {
    const models = draft.models.filter(
        (entry) => model === null || entry.model === model,
    );
    const failing = draft.changes.filter((change) =>
        change.models.some(
            (entry) =>
                entry.error !== null &&
                (model === null || entry.model === model),
        ),
    ).length;
    const conflicted = models.filter(
        (entry) => entry.reconciliation?.state === 'conflict',
    );
    const movedUnder = models.filter(
        (entry) =>
            entry.publishedSince &&
            entry.reconciliation?.state !== 'current' &&
            !conflicted.includes(entry),
    );
    const others = [
        ...new Set(
            models.flatMap(({ alsoChanging }) =>
                alsoChanging.map(({ name }) => name),
            ),
        ),
    ];
    const checks: { state: CheckState; text: string }[] = [
        failing > 0
            ? {
                  state: 'attention',
                  text: `${failing} ${failing === 1 ? 'change no longer applies' : 'changes no longer apply'}`,
              }
            : { state: 'ok', text: 'Every change applies and compiles' },
        breaks === null
            ? {
                  state: 'unknown',
                  text: 'Saved charts and dashboards are not checked yet',
              }
            : breaks > 0
              ? {
                    state: 'attention',
                    text: `${breaks} saved ${breaks === 1 ? 'item' : 'items'} would break`,
                }
              : { state: 'ok', text: 'No saved chart or dashboard breaks' },
        ...(chartsThatChange !== null && chartsThatChange > 0
            ? [
                  {
                      state: 'attention' as const,
                      text: `${chartsThatChange} saved ${chartsThatChange === 1 ? 'chart reads' : 'charts read'} a field you defined differently`,
                  },
              ]
            : []),
        ...(conflicted.length > 0
            ? [
                  {
                      state: 'attention' as const,
                      text: `${listNames(conflicted.map((entry) => entry.model))} changed live in parts you changed too. Keep yours or combine them to publish`,
                  },
              ]
            : []),
        ...(movedUnder.length > 0
            ? [
                  {
                      // Published elsewhere in the model, and the draft already sits on top of it.
                      state: movedUnder.every(
                          (entry) => entry.reconciliation?.state === 'merged',
                      )
                          ? ('ok' as const)
                          : ('attention' as const),
                      text: `${listNames(movedUnder.map((entry) => entry.model))} changed live after you started, outside what you changed`,
                  },
              ]
            : []),
        ...(movedUnder.length === 0 && conflicted.length === 0
            ? [
                  {
                      state: 'ok' as const,
                      text: 'Nothing was published under your changes',
                  },
              ]
            : []),
        ...(others.length > 0
            ? [
                  {
                      state: 'attention' as const,
                      text: `${listNames(others)} ${others.length === 1 ? 'has' : 'have'} changes in development on the same models`,
                  },
              ]
            : []),
    ];
    return (
        <Stack gap={6}>
            {checks.map(({ state, text }) => (
                <Group key={text} gap={8} wrap="nowrap">
                    <Tooltip
                        label={
                            state === 'ok'
                                ? 'Fine'
                                : state === 'attention'
                                  ? 'Worth a look before publishing'
                                  : 'Not known yet'
                        }
                    >
                        <MantineIcon
                            icon={CHECK_ICONS[state]}
                            size={16}
                            color={CHECK_COLORS[state]}
                        />
                    </Tooltip>
                    <Text fz="sm">{text}</Text>
                </Group>
            ))}
        </Stack>
    );
};

/** What pressing Publish does, said before the dialog: who sees it, what moves, and the way back. */
export const PublishEffect: FC<{
    projectUuid: string;
    asPullRequest: boolean;
}> = ({ projectUuid, asPullRequest }) => {
    const { data } = useSemanticLayerDraftUsage(projectUuid);
    const charts = new Set(
        (data?.fields ?? []).flatMap(({ charts: read }) =>
            read.map(({ uuid }) => uuid),
        ),
    ).size;
    return (
        <Text fz="xs" c="dimmed">
            {asPullRequest
                ? 'Publishing opens a pull request. Nothing is live until it merges.'
                : 'Publishing goes live for everyone on this project.'}
            {charts > 0
                ? ` ${charts} saved ${charts === 1 ? 'chart' : 'charts'} will show different numbers.`
                : ''}
            {asPullRequest ? '' : " Undo is on each model's History tab."}
        </Text>
    );
};

const EXPLAINER_KEY = 'semantic-studio-draft-explainer-seen';

const hasSeenExplainer = (): boolean => {
    try {
        return localStorage.getItem(EXPLAINER_KEY) !== null;
    } catch {
        return true;
    }
};

/** Shown until dismissed, the first time someone has changes in development. */
export const DraftExplainer: FC = () => {
    const [isSeen, setIsSeen] = useState(hasSeenExplainer);
    if (isSeen) return null;
    return (
        <Paper variant="dotted" p="sm">
            <Group gap="sm" justify="space-between" wrap="nowrap">
                <Text fz="sm">
                    These changes are in development: only you see them, and
                    nothing is live until you publish. Try them on real charts
                    first with Try my changes.
                </Text>
                <Button
                    size="compact-xs"
                    variant="default"
                    flex="none"
                    onClick={() => {
                        try {
                            localStorage.setItem(EXPLAINER_KEY, '1');
                        } catch {
                            // Without storage it shows again next time.
                        }
                        setIsSeen(true);
                    }}
                >
                    Got it
                </Button>
            </Group>
        </Paper>
    );
};
