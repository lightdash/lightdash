/** What a person needs around a draft before publishing it: what happened under it, who else is in it, each change in order, and what it does to the numbers. */
import {
    diffModelDocuments,
    getItemId,
    readModelPart,
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
    Badge,
    Box,
    Button,
    Center,
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
    IconArrowsDiff,
    IconInfoCircle,
    IconTable,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { upperFirst } from 'es-toolkit/compat';
import { useState, type FC, type ReactNode } from 'react';
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
    CHANGE_KIND_LABELS,
    describeModelChange,
    getChangeKind,
    summarizeModelChanges,
} from './modelCode';
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

/** A part's name as a person would say it; a nested part keeps its path. */
const PartName: FC<{ path: string }> = ({ path }) =>
    path.includes('.') ? (
        <Text fz="xs" fw={500} ff="monospace" truncate>
            {path}
        </Text>
    ) : (
        <Text fz="xs" fw={500} truncate>
            {path === ''
                ? 'The whole model'
                : upperFirst(path.replaceAll('_', ' '))}
        </Text>
    );

/** Drops the draft's change to one part, so what is live stands. */
const KeepTheirsButton: FC<{
    projectUuid: string;
    model: string;
    path: string;
    publisher: string | null;
}> = ({ projectUuid, model, path, publisher }) => {
    const takeLive = useTakeLiveDraftPart(projectUuid);
    return (
        <Button
            size="compact-xs"
            variant="default"
            flex="none"
            aria-label={
                publisher ? `Keep ${publisher}'s version` : 'Keep their version'
            }
            loading={takeLive.isLoading}
            onClick={() => takeLive.mutate({ model, path })}
        >
            Keep
        </Button>
    );
};

/** Keeps the draft over what was published, for every part of the model still contested. */
const KeepMineButton: FC<{
    projectUuid: string;
    model: SemanticLayerDraftModel;
    label: string;
    ariaLabel: string | null;
}> = ({ projectUuid, model, label, ariaLabel }) => {
    const keep = useKeepDraftModel(projectUuid);
    return (
        <Button
            size="compact-xs"
            variant="default"
            flex="none"
            aria-label={ariaLabel ?? undefined}
            loading={keep.isLoading}
            onClick={() =>
                keep.mutate({
                    model: model.model,
                    liveVersion: model.reconciliation?.liveVersion ?? null,
                })
            }
        >
            {label}
        </Button>
    );
};

/** A word without the punctuation around it, so a comma added after it does not count as a change. */
const toBareWord = (word: string): string =>
    word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** A version of a part with the words its start did not have marked, so the difference is the first thing read. */
const ChangedWords: FC<{ value: string; base: string | null }> = ({
    value,
    base,
}) => {
    if (base === null) return value;
    // ponytail: words compared as a set, so a moved or repeated word is not marked; use a real diff if that misleads.
    const known = new Set(base.split(/\s+/).map(toBareWord));
    return value.split(/(\s+)/).map((word, index) =>
        toBareWord(word) === '' || known.has(toBareWord(word)) ? (
            word
        ) : (
            <mark key={index} className={classes.changed}>
                {word}
            </mark>
        ),
    );
};

/** Whether a part's value is YAML to read as code, and not a sentence or a name to read as words. */
const isYaml = (value: string): boolean =>
    value.includes('\n') || /^[\w-]+:(\s|$)/.test(value);

/** A part's value in the face it is read in: code for YAML, the body face for words. */
const PartValue: FC<{ value: string; children: ReactNode }> = ({
    value,
    children,
}) =>
    isYaml(value) ? (
        <Box component="pre" className={classes.code}>
            {children}
        </Box>
    ) : (
        <Text fz="sm" className={classes.prose}>
            {children}
        </Text>
    );

/** One of the two versions a contested part can end up as: whose it is, with a Keep button whose tooltip says what keeping it does. */
const ConflictOption: FC<{
    title: string;
    state: string;
    tone: 'live' | 'draft';
    /** Null when this side removed the part. */
    value: string | null;
    base: string | null;
    outcome: string;
    action: ReactNode;
}> = ({ title, state, tone, value, base, outcome, action }) => (
    <Box className={classes.option}>
        <Group gap="xs" wrap="nowrap" justify="space-between">
            <Text fz="xs" truncate>
                <Box
                    component="span"
                    className={classes.tone}
                    data-tone={tone}
                />
                <Text span fz="xs" fw={500}>
                    {title}
                </Text>
                <Text span fz="xs" c="dimmed">
                    {' · '}
                    {state}
                </Text>
            </Text>
            {action ? (
                <Tooltip label={outcome} withinPortal maw={240} multiline>
                    <Box flex="none">{action}</Box>
                </Tooltip>
            ) : null}
        </Group>
        {value === null ? (
            <Text fz="sm" c="dimmed">
                Removed
            </Text>
        ) : (
            <PartValue value={value}>
                <ChangedWords value={value} base={base} />
            </PartValue>
        )}
    </Box>
);

/** One part two people changed: what it said before, then each person's version with the button that keeps it. */
const ConflictSides: FC<{
    projectUuid: string;
    model: SemanticLayerDraftModel;
    conflict: SemanticLayerDraftConflict;
    /** When theirs went live, in words. */
    publishedAgo: string;
    /** False when it is the only contested part: the notice names it, and keeping the draft is offered right here. */
    isOneOfSeveral: boolean;
}> = ({ projectUuid, model, conflict, publishedAgo, isOneOfSeveral }) => {
    const publisher = model.publishedSince?.by ?? null;
    return (
        <Stack gap="xs" className={classes.conflict}>
            <Box>
                {isOneOfSeveral ? <PartName path={conflict.path} /> : null}
                {conflict.base !== null && isYaml(conflict.base) ? (
                    <>
                        <Text fz="xs" c="dimmed">
                            Originally
                        </Text>
                        <Box
                            component="pre"
                            className={classes.code}
                            data-before
                        >
                            {conflict.base}
                        </Box>
                    </>
                ) : (
                    <Text fz="xs" c="dimmed">
                        Originally:{' '}
                        {conflict.base === null
                            ? 'not set'
                            : `“${conflict.base}”`}
                    </Text>
                )}
            </Box>
            <Box className={classes.options}>
                <ConflictOption
                    title={publisher ?? 'Someone else'}
                    state={`live ${publishedAgo}`}
                    tone="live"
                    value={conflict.live}
                    base={conflict.base}
                    outcome={
                        conflict.path === ''
                            ? 'Everything you changed on this model leaves your draft.'
                            : 'Your edit to this part leaves your draft.'
                    }
                    action={
                        <KeepTheirsButton
                            projectUuid={projectUuid}
                            model={model.model}
                            path={conflict.path}
                            publisher={publisher}
                        />
                    }
                />
                <ConflictOption
                    title="You"
                    state="your draft"
                    tone="draft"
                    value={conflict.mine}
                    base={conflict.base}
                    outcome={
                        isOneOfSeveral
                            ? 'Kept with the button under this list.'
                            : 'Yours replaces theirs when you publish.'
                    }
                    action={
                        isOneOfSeveral ? null : (
                            <KeepMineButton
                                projectUuid={projectUuid}
                                model={model}
                                label="Keep"
                                ariaLabel="Keep your version"
                            />
                        )
                    }
                />
            </Box>
        </Stack>
    );
};

/** The one contested part, named inside a sentence. */
const ContestedPart: FC<{ path: string }> = ({ path }) => {
    if (path === '') return 'this model';
    if (!path.includes('.')) {
        return `this model's ${path.replaceAll('_', ' ')}`;
    }
    return (
        <>
            <Text span ff="monospace">
                {path}
            </Text>{' '}
            on this model
        </>
    );
};

/** One notice on a model's card: its icon sits in the column the card's own icon uses, so the words line up with the title. */
const NoticeRow: FC<{
    icon: typeof IconUsers;
    color: 'yellow' | 'dimmed';
    children: ReactNode;
}> = ({ icon, color, children }) => (
    <Group gap="xs" wrap="nowrap" align="flex-start">
        <Center w={24} h={18} flex="none">
            <MantineIcon icon={icon} size={16} color={color} />
        </Center>
        {children}
    </Group>
);

/** What happened to a model outside this draft: a publish under it, or someone else's work in it. */
export const ModelNotices: FC<{
    projectUuid: string;
    model: SemanticLayerDraftModel;
}> = ({ projectUuid, model }) => {
    const publishedAgo = useTimeAgo(model.publishedSince?.at ?? new Date());
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
                <Stack gap="xs" data-conflict>
                    <NoticeRow icon={IconAlertTriangle} color="yellow">
                        <Tooltip
                            label="Choose which to keep. You can publish once you have."
                            position="top-start"
                            withinPortal
                        >
                            <Text fz="xs" w="fit-content">
                                <Text span fw={600}>
                                    {publisher}
                                </Text>{' '}
                                published a change to{' '}
                                {conflicts.length === 1 ? (
                                    <ContestedPart path={conflicts[0].path} />
                                ) : (
                                    `${conflicts.length} parts of this model`
                                )}{' '}
                                that your draft also edits.
                            </Text>
                        </Tooltip>
                    </NoticeRow>
                    {conflicts.map((conflict) => (
                        <ConflictSides
                            key={conflict.path}
                            projectUuid={projectUuid}
                            model={model}
                            conflict={conflict}
                            publishedAgo={publishedAgo}
                            isOneOfSeveral={conflicts.length > 1}
                        />
                    ))}
                    {conflicts.length > 1 ? (
                        <Box className={classes.conflictActions}>
                            <KeepMineButton
                                projectUuid={projectUuid}
                                model={model}
                                label={`Keep mine for all ${conflicts.length} parts`}
                                ariaLabel={null}
                            />
                        </Box>
                    ) : null}
                </Stack>
            ) : null}
            {publishedUnder && conflicts.length === 0 ? (
                <NoticeRow icon={IconGitMerge} color="dimmed">
                    <Text fz="xs" c="dimmed">
                        <Text span fw={600}>
                            {publisher}
                        </Text>{' '}
                        published a change to this model {publishedAgo}, after
                        you started
                        {merged.length > 0
                            ? `, in ${listNames(merged.map(describePath))}, which you did not touch`
                            : ''}
                        . Your changes are shown on top of it.
                    </Text>
                </NoticeRow>
            ) : null}
            {model.alsoChanging.map(({ name, paths }) => (
                <NoticeRow key={name} icon={IconUsers} color="dimmed">
                    <Text fz="xs" c="dimmed">
                        <Text span fw={600}>
                            {name}
                        </Text>{' '}
                        is also changing{' '}
                        {paths.length > 0
                            ? listNames(paths.map(describePath))
                            : 'this model'}
                        , in development.
                    </Text>
                </NoticeRow>
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
    /** What each model is called, by its name. */
    labels: Map<string, string>;
    onAskAgent: (prompt: string) => void;
}> = ({ projectUuid, index, count, change, labels, onAskAgent }) => {
    const discard = useDiscardDraftChange(projectUuid);
    const move = useMoveDraftChange(projectUuid);
    const ago = useTimeAgo(change.createdAt);
    const failed = change.models.filter(({ error }) => error !== null);
    const named = (models: { model: string }[]) =>
        listNames(models.map(({ model }) => labels.get(model) ?? model));
    return (
        <Group gap="sm" wrap="nowrap" className={classes.change}>
            <Text fz="xs" c="dimmed" className={classes.changeIndex}>
                {index + 1}
            </Text>
            <Box miw={0} flex={1}>
                <Text fz="sm" truncate>
                    {change.question ?? 'Changed during review'}
                </Text>
                <Text fz="xs" c={failed.length > 0 ? 'red' : 'dimmed'} truncate>
                    {failed.length > 0
                        ? `No longer applies to ${named(failed)}`
                        : `${named(change.models)} · ${ago}`}
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
                            void discard
                                .mutateAsync(change.draftChangeUuid)
                                .then(() =>
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
                                )
                                // The failure is already shown as a toast.
                                .catch(() => undefined)
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

/** The draft as the ordered list it is, shown once the order matters: with several changes, or one that stopped applying. */
export const ChangeQueue: FC<{
    projectUuid: string;
    draft: SemanticLayerDraft;
    onAskAgent: (prompt: string) => void;
}> = ({ projectUuid, draft, onAskAgent }) => {
    const hasFailure = draft.changes.some(({ models }) =>
        models.some(({ error }) => error !== null),
    );
    if (draft.changes.length < 2 && !hasFailure) return null;
    const labels = new Map(
        draft.models.map((entry) => [
            entry.model,
            describeModelChange(entry.model, entry).title,
        ]),
    );
    return (
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
                    labels={labels}
                    onAskAgent={onAskAgent}
                />
            ))}
        </Paper>
    );
};

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
    /** What the draft holds, so totals are read again when it changes. */
    draftKey: string,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<Totals, ApiError>({
        queryKey: [
            'semantic-layer-draft-totals',
            projectUuid,
            exploreName,
            side,
            metricIds,
            draftKey,
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
    const draftKey = draft.changes
        .map(({ draftChangeUuid }) => draftChangeUuid)
        .join();
    const development = useTotals(
        projectUuid,
        model.model,
        ids,
        'development',
        isAsked && ids.length > 0,
        draftKey,
    );
    // A metric the draft adds does not exist live, and asking for it there fails the whole query.
    const added = diffModelDocuments(model.contentBefore, model.contentAfter)
        .filter(({ kind }) => kind === 'added')
        .map(({ path }) => path);
    const liveIds = metrics
        .filter(
            ({ name }) =>
                !added.some(
                    (path) =>
                        path.endsWith(`metrics.${name}`) ||
                        readModelPart(
                            model.contentAfter,
                            `${path}.metrics.${name}`,
                        ) !== null,
                ),
        )
        .map((metric) => getItemId(metric));
    const live = useTotals(
        projectUuid,
        model.model,
        liveIds,
        'live',
        isAsked && liveIds.length > 0 && !isNewModel,
        draftKey,
    );
    if (metrics.length === 0) return null;
    if (!isAsked) {
        return (
            <Group className={classes.compare} gap="xs">
                <Tooltip
                    label={`${metrics.length === 1 ? '1 metric' : `${metrics.length} metrics`}, ${isNewModel ? 'one warehouse query' : 'one warehouse query each side'}.`}
                >
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={
                            <MantineIcon icon={IconArrowsDiff} size={14} />
                        }
                        onClick={() => setIsAsked(true)}
                    >
                        {isNewModel
                            ? 'Run the totals'
                            : 'Compare totals with live'}
                    </Button>
                </Tooltip>
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
                        <Table.Th ta="right">My changes</Table.Th>
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
            {live.isError ? (
                <Text fz="xs" c="dimmed">
                    Could not run these live: {live.error.error.message}
                </Text>
            ) : null}
            {development.isError ? (
                <Text fz="xs" c="dimmed">
                    Could not run these in development:{' '}
                    {development.error.error.message}
                </Text>
            ) : null}
        </Box>
    );
};

type CheckState = 'ok' | 'attention' | 'unknown' | 'note';

const CHECK_ICONS = {
    ok: IconCircleCheck,
    attention: IconAlertTriangle,
    unknown: IconCircleDashed,
    note: IconUsers,
};
const CHECK_COLORS = {
    ok: 'green',
    attention: 'orange',
    unknown: 'dimmed',
    note: 'dimmed',
};

const labelOf = (entry: SemanticLayerDraftModel): string =>
    describeModelChange(entry.model, entry).title;

/** What is worth knowing at the moment of publishing, each as one line. */
export const PublishChecklist: FC<{
    draft: SemanticLayerDraft;
    model: string | null;
    /** Saved content the draft breaks; null while that is not known. */
    breaks: number | null;
}> = ({ draft, model, breaks }) => {
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
                  text: 'Saved charts and dashboards have not been checked for breaks yet',
              }
            : breaks > 0
              ? {
                    state: 'attention',
                    text: `${breaks} saved ${breaks === 1 ? 'chart or dashboard stops' : 'charts or dashboards stop'} working`,
                }
              : { state: 'ok', text: 'No saved chart or dashboard breaks' },
        ...(conflicted.length > 0
            ? [
                  {
                      state: 'attention' as const,
                      text: `${listNames(conflicted.map(labelOf))} changed live in parts you changed too. Choose which to keep in the review`,
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
                      text: movedUnder.every(
                          (entry) => entry.reconciliation?.state === 'merged',
                      )
                          ? `${listNames(movedUnder.map(labelOf))} changed live after you started, outside what you changed. Yours goes on top`
                          : `${listNames(movedUnder.map(labelOf))} changed live after you started, and it could not be set against yours. Look at it in the review first`,
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
                      state: 'note' as const,
                      text: `${listNames(others)} ${others.length === 1 ? 'has' : 'have'} unpublished changes to the same models. Publishing leaves theirs as they are`,
                  },
              ]
            : []),
    ];
    const passed = checks.filter(({ state }) => state === 'ok');
    const shown = checks.filter(({ state }) => state !== 'ok');
    return (
        <Stack gap={6}>
            {shown.map(({ state, text }) => (
                <Group key={text} gap={8} wrap="nowrap" align="flex-start">
                    <Box flex="none" display="flex" mt={2}>
                        <MantineIcon
                            icon={CHECK_ICONS[state]}
                            size={16}
                            color={CHECK_COLORS[state]}
                        />
                    </Box>
                    <Text fz="sm">{text}</Text>
                </Group>
            ))}
            {passed.length > 0 ? (
                <Group gap={8} wrap="nowrap" align="flex-start">
                    <Box flex="none" display="flex" mt={2}>
                        <MantineIcon
                            icon={CHECK_ICONS.ok}
                            size={16}
                            color={CHECK_COLORS.ok}
                        />
                    </Box>
                    <Text fz="sm" c="dimmed">
                        {passed.map(({ text }) => text).join('. ')}.
                    </Text>
                </Group>
            ) : null}
        </Stack>
    );
};

const Section: FC<{ title: string; children: ReactNode }> = ({
    title,
    children,
}) => (
    <Stack gap={6}>
        <Text fz="xs" fw={500} c="dimmed">
            {title}
        </Text>
        {children}
    </Stack>
);

/** What a publish carries, in the words of the models and charts it touches. */
export const PublishSummary: FC<{
    projectUuid: string;
    draft: SemanticLayerDraft;
    model: string | null;
}> = ({ projectUuid, draft, model }) => {
    const { data: usage } = useSemanticLayerDraftUsage(projectUuid);
    const inScope = (name: string) => model === null || name === model;
    const models = draft.models.filter((entry) => inScope(entry.model));
    const read = (usage?.fields ?? []).filter((field) => inScope(field.model));
    return (
        <>
            <Section title="Going live">
                {models.map((entry) => (
                    <Group
                        key={entry.model}
                        gap="sm"
                        wrap="nowrap"
                        align="flex-start"
                    >
                        <MantineIcon
                            icon={IconTable}
                            size={16}
                            color="dimmed"
                        />
                        <Box miw={0} flex={1}>
                            <Group gap={6} wrap="nowrap">
                                <Text fz="sm" fw={500} truncate>
                                    {labelOf(entry)}
                                </Text>
                                <Badge size="xs">
                                    {CHANGE_KIND_LABELS[getChangeKind(entry)]}
                                </Badge>
                            </Group>
                            <Text fz="xs" c="dimmed">
                                {summarizeModelChanges(entry.model, [
                                    // A part changed twice reads once, as its last change.
                                    ...new Map(
                                        draft.changes
                                            .flatMap((change) => change.models)
                                            .filter(
                                                (item) =>
                                                    item.model === entry.model,
                                            )
                                            .flatMap(({ changes }) => changes)
                                            .map((change) => [
                                                change.path,
                                                change,
                                            ]),
                                    ).values(),
                                ]).join('. ')}
                            </Text>
                        </Box>
                    </Group>
                ))}
            </Section>
            <Section title="What people will notice">
                {read.length === 0 ? (
                    <Text fz="sm" c="dimmed">
                        {usage
                            ? 'No saved chart reads what you changed.'
                            : 'Looking for saved charts that read what you changed.'}
                    </Text>
                ) : (
                    read.map((field) => (
                        <Box key={field.fieldId}>
                            <Text fz="sm">
                                <Text span fw={500}>
                                    {field.label}
                                </Text>{' '}
                                {field.kind === 'removed'
                                    ? 'is removed'
                                    : 'is defined differently'}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {[
                                    field.charts.length > 0
                                        ? `${listNames(field.charts.map(({ name }) => name))} ${field.kind === 'removed' ? (field.charts.length === 1 ? 'stops working' : 'stop working') : field.charts.length === 1 ? 'shows a different number' : 'show different numbers'}`
                                        : null,
                                    field.dashboards > 0
                                        ? `on ${field.dashboards} ${field.dashboards === 1 ? 'dashboard' : 'dashboards'}`
                                        : null,
                                    field.scheduledDeliveries > 0
                                        ? `in ${field.scheduledDeliveries} scheduled ${field.scheduledDeliveries === 1 ? 'delivery' : 'deliveries'}`
                                        : null,
                                ]
                                    .filter(Boolean)
                                    .join(', ')}
                            </Text>
                        </Box>
                    ))
                )}
            </Section>
        </>
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
export const DraftExplainer: FC<{ asPullRequest: boolean }> = ({
    asPullRequest,
}) => {
    const [isSeen, setIsSeen] = useState(hasSeenExplainer);
    if (isSeen) return null;
    return (
        <Group className={classes.hint} gap="sm" wrap="nowrap">
            <MantineIcon icon={IconInfoCircle} size={16} color="dimmed" />
            <Text fz="xs" flex={1}>
                Only you see these changes.{' '}
                {asPullRequest
                    ? 'Publishing opens a pull request, and nothing is live until it merges.'
                    : 'Publishing makes them live for everyone on this project.'}{' '}
                Use View my changes above to try them on your charts first.
            </Text>
            <Button
                size="compact-xs"
                variant="subtle"
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
    );
};
